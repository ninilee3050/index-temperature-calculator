let macroCache = null;
const cacheMs = 5 * 60 * 1000;

export async function getMacroData() {
  if (process.env.MOCK_MACRO === "1") {
    return {
      ok: true,
      updatedAt: new Date().toISOString(),
      values: {
        kospi: dataPoint(2615.03, "Mock", "2026-04-27"),
        nasdaq: dataPoint(20177.66, "Mock", "2026-04-27"),
        usdKrw: dataPoint(1471.07, "Mock", "2026-04-27"),
        dollarIndex: dataPoint(98.23, "Mock", "2026-04-27"),
        spread10y2y: dataPoint(0.55, "Mock", "2026-04-27"),
        spread10y3m: dataPoint(1.02, "Mock", "2026-04-27"),
        fearGreed: {
          value: 66,
          rating: "greed",
          source: "Mock",
          date: "2026-04-27",
          previousClose: 66,
          previousWeek: 71,
          previousMonth: 14,
          previousYear: 35,
        },
      },
      errors: [],
    };
  }

  const now = Date.now();
  if (macroCache && now - macroCache.cachedAt < cacheMs) {
    return { ...macroCache.payload, cached: true };
  }

  const tasks = {
    kospi: () => fetchYahooQuote("^KS11"),
    nasdaq: () => fetchYahooQuote("^IXIC"),
    usdKrw: () => fetchYahooQuote("KRW=X"),
    dollarIndex: () => fetchDollarIndex(),
    spread10y2y: () => fetchFredLatestFromPage("T10Y2Y"),
    spread10y3m: () => fetchFredLatestFromPage("T10Y3M"),
    fearGreed: () => fetchCnnFearGreed(),
  };

  const entries = await Promise.all(
    Object.entries(tasks).map(async ([key, task]) => {
      try {
        return [key, await task(), null];
      } catch (error) {
        return [key, null, String(error.message || error)];
      }
    }),
  );

  const values = {};
  const errors = [];
  for (const [key, value, error] of entries) {
    if (value) values[key] = value;
    if (error) errors.push({ key, error });
  }

  const payload = {
    ok: Object.keys(values).length > 0,
    updatedAt: new Date().toISOString(),
    values,
    errors,
  };
  macroCache = { cachedAt: now, payload };
  return payload;
}

export async function getYieldCycles() {
  const series = [
    ["spread10y2y", "T10Y2Y", "10Y-2Y"],
    ["spread10y3m", "T10Y3M", "10Y-3M"],
  ];
  const entries = await Promise.all(
    series.map(async ([key, id, label]) => {
      try {
        const rows = await fetchFredSeries(id);
        return [key, analyzeYieldCycle(rows, id, label), null];
      } catch (error) {
        return [key, null, String(error.message || error)];
      }
    }),
  );
  const values = {};
  const errors = [];
  for (const [key, value, error] of entries) {
    if (value) values[key] = value;
    if (error) errors.push({ key, error });
  }
  return {
    ok: Object.keys(values).length > 0,
    updatedAt: new Date().toISOString(),
    values,
    errors,
  };
}

async function fetchDollarIndex() {
  try {
    return await fetchYahooQuote("DX-Y.NYB");
  } catch {
    return await fetchStooqDollarIndex();
  }
}

async function fetchCnnFearGreed() {
  const json = await fetchJson("https://production.dataviz.cnn.io/index/fearandgreed/graphdata");
  const data = json?.fear_and_greed;
  const score = Number(data?.score);
  if (!Number.isFinite(score)) {
    throw new Error("CNN Fear & Greed score missing");
  }
  return {
    value: Math.round(score),
    rawValue: score,
    rating: data?.rating || ratingFromFearGreed(score),
    source: "CNN Fear & Greed",
    date: data?.timestamp ? new Date(data.timestamp).toISOString().slice(0, 10) : null,
    timestamp: data?.timestamp || null,
    previousClose: roundMaybe(data?.previous_close),
    previousWeek: roundMaybe(data?.previous_1_week),
    previousMonth: roundMaybe(data?.previous_1_month),
    previousYear: roundMaybe(data?.previous_1_year),
  };
}

function ratingFromFearGreed(score) {
  if (score <= 24) return "extreme fear";
  if (score <= 44) return "fear";
  if (score <= 55) return "neutral";
  if (score <= 75) return "greed";
  return "extreme greed";
}

function roundMaybe(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number) : null;
}

