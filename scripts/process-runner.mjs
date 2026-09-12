import { execFile, spawn } from "node:child_process";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const isWindows = process.platform === "win32";

export function vinextArgs(args) {
  // The pinned Vinext package keeps its CLI beside its exported dist/index.js.
  // Invoke JavaScript with our Node executable, without an npm .cmd shim/shell.
  return [fileURLToPath(new URL("./cli.js", import.meta.resolve("vinext"))), ...args];
}

async function stopProcess({ child, closed }) {
  if (!child.pid) return;

  if (isWindows) {
    if (child.exitCode !== null || child.signalCode !== null) return;
    try {
      // Only terminate the tree belonging to this launcher-owned process.
      const taskkill = join(process.env.SystemRoot || "C:\\Windows", "System32", "taskkill.exe");
      await execFileAsync(taskkill, ["/pid", String(child.pid), "/T", "/F"], { windowsHide: true, timeout: 5000 });
    } catch (error) {
      // A service can exit while taskkill is starting.
      if (child.exitCode === null && child.signalCode === null) {
        child.kill();
        throw error;
      }
    }
  } else {
    const signalGroup = (signal) => {
      try {
        process.kill(-child.pid, signal);
      } catch (error) {
        if (error.code !== "ESRCH") throw error;
      }
    };
    signalGroup("SIGTERM");
    const timeout = new AbortController();
    try {
      await Promise.race([closed, delay(2000, undefined, { signal: timeout.signal })]);
    } finally {
      timeout.abort();
    }
    // Also reap descendants if the service exits before its own children.
    signalGroup("SIGKILL");
  }

  await closed;
}

export function runProcesses(commands, { cwd }) {
  return new Promise((resolve) => {
    const children = [];
    let closing = false;

    async function close(code) {
      if (closing) return;
      closing = true;
      const results = await Promise.allSettled(children.map(stopProcess));
      for (const result of results) {
        if (result.status === "rejected") {
          console.error(`PaperLens: could not stop a child process: ${result.reason.message}`);
          code = 1;
        }
      }
      process.removeListener("SIGINT", onSignal);
      process.removeListener("SIGTERM", onSignal);
      resolve(code);
    }

    const onSignal = () => { void close(0); };
    process.on("SIGINT", onSignal);
    process.on("SIGTERM", onSignal);

    for (const { name, args, env } of commands) {
      try {
        const child = spawn(process.execPath, args, {
          cwd,
          stdio: "inherit",
          env: { ...process.env, ...env },
          windowsHide: true,
          // POSIX process groups let us stop workerd/esbuild as well as Node.
          detached: !isWindows,
        });
        const closed = new Promise((done) => child.once("close", done));
        children.push({ child, closed });
        child.on("error", (error) => {
          console.error(`PaperLens: could not start ${name}: ${error.message}`);
          void close(1);
        });
        child.once("exit", (code) => { void close(code ?? 1); });
      } catch (error) {
        console.error(`PaperLens: could not start ${name}: ${error.message}`);
        void close(1);
        break;
      }
    }
  });
}
