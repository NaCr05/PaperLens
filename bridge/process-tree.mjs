import { execFile } from "node:child_process";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

// The caller must spawn an independent process group on POSIX and pass a
// promise registered for the child's close event immediately after spawning.
export async function stopProcessTree({ child, closed, graceMs = 2000 }) {
  if (!child.pid) return;

  if (process.platform === "win32") {
    if (child.exitCode !== null || child.signalCode !== null) return;
    try {
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
      try { process.kill(-child.pid, signal); }
      catch (error) { if (error.code !== "ESRCH") throw error; }
    };
    signalGroup("SIGTERM");
    const timeout = new AbortController();
    try {
      await Promise.race([closed, delay(graceMs, undefined, { signal: timeout.signal })]);
    } finally {
      timeout.abort();
    }
    signalGroup("SIGKILL");
  }

  await closed;
}
