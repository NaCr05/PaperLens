import { fileURLToPath } from "node:url";
import { runProcesses, vinextArgs } from "./process-runner.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const forwardedArgs = process.argv.slice(2);
const hasHostnameArg = forwardedArgs.some((arg) => arg === "--hostname" || arg === "-H" || arg.startsWith("--hostname="));
const webArgs = ["dev", ...(hasHostnameArg ? [] : ["--hostname", "localhost"]), ...forwardedArgs];
process.exitCode = await runProcesses([
  { name: "AI bridge", args: ["bridge/server.mjs"] },
  { name: "USB gateway", args: ["scripts/usb-gateway.mjs"] },
  { name: "Vinext", args: vinextArgs(webArgs), env: { WRANGLER_LOG_PATH: ".wrangler/wrangler.log" } },
], { cwd: root });
