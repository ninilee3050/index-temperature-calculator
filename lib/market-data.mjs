let macroCache = null;
const historyCache = new Map();
const macroHistoryCache = new Map();
const macroHistoryCacheMs = 30 * 60 * 1000;
const macroHistoryRanges = {
  "3m": { days: 92, yahoo: "3mo" },
  "1y": { days: 366, yahoo: "1y" },
  "5y": { days: 1827, yahoo: "5y" },
};
const macroHistorySources = {
  usdKrw: { type: "yahoo", id: "KRW=X" },
  dollarIndex: { type: "yahoo", id: "DX-Y.NYB" },
  spread10y2y: { type: "fred", id: "T10Y2Y" },
  spread10y3m: { type: "fred", id: "T10Y3M" },
  fearGreed: { type: "cnn" },
};
const cacheMs = 5 * 60 * 1000;
const marketBasisCacheMs = 30 * 60 * 1000;
const historyStartSeconds = Date.UTC(1990, 0, 1) / 1000;

export async function getMacroData() {
  if (process.env.MOCK_MACRO === "1") {
    return {
      ok: true,
      updatedAt: new Date().toISOString(),
      values: {
        kospi: dataPoint(6023.66, "Mock", "2026-07-28"),
        sp500: dataPoint(7398.03, "Mock", "2026-07-28"),
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

export async function getMacroHistory(key, range = "1y") {
  if (!Object.hasOwn(macroHistorySources, String(key)) || !Object.hasOwn(macroHistoryRanges, String(range))) {
    return { ok: false, error: "Unknown key or range" };
  }
  const cacheKey = `${key}:${range}`;
  const now = Date.now();
  const cached = macroHistoryCache.get(cacheKey);
  if (cached && now - cached.cachedAt < macroHistoryCacheMs) return cached.payload;

  const source = macroHistorySources[key];
  const span = macroHistoryRanges[range];
  let result;
  if (source.type === "yahoo") result = await fetchYahooCloses(source.id, span.yahoo);
  else if (source.type === "fred") result = await fetchFredHistory(source.id, dateDaysAgo(span.days));
  else result = await fetchCnnFearGreedHistory(dateDaysAgo(span.days));
  if (!result.points.length) throw new Error(`No history for ${key}`);

  const payload = { ok: true, key, range, updatedAt: new Date().toISOString(), ...result };
  macroHistoryCache.set(cacheKey, { cachedAt: now, payload });
  return payload;
}

async function fetchYahooCloses(symbol, range) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
    symbol,
  )}?range=${range}&interval=1d`;
  const json = await fetchJson(url);
  const result = json?.chart?.result?.[0];
  const closes = result?.indicators?.quote?.[0]?.close || [];
  const points = (result?.timestamp || [])
    .map((timestamp, index) => ({
      date: new Date(timestamp * 1000).toISOString().slice(0, 10),
      value: Number(closes[index]),
    }))
    .filter((point) => Number.isFinite(point.value) && point.value > 0)
    .map((point) => ({ date: point.date, value: Number(point.value.toFixed(4)) }));
  return { source: `Yahoo Finance ${symbol}`, points: lastPointPerDate(points) };
}

async function fetchFredHistory(seriesId, startDate) {
  if (process.env.FRED_API_KEY) {
    try {
      const params = new URLSearchParams({
        series_id: seriesId,
        file_type: "json",
        observation_start: startDate,
        api_key: process.env.FRED_API_KEY,
      });
      const json = await fetchJson(`https://api.stlouisfed.org/fred/series/observations?${params}`, 8000);
      const points = (json?.observations || [])
        .map((row) => ({ date: row?.date, value: row?.value === "." ? Number.NaN : Number(row?.value) }))
        .filter((point) => point.date && Number.isFinite(point.value));
      if (points.length) return { source: `FRED ${seriesId}`, points };
    } catch {
      // Fall through to the public CSV endpoint.
    }
  }
  const rows = await fetchFredSeries(seriesId, `&cosd=${startDate}`);
  return { source: `FRED ${seriesId}`, points: rows.map(({ date, value }) => ({ date, value })) };
}

async function fetchCnnFearGreedHistory(startDate) {
  const json = await fetchJson(`https://production.dataviz.cnn.io/index/fearandgreed/graphdata/${startDate}`);
  const points = (json?.fear_and_greed_historical?.data || [])
    .map((row) => ({ time: Number(row?.x), value: Number(row?.y) }))
    .filter((row) => Number.isFinite(row.time) && Number.isFinite(row.value))
    .sort((a, b) => a.time - b.time)
    .map((row) => ({ date: new Date(row.time).toISOString().slice(0, 10), value: Number(row.value.toFixed(2)) }));
  return { source: "CNN Fear & Greed", points: lastPointPerDate(points) };
}

