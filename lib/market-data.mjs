let macroCache = null;
let marketBasisCache = null;
const cacheMs = 5 * 60 * 1000;
const marketBasisCacheMs = 6 * 60 * 60 * 1000;

export async function getMacroData() {
  if (process.env.MOCK_MACRO === "1") {
    return {
      ok: true,
      updatedAt: new Date().toISOString(),
      values: {
        kospi: dataPoint(2615.03, "Mock", "2026-04-27"),
        sp500: dataPoint(7392.49, "Mock", "2026-07-28"),
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
    sp500: () => fetchYahooQuote("^GSPC"),
    usdKrw: () => fetchYahooQuote("KRW=X"),
    dollarIndex: () => fetchDollarIndex(),
    spread10y2y: () => fetchFredLatestRecent("T10Y2Y"),
    spread10y3m: () => fetchFredLatestRecent("T10Y3M"),
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
  if (errors.length === 0) {
    macroCache = { cachedAt: now, payload };
  }
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

export async function getMarketBasisData() {
  if (process.env.MOCK_MACRO === "1") {
    return {
      ok: true,
      updatedAt: new Date().toISOString(),
      values: {
        korea: {
          ...marketBasis("2021-06-25", 3316.08, "2022-09-30", 2134.77, "Mock"),
          risePeakDate: "2026-04-27",
          risePeakValue: 2615.03,
          fallPeakDate: "2022-09-30",
          fallPeakValue: 2134.77,
        },
        us: {
          ...marketBasis("2020-02-19", 3393.52, "2020-03-23", 2191.86, "Mock"),
          risePeakDate: "2026-06-02",
          risePeakValue: 7620.9,
          fallPeakDate: "2020-03-23",
          fallPeakValue: 2191.86,
        },
      },
      errors: [],
    };
  }

  const now = Date.now();
  if (marketBasisCache && now - marketBasisCache.cachedAt < marketBasisCacheMs) {
    return { ...marketBasisCache.payload, cached: true };
  }

  const markets = [
    ["korea", "^KS11"],
    ["us", "^GSPC"],
  ];
  const entries = await Promise.all(
    markets.map(async ([key, symbol]) => {
      try {
        const rows = await fetchYahooHistory(symbol);
        const basis = detectMajorVBottom(rows);
        if (!basis) throw new Error(`No confirmed major V-bottom for ${symbol}`);
        return [
          key,
          { ...basis, ...findBasisExtremes(rows, basis), source: `Yahoo Finance ${symbol}` },
          null,
        ];
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
  if (errors.length === 0) marketBasisCache = { cachedAt: now, payload };
  return payload;
}

async function fetchYahooHistory(symbol) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
    symbol,
  )}?range=10y&interval=1d`;
  const json = await fetchJson(url);
  const result = json?.chart?.result?.[0];
  const quote = result?.indicators?.quote?.[0];
  return (result?.timestamp || [])
    .map((timestamp, index) => ({
      date: new Date(timestamp * 1000).toISOString().slice(0, 10),
      high: Number(quote?.high?.[index]),
      low: Number(quote?.low?.[index]),
      close: Number(quote?.close?.[index]),
    }))
    .filter(
      (row) =>
        row.date &&
        Number.isFinite(row.high) &&
        Number.isFinite(row.low) &&
        Number.isFinite(row.close) &&
        row.high > 0 &&
        row.low > 0 &&
        row.close > 0,
    );
}

export function detectMajorVBottom(
  dailyRows,
  { drawdown = 0.3, rebound = 0.2, confirmationMonths = 2, asOfDate = new Date().toISOString() } = {},
) {
  const months = aggregateMonthlyRows(dailyRows, asOfDate);
  if (!months.length) return null;

  let phase = "rise";
  let peak = pointFromMonth(months[0], "high");
  let trough = null;
  let troughIndex = -1;
  let confirmed = null;

  months.forEach((month, index) => {
    if (phase === "rise") {
      if (month.high > peak.value) peak = pointFromMonth(month, "high");
      if (month.low <= peak.value * (1 - drawdown)) {
        phase = "crash";
        trough = pointFromMonth(month, "low");
        troughIndex = index;
      }
      return;
    }

    if (month.low < trough.value) {
      trough = pointFromMonth(month, "low");
      troughIndex = index;
    }
    const completedMonthsAfterTrough = months
      .slice(troughIndex + 1, index + 1)
      .filter((item) => item.complete).length;
    const vBottomConfirmed =
      month.complete &&
      completedMonthsAfterTrough >= confirmationMonths &&
      month.close >= trough.value * (1 + rebound);
    if (!vBottomConfirmed) return;

    confirmed = marketBasis(
      peak.date,
      peak.value,
      trough.date,
      trough.value,
      "automatic-major-v",
      month.lastDate,
    );
    phase = "rise";
    const recoveryMonths = months.slice(troughIndex + 1, index + 1);
    peak = recoveryMonths.reduce(
      (highest, item) => (item.high > highest.value ? pointFromMonth(item, "high") : highest),
      pointFromMonth(recoveryMonths[0], "high"),
    );
    trough = null;
    troughIndex = -1;
  });

  return confirmed;
}

export function findBasisExtremes(dailyRows, basis) {
  const validRows = dailyRows.filter(
    (row) => Number.isFinite(row.high) && Number.isFinite(row.low) && row.high > 0 && row.low > 0,
  );
  const afterHigh = validRows.filter((row) => row.date >= basis.highDate);
  const afterLow = validRows.filter((row) => row.date >= basis.lowDate);
  const fallPeak = afterHigh.reduce(
    (lowest, row) => (!lowest || row.low < lowest.low ? row : lowest),
    null,
  );
  const risePeak = afterLow.reduce(
    (highest, row) => (!highest || row.high > highest.high ? row : highest),
    null,
  );
  if (!fallPeak || !risePeak) return {};
  return {
    risePeakDate: risePeak.date,
    risePeakValue: Number(risePeak.high.toFixed(2)),
    fallPeakDate: fallPeak.date,
    fallPeakValue: Number(fallPeak.low.toFixed(2)),
  };
}

function aggregateMonthlyRows(dailyRows, asOfDate) {
  const currentMonth = String(asOfDate).slice(0, 7);
  const grouped = new Map();
  [...dailyRows]
    .sort((a, b) => String(a.date).localeCompare(String(b.date)))
    .forEach((row) => {
      if (
        !row.date ||
        !Number.isFinite(row.high) ||
        !Number.isFinite(row.low) ||
        !Number.isFinite(row.close) ||
        row.high <= 0 ||
        row.low <= 0 ||
        row.close <= 0
      ) {
        return;
      }
      const key = row.date.slice(0, 7);
      const month = grouped.get(key) || {
        key,
        high: Number.NEGATIVE_INFINITY,
        highDate: null,
        low: Number.POSITIVE_INFINITY,
        lowDate: null,
        close: null,
        lastDate: null,
      };
      if (row.high > month.high) {
        month.high = row.high;
        month.highDate = row.date;
      }
      if (row.low < month.low) {
        month.low = row.low;
        month.lowDate = row.date;
      }
      month.close = row.close;
      month.lastDate = row.date;
      grouped.set(key, month);
    });
  return [...grouped.values()].map((month) => ({ ...month, complete: month.key < currentMonth }));
}

function pointFromMonth(month, kind) {
  return { date: month[`${kind}Date`], value: month[kind] };
}

function marketBasis(highDate, highValue, lowDate, lowValue, source, confirmedDate = null) {
  return {
    highDate,
    highValue: Number(Number(highValue).toFixed(2)),
    lowDate,
    lowValue: Number(Number(lowValue).toFixed(2)),
    source,
    confirmedDate,
  };
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

async function fetchFredLatestRecent(seriesId) {
  if (process.env.FRED_API_KEY) {
    try {
      return await fetchFredApiLatest(seriesId);
    } catch {
      // Fall through to the public CSV endpoint when an API key is present but temporarily fails.
    }
  }

  const start = dateDaysAgo(45);
  const rows = await fetchFredSeries(seriesId, `&cosd=${start}`, 4500);
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    const { date, value } = rows[index];
    if (date && Number.isFinite(value)) {
      return dataPoint(value, `FRED ${seriesId}`, date);
    }
  }
  throw new Error(`FRED value missing for ${seriesId}`);
}

async function fetchFredApiLatest(seriesId) {
  const params = new URLSearchParams({
    series_id: seriesId,
    file_type: "json",
    limit: "5",
    sort_order: "desc",
    api_key: process.env.FRED_API_KEY,
  });
  const json = await fetchJson(`https://api.stlouisfed.org/fred/series/observations?${params}`, 6000);
  const latest = json?.observations?.find((row) => row?.value && row.value !== ".");
  const value = Number(latest?.value);
  if (!latest?.date || !Number.isFinite(value)) {
    throw new Error(`FRED API value missing for ${seriesId}`);
  }
  return dataPoint(value, `FRED ${seriesId}`, latest.date);
}

async function fetchFredSeries(seriesId, query = "", timeoutMs = 12000) {
  const csv = await fetchText(
    `https://fred.stlouisfed.org/graph/fredgraph.csv?id=${seriesId}${query}`,
    timeoutMs,
  );
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

function dateDaysAgo(days) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

async function fetchJson(url, timeoutMs) {
  return JSON.parse(await fetchText(url, timeoutMs));
}

async function fetchText(url, timeoutMs = 12000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
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
