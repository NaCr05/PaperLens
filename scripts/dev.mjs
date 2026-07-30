import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const forwardedArgs = process.argv.slice(2);
const hasHostnameArg = forwardedArgs.some((arg) => arg === "--hostname" || arg === "-H" || arg.startsWith("--hostname="));
const webArgs = ["dev", ...(hasHostnameArg ? [] : ["--hostname", "localhost"]), ...forwardedArgs];
const children = [
  spawn(process.execPath, ["bridge/server.mjs"], { cwd: root, stdio: "inherit", env: process.env }),
  spawn(process.execPath, ["scripts/usb-gateway.mjs"], { cwd: root, stdio: "inherit", env: process.env }),
  spawn("vinext", webArgs, {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, WRANGLER_LOG_PATH: ".wrangler/wrangler.log" },
  }),
];

let closing = false;
function close(code = 0) {
  if (closing) return;
  closing = true;
  for (const child of children) child.kill("SIGTERM");
  setTimeout(() => process.exit(code), 100).unref();
}

for (const child of children) {
  child.on("exit", (code, signal) => {
    if (!closing && signal !== "SIGTERM") close(code ?? 1);
  });
}

process.on("SIGINT", () => close(0));
process.on("SIGTERM", () => close(0));