function lastPointPerDate(points) {
  return [...new Map(points.map((point) => [point.date, point])).values()];
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

export async function getMarketBasisData({ lowDates = {} } = {}) {
  if (process.env.MOCK_MACRO === "1") {
    return {
      ok: true,
      updatedAt: new Date().toISOString(),
      values: {
        korea: {
          ...marketBasis("2021-06-25", 3316.08, "2022-09-30", 2134.77, "Mock"),
          risePeakDate: "2026-06-19",
          risePeakValue: 9385.59,
          fallPeakDate: "2026-07-28",
          fallPeakValue: 5992.91,
        },
        us: {
          ...marketBasis("2020-02-19", 3393.52, "2020-03-23", 2191.86, "Mock"),
          risePeakDate: "2026-06-02",
          risePeakValue: 7620.9,
          fallPeakDate: "2026-06-09",
          fallPeakValue: 7237.85,
        },
      },
      errors: [],
    };
  }

  const markets = [
    ["korea", "^KS11"],
    ["us", "^GSPC"],
  ];
  const entries = await Promise.all(
    markets.map(async ([key, symbol]) => {
      try {
        const rows = await getYahooHistory(symbol);
        const manualLowDate = normalizeIsoDate(lowDates[key]);
        if (manualLowDate) {
          const high = highestPoint(rows);
          const manualBasis = {
            lowDate: manualLowDate,
            highDate: high.date,
            highValue: Number(high.value.toFixed(2)),
          };
          const extremes = findBasisExtremes(rows, manualBasis);
          if (!extremes.risePeakDate) throw new Error(`No history after ${manualLowDate} for ${symbol}`);
          return [
            key,
            { manual: true, ...manualBasis, ...extremes, source: `Yahoo Finance ${symbol}` },
            null,
          ];
        }
        const basis = detectCycleBasis(rows);
        if (!basis) throw new Error(`No qualifying high-low cycle for ${symbol}`);
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
  return {
    ok: Object.keys(values).length > 0,
    updatedAt: new Date().toISOString(),
    values,
    errors,
  };
}

async function getYahooHistory(symbol) {
  const now = Date.now();
  const cached = historyCache.get(symbol);
  if (cached && now - cached.cachedAt < marketBasisCacheMs) return cached.rows;
  const rows = await fetchYahooHistory(symbol);
  if (!rows.length) throw new Error(`Yahoo history missing for ${symbol}`);
  historyCache.set(symbol, { cachedAt: now, rows });
  return rows;
}

function normalizeIsoDate(value) {
  const text = String(value ?? "");
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

async function fetchYahooHistory(symbol) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
    symbol,
  )}?period1=${historyStartSeconds}&period2=${Math.floor(Date.now() / 1000)}&interval=1d`;
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

// Basis = the last all-time high and the lowest point after it, counted only when that low
// fell at least `drawdown` from the high and dipped under the 20-month moving average.
export function detectCycleBasis(dailyRows, { drawdown = 0.3, averageMonths = 20 } = {}) {
  const rows = dailyRows
    .filter(
      (row) =>
        row.date &&
        Number.isFinite(row.high) &&
        Number.isFinite(row.low) &&
        Number.isFinite(row.close) &&
        row.high > 0 &&
        row.low > 0 &&
        row.close > 0,
    )
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));

  const completedCloses = [];
  let monthKey = null;
  let lastClose = null;
  let peak = null;
  let candidate = null;
  let qualified = false;
  let basis = null;
  const toBasis = () => marketBasis(peak.date, peak.value, candidate.date, candidate.value, "automatic-cycle");

  rows.forEach((row) => {
    const key = row.date.slice(0, 7);
    if (key !== monthKey) {
      if (monthKey) completedCloses.push(lastClose);
      monthKey = key;
    }
    lastClose = row.close;

    if (!peak || row.high > peak.value) {
      if (qualified) basis = toBasis();
      peak = { date: row.date, value: row.high };
      candidate = null;
      qualified = false;
      return;
    }
    if (candidate && row.low >= candidate.value) return;
    candidate = { date: row.date, value: row.low };
    const average = monthlyAverage(completedCloses, row.close, averageMonths);
    qualified ||= average !== null && row.low < average && row.low <= peak.value * (1 - drawdown);
  });

  if (qualified) basis = toBasis();
  return basis;
}

function monthlyAverage(completedCloses, currentClose, months) {
  if (completedCloses.length < months - 1) return null;
  const previous = completedCloses.slice(-(months - 1));
  return (previous.reduce((sum, close) => sum + close, 0) + currentClose) / months;
}

export function findBasisExtremes(dailyRows, basis) {
  const validRows = dailyRows.filter(
    (row) => Number.isFinite(row.high) && Number.isFinite(row.low) && row.high > 0 && row.low > 0,
  );
  const afterLow = validRows.filter((row) => row.date >= basis.lowDate);
  const risePeak = afterLow.reduce(
    (highest, row) => (!highest || row.high > highest.high ? row : highest),
    null,
  );
  if (!risePeak) return {};
  // The drawdown is measured from the all-time high, which may sit before the low.
  const highBeforeLow = basis.highDate && Number(basis.highValue) > risePeak.high;
  const anchorDate = highBeforeLow ? basis.highDate : risePeak.date;
  const fallPeak = validRows
    .filter((row) => (highBeforeLow ? row.date > anchorDate : row.date >= anchorDate))
    .reduce((lowest, row) => (!lowest || row.low < lowest.low ? row : lowest), null);
  if (!fallPeak) return {};
  return {
    risePeakDate: risePeak.date,
    risePeakValue: Number(risePeak.high.toFixed(2)),
    fallPeakDate: fallPeak.date,
    fallPeakValue: Number(fallPeak.low.toFixed(2)),
  };
}

function highestPoint(dailyRows) {
  return dailyRows.reduce(
    (highest, row) =>
      Number.isFinite(row.high) && (!highest || row.high > highest.value)
        ? { date: row.date, value: row.high }
        : highest,
    null,
  );
}

function marketBasis(highDate, highValue, lowDate, lowValue, source) {
  return {
    highDate,
    highValue: Number(Number(highValue).toFixed(2)),
    lowDate,
    lowValue: Number(Number(lowValue).toFixed(2)),
    source,
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
