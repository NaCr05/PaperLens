import { spawn } from "node:child_process";
import { createServer, request as createProxyRequest } from "node:http";
import { connect } from "node:net";
import { fileURLToPath } from "node:url";

const PROJECT_ROOT = fileURLToPath(new URL("../", import.meta.url));
const PUBLIC_PORT = Number(process.env.PORT || 3000);
const APP_PORT = Number(process.env.PAPERLENS_APP_PORT || 3001);
const BRIDGE_PORT = Number(process.env.PAPERLENS_CODEX_PORT || 43123);

function startProcess(label, command, args, env) {
  const child = spawn(command, args, {
    cwd: PROJECT_ROOT,
    env: { ...process.env, ...env },
    stdio: ["ignore", "inherit", "inherit"],
  });
  child.on("exit", (code, signal) => {
    if (shuttingDown) return;
    console.error(`${label} stopped unexpectedly (${signal || code})`);
    process.exit(code || 1);
  });
  return child;
}

function waitForPort(port, timeoutMs = 45_000) {
  const startedAt = Date.now();
  return new Promise((resolve, reject) => {
    const tryConnect = () => {
      const socket = connect({ host: "127.0.0.1", port });
      socket.once("connect", () => {
        socket.destroy();
        resolve();
      });
      socket.once("error", () => {
        socket.destroy();
        if (Date.now() - startedAt >= timeoutMs) {
          reject(new Error(`Timed out waiting for 127.0.0.1:${port}`));
          return;
        }
        setTimeout(tryConnect, 150);
      });
    };
    tryConnect();
  });
}

let shuttingDown = false;
const app = startProcess(
  "PaperLens web server",
  process.execPath,
  ["node_modules/vinext/dist/cli.js", "start"],
  { PORT: String(APP_PORT) },
);
const bridge = startProcess(
  "PaperLens AI bridge",
  process.execPath,
  ["bridge/server.mjs"],
  { PAPERLENS_CODEX_PORT: String(BRIDGE_PORT) },
);

function stop(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  app.kill(signal);
  bridge.kill(signal);
  setTimeout(() => process.exit(0), 4_000).unref();
}

process.on("SIGTERM", () => stop("SIGTERM"));
process.on("SIGINT", () => stop("SIGINT"));

await Promise.all([waitForPort(APP_PORT), waitForPort(BRIDGE_PORT)]);

const gateway = createServer((incoming, outgoing) => {
  const isBridgeRequest = incoming.url === "/api/codex" || incoming.url?.startsWith("/api/codex/");
  const targetPort = isBridgeRequest ? BRIDGE_PORT : APP_PORT;
  const targetPath = isBridgeRequest
    ? incoming.url.replace(/^\/api\/codex/, "") || "/"
    : incoming.url;
  const headers = {
    ...incoming.headers,
    host: `127.0.0.1:${targetPort}`,
    "x-forwarded-host": incoming.headers.host || "",
    "x-forwarded-proto": incoming.headers["x-forwarded-proto"] || "https",
  };
  const proxy = createProxyRequest({
    host: "127.0.0.1",
    port: targetPort,
    method: incoming.method,
    path: targetPath,
    headers,
  }, (proxied) => {
    outgoing.writeHead(proxied.statusCode || 502, proxied.headers);
    proxied.pipe(outgoing);
  });
  proxy.on("error", (error) => {
    if (outgoing.headersSent) {
      outgoing.destroy(error);
      return;
    }
    outgoing.writeHead(502, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
    outgoing.end(JSON.stringify({ error: "PaperLens service is starting", code: "upstream_unavailable" }));
  });
  incoming.pipe(proxy);
});

gateway.listen(PUBLIC_PORT, "0.0.0.0", () => {
  console.log(`PaperLens cloud gateway: http://0.0.0.0:${PUBLIC_PORT}`);
});
