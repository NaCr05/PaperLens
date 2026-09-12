import assert from "node:assert/strict";
import { fork } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = new URL("../", import.meta.url);
const controller = new URL("./fixtures/startup-controller.mjs", import.meta.url).href;

async function unusedPorts() {
  const servers = [createServer(), createServer()];
  await Promise.all(servers.map(async (server) => {
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
  }));
  const ports = servers.map((server) => server.address().port);
  await Promise.all(servers.map((server) => new Promise((resolve) => server.close(resolve))));
  return ports;
}

async function waitForResponse(url, app) {
  const deadline = Date.now() + 60000;
  let lastError;
  while (Date.now() < deadline) {
    assert.equal(app.child.exitCode, null, app.output());
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(20000) });
      if (response.ok) return response;
      lastError = new Error(`${url}: HTTP ${response.status}: ${await response.text()}`);
    } catch (error) { lastError = error; }
    await delay(100);
  }
  throw new Error(`Startup timed out: ${lastError}\n${app.output()}`);
}

function launch(t, script, args, bridgePort) {
  const child = fork(fileURLToPath(new URL(`scripts/${script}`, root)), args, {
    cwd: root,
    execArgv: ["--import", controller],
    env: { ...process.env, PAPERLENS_CODEX_PORT: String(bridgePort), PAPERLENS_CHATGPT_WEB_ENABLED: "0" },
    stdio: ["ignore", "pipe", "pipe", "ipc"],
    windowsHide: true,
  });
  let output = "";
  child.stdout.on("data", (data) => { output += data; });
  child.stderr.on("data", (data) => { output += data; });
  const finished = once(child, "close");
  async function stop() {
    if (child.exitCode === null && child.signalCode === null) child.send("SIGINT");
    const result = await Promise.race([finished, delay(10000, null, { ref: false })]);
    if (result === null) {
      child.kill();
      assert.fail(`Launcher did not stop in time:\n${output}`);
    }
    assert.deepEqual(result, [0, null], output);
  }
  t.after(stop);
  return { child, stop, output: () => output };
}

test("development serves the reader and bridge, then releases both ports", { timeout: 90000 }, async (t) => {
  const [webPort, bridgePort] = await unusedPorts();
  const app = launch(t, "dev.mjs", ["--hostname", "127.0.0.1", "--port", String(webPort)], bridgePort);
  const page = await waitForResponse(`http://127.0.0.1:${webPort}/`, app);
  assert.match(await page.text(), /PaperLens.*学习资料阅读与理解工作台/);
  const health = await (await waitForResponse(`http://127.0.0.1:${bridgePort}/health`, app)).json();
  assert.equal(health.ok, true);
  assert.equal(health.service, "PaperLens AI bridge");
  await app.stop();
  for (const port of [webPort, bridgePort]) {
    await assert.rejects(fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(2000) }));
  }
});

test("production start serves the built reader without starting a bridge", { timeout: 90000 }, async (t) => {
  const [webPort, bridgePort] = await unusedPorts();
  const app = launch(t, "vinext.mjs", ["start", "--hostname", "127.0.0.1", "--port", String(webPort)], bridgePort);
  const page = await waitForResponse(`http://127.0.0.1:${webPort}/`, app);
  assert.match(await page.text(), /PaperLens.*学习资料阅读与理解工作台/);
  await assert.rejects(fetch(`http://127.0.0.1:${bridgePort}/health`, { signal: AbortSignal.timeout(2000) }));
  await app.stop();
  await assert.rejects(fetch(`http://127.0.0.1:${webPort}/`, { signal: AbortSignal.timeout(2000) }));
});
