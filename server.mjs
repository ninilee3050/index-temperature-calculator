import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { getMacroData, getYieldCycles } from "./lib/market-data.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const basePort = Number(process.env.PORT || 4173);
const autoExitIdleMs = 90 * 1000;
const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
};

let autoExitEnabled = process.env.AUTO_EXIT === "1";
let autoExitTimer = null;
let lastHeartbeatAt = Date.now();

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
      sendJson(response, 200, await getMacroData());
      return;
    }
    if (url.pathname === "/api/yield-cycles") {
      sendJson(response, 200, await getYieldCycles());
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
