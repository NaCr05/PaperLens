import { spawn } from "node:child_process";
import { once } from "node:events";
import { existsSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";

const name = basename(process.argv[1]).split(".")[0];
const args = process.argv.slice(2);
let descendant;
if (name === "server") {
  descendant = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" });
  await once(descendant, "spawn");
}
console.log(`fixture ${JSON.stringify({
  name, args, pid: process.pid, descendant: descendant?.pid,
  cwd: process.cwd(), logPath: process.env.WRANGLER_LOG_PATH,
  inherited: process.env.PAPERLENS_STARTUP_INHERITED,
})}`);

if (name === "cli" && args[0] !== "dev") {
  process.exitCode = Number(process.env.PAPERLENS_STARTUP_EXIT_CODE || 0);
} else {
  const control = join(process.env.PAPERLENS_STARTUP_FIXTURE_DIR, `exit-${name}`);
  setInterval(() => {
    if (existsSync(control)) process.exit(Number(readFileSync(control, "utf8")));
  }, 25);
}
