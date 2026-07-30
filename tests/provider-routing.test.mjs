import assert from "node:assert/strict";
import test from "node:test";

import { requiresRepositoryVerification, resolveProviderRoute } from "../bridge/provider-routing.mjs";

test("routes ordinary auto questions through the selected API provider", () => {
  const route = resolveProviderRoute({ mode: "auto", question: "这段方法的直觉是什么？" }, "mimo", { "local-codex": true, mimo: true });
  assert.equal(route.provider, "mimo");
  assert.equal(route.payload.mode, "chat");
  assert.equal(route.repositoryDecision, "skipped");
});

test("falls back to local Codex when an API question requires repository evidence", () => {
  const payload = { mode: "auto", question: "训练脚本中的配置参数在哪里？" };
  assert.equal(requiresRepositoryVerification(payload), true);
  const route = resolveProviderRoute(payload, "mimo", { "local-codex": true, mimo: true });
  assert.equal(route.provider, "local-codex");
  assert.match(route.fallbackReason, /核实论文仓库/);
});

test("reports a capability error when repository verification has no local provider", () => {
  const route = resolveProviderRoute({ mode: "repository", question: "核对实现" }, "openai", { "local-codex": false, openai: true });
  assert.equal(route.provider, "openai");
  assert.match(route.unsupportedReason, /本机 Codex 当前不可用/);
});

