import assert from "node:assert/strict";
import test from "node:test";

import { buildFullTranslationQueue, mergeTranslationUsage } from "../app/full-translation.ts";

test("prioritizes the current page, then later pages, and skips completed pages", () => {
  assert.deepEqual(buildFullTranslationQueue(6, 4, [2, 5]), [4, 6, 1, 3]);
});

test("handles a fully translated document and an out-of-range current page", () => {
  assert.deepEqual(buildFullTranslationQueue(3, 9, [1, 2, 3]), []);
  assert.deepEqual(buildFullTranslationQueue(3, 9, []), [3, 1, 2]);
});

test("aggregates token usage across translated pages", () => {
  assert.deepEqual(mergeTranslationUsage(
    { inputTokens: 10, outputTokens: 4, totalTokens: 14, cachedTokens: 2, reasoningTokens: 1 },
    { inputTokens: 20, outputTokens: 8, totalTokens: 28, cachedTokens: 3, reasoningTokens: 2 },
  ), { inputTokens: 30, outputTokens: 12, totalTokens: 42, cachedTokens: 5, reasoningTokens: 3 });
});
