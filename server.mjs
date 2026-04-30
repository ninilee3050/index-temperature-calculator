import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const basePort = Number(process.env.PORT || 4173);
const autoExitIdleMs = 90 * 1000;
const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
};

let macroCache = null;
let autoExitEnabled = process.env.AUTO_EXIT === "1";
let autoExitTimer = null;
let lastHeartbeatAt = Date.now();
const cacheMs = 5 * 60 * 1000;

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host}`);
    if (url.pathname === "/api/health") {
      sendJson(response, 200, { ok: true, heartbeat: true });
      return;
    }
    if (url.pathname === "/api/auto-exit") {
      enableAutoExit();
      sendJson(response, 200, { ok: true, autoExit: true });
      return;
    }
    if (url.pathname === "/api/heartbeat") {
      markHeartbeat();
      sendJson(response, 200, { ok: true });
      return;
    }
    if (url.pathname === "/api/macro") {
      const macro = await getMacroData();
      sendJson(response, 200, macro);
      return;
    }
    if (url.pathname === "/api/yield-cycles") {
      const cycles = await getYieldCycles();
      sendJson(response, 200, cycles);
      return;
    }
    if (url.pathname === "/favicon.ico") {
      response.writeHead(204, { "Cache-Control": "no-store" });
      response.end();
      return;
    }
    await serveStatic(url.pathname, response);
  } catch (error) {
    sendJson(response, 500, { ok: false, error: String(error.message || error) });
  }
});

const port = await listenWithFallback(server, basePort);
if (process.env.PORT_FILE) {
  await fs.writeFile(process.env.PORT_FILE, String(port), "utf8").catch(() => {});
}
if (autoExitEnabled) enableAutoExit();
console.log(`지수 구간 계산 앱: http://127.0.0.1:${port}/`);

async function serveStatic(pathname, response) {
  const cleanPath = pathname === "/" ? "/index.html" : decodeURIComponent(pathname);
  const filePath = path.normalize(path.join(__dirname, cleanPath));
  if (!filePath.startsWith(__dirname)) {
    sendText(response, 403, "Forbidden");
    return;
  }
  try {
    const file = await fs.readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    response.writeHead(200, {
      "Content-Type": contentTypes[ext] || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    response.end(file);
  } catch {
    sendText(response, 404, "Not found");
  }
}

async function getMacroData() {
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
    spread10y2y: () => fetchFredLatest("T10Y2Y"),
    spread10y3m: () => fetchFredLatest("T10Y3M"),
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

async function getYieldCycles() {
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

function sendJson(response, status, payload) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(payload));
}

function sendText(response, status, text) {
  response.writeHead(status, {
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(text);
}

function markHeartbeat() {
  lastHeartbeatAt = Date.now();
}

function enableAutoExit() {
  autoExitEnabled = true;
  markHeartbeat();
  if (autoExitTimer) return;
  autoExitTimer = setInterval(() => {
    if (!autoExitEnabled || Date.now() - lastHeartbeatAt <= autoExitIdleMs) return;
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 1000).unref();
  }, 5000);
  autoExitTimer.unref();
}

async function listenWithFallback(serverInstance, firstPort) {
  for (let offset = 0; offset < 10; offset += 1) {
    const port = firstPort + offset;
    try {
      await new Promise((resolve, reject) => {
        const onError = (error) => {
          serverInstance.off("listening", onListening);
          reject(error);
        };
        const onListening = () => {
          serverInstance.off("error", onError);
          resolve();
        };
        serverInstance.once("error", onError);
        serverInstance.once("listening", onListening);
        serverInstance.listen(port, "127.0.0.1");
      });
      return port;
    } catch (error) {
      if (error.code !== "EADDRINUSE" || offset === 9) throw error;
    }
  }
}