async function fetchYahooQuote(symbol) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
    symbol,
  )}?range=5d&interval=1d`;
  const json = await fetchJson(url);
  const result = json?.chart?.result?.[0];
  const meta = result?.meta;
  const close = result?.indicators?.quote?.[0]?.close?.filter(Number.isFinite)?.at(-1);
  const timestamp = result?.timestamp?.at(-1);
  const value = Number(meta?.regularMarketPrice ?? close);
  if (!Number.isFinite(value)) {
    throw new Error(`Yahoo value missing for ${symbol}`);
  }
  return dataPoint(
    value,
    `Yahoo Finance ${symbol}`,
    timestamp ? new Date(timestamp * 1000).toISOString().slice(0, 10) : null,
  );
}

async function fetchStooqDollarIndex() {
  const csv = await fetchText("https://stooq.com/q/l/?s=dx.f&f=sd2t2ohlcv&h&e=csv");
  const rows = parseCsv(csv);
  const row = rows[1];
  const close = Number(row?.[6]);
  if (!Number.isFinite(close)) {
    throw new Error("Stooq dollar index value missing");
  }
  return dataPoint(close, "Stooq DX.F", row?.[1] || null);
}

async function fetchFredLatest(seriesId) {
  const rows = await fetchFredSeries(seriesId);
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    const { date, value } = rows[index];
    if (date && Number.isFinite(value)) {
      return dataPoint(value, `FRED ${seriesId}`, date);
    }
  }
  throw new Error(`FRED value missing for ${seriesId}`);
}

async function fetchFredLatestFromPage(seriesId) {
  const html = await fetchText(`https://fred.stlouisfed.org/series/${seriesId}`);
  const match = html.match(
    /(\d{4}-\d{2}-\d{2}):\s*<span class="series-meta-observation-value">([^<]+)<\/span>/,
  );
  const value = Number(match?.[2]?.replace(/,/g, ""));
  if (!match?.[1] || !Number.isFinite(value)) {
    throw new Error(`FRED latest value missing for ${seriesId}`);
  }
  return dataPoint(value, `FRED ${seriesId}`, match[1]);
}

async function fetchFredSeries(seriesId) {
  const csv = await fetchText(`https://fred.stlouisfed.org/graph/fredgraph.csv?id=${seriesId}`);
  const rows = parseCsv(csv);
  return rows
    .slice(1)
    .map(([date, raw]) => ({ date, value: raw?.trim() ? Number(raw) : Number.NaN }))
    .filter((row) => row.date && Number.isFinite(row.value));
}

function analyzeYieldCycle(rows, seriesId, label) {
  const latest = rows.at(-1);
  const negativeRuns = [];
  let runStart = null;
  for (let index = 0; index < rows.length; index += 1) {
    if (rows[index].value < 0 && runStart === null) {
      runStart = index;
    }
    if ((rows[index].value >= 0 || index === rows.length - 1) && runStart !== null) {
      const endIndex = rows[index].value >= 0 ? index - 1 : index;
      const turnIndex = rows[index].value >= 0 ? index : null;
      negativeRuns.push({ startIndex: runStart, endIndex, turnIndex });
      runStart = null;
    }
  }

  const majorRuns = negativeRuns.filter((run) => {
    if (run.turnIndex === null) return false;
    return dayDiff(rows[run.startIndex].date, rows[run.endIndex].date) >= 60;
  });
  const selectedRun = majorRuns.at(-1);
  if (!selectedRun) {
    throw new Error(`No major negative-to-positive turn found for ${seriesId}`);
  }
  const latestCross = [...negativeRuns].reverse().find((run) => run.turnIndex !== null);
  const start = rows[selectedRun.startIndex];
  const turn = rows[selectedRun.turnIndex];
  const positiveMonths = monthDiff(turn.date, new Date().toISOString().slice(0, 10));
  const inversionMonths = monthDiff(start.date, turn.date);
  return {
    seriesId,
    label,
    source: `FRED ${seriesId}`,
    latestDate: latest.date,
    latestValue: latest.value,
    inversionStartDate: start.date,
    inversionStartValue: start.value,
    positiveTurnDate: turn.date,
    positiveTurnValue: turn.value,
    inversionMonths,
    positiveMonths,
    comparison: positiveMonths - inversionMonths,
    latestCrossDate: latestCross?.turnIndex !== null ? rows[latestCross.turnIndex].date : null,
  };
}

function dayDiff(start, end) {
  const a = new Date(`${start}T00:00:00`);
  const b = new Date(`${end}T00:00:00`);
  return Math.floor((b.getTime() - a.getTime()) / 86400000);
}

function monthDiff(start, end) {
  const a = new Date(`${start}T00:00:00`);
  const b = new Date(`${end}T00:00:00`);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null;
  let months = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
  if (b.getDate() < a.getDate()) months -= 1;
  return Math.max(months, 0);
}

async function fetchJson(url) {
  return JSON.parse(await fetchText(url));
}

async function fetchText(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36",
      },
    });
    if (!response.ok) {
      throw new Error(`${response.status} ${response.statusText} from ${url}`);
    }
    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}

function parseCsv(text) {
  return text
    .trim()
    .split(/\r?\n/)
    .map((line) => line.split(",").map((cell) => cell.replace(/^"|"$/g, "")));
}

function dataPoint(value, source, date) {
  return { value, source, date };
}
