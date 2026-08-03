import assert from "node:assert/strict";
import test from "node:test";

import { runWithCodexRecovery } from "../app/ai-recovery.ts";

test("hands a failed AI task and its error to local Codex before surfacing it", async () => {
  const calls = [];
  const progress = [];
  const recovery = await runWithCodexRecovery({
    settings: { provider: "mimo", model: "translation" },
    codexAvailable: true,
    run: async (settings, repairError) => {
      calls.push({ provider: settings.provider, repairError });
      if (settings.provider === "mimo") throw new Error("段落映射不完整");
      return "Codex 修复结果";
    },
    onRepair: (message) => progress.push(message),
  });

  assert.deepEqual(calls, [
    { provider: "mimo", repairError: "" },
    { provider: "local-codex", repairError: "段落映射不完整" },
  ]);
  assert.deepEqual(progress, ["段落映射不完整"]);
  assert.equal(recovery.value, "Codex 修复结果");
  assert.equal(recovery.recoveredByCodex, true);
});

test("does not turn an explicit cancellation into a Codex repair task", async () => {
  let calls = 0;
  await assert.rejects(runWithCodexRecovery({
    settings: { provider: "mimo" },
    codexAvailable: true,
    run: async () => {
      calls += 1;
      throw new DOMException("Aborted", "AbortError");
    },
  }), (error) => error.name === "AbortError");
  assert.equal(calls, 1);
});

test("preserves the original error when Codex is unavailable", async () => {
  await assert.rejects(runWithCodexRecovery({
    settings: { provider: "openai" },
    codexAvailable: false,
    run: async () => { throw new Error("API 不可用"); },
  }), /API 不可用/);
});
