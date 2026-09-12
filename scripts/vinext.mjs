import { fileURLToPath } from "node:url";
import { runProcesses, vinextArgs } from "./process-runner.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
process.exitCode = await runProcesses([
  { name: "Vinext", args: vinextArgs(process.argv.slice(2)), env: { WRANGLER_LOG_PATH: ".wrangler/wrangler.log" } },
], { cwd: root });
