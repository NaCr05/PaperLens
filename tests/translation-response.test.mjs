import assert from "node:assert/strict";
import test from "node:test";

import { completeTranslationWithRepair, MAX_TRANSLATION_REPAIR_ATTEMPTS, mergeTranslationBatches, parseTranslationResponse, TranslationRepairError } from "../app/translation-response.ts";

const source = [
  { id: "p9-v2-s1" },
  { id: "p9-v2-s2" },
  { id: "p9-v2-s3" },
];

test("keeps valid mappings and identifies only segments that need automatic repair", () => {
  const parsed = parseTranslationResponse(JSON.stringify({
    segments: [
      { id: "p9-v2-s1", translation: "第一段", formulaExplanation: "" },
      { id: "p9-v2-s3", translation: "第三段", formulaExplanation: "公式解释" },
    ],
  }), source);

  assert.deepEqual(parsed.translated.map((segment) => segment.id), ["p9-v2-s1", "p9-v2-s3"]);
  assert.deepEqual(parsed.missingIds, ["p9-v2-s2"]);
});

test("treats empty, duplicate, and unknown mappings as incomplete without discarding good work", () => {
  const parsed = parseTranslationResponse(JSON.stringify({
    segments: [
      { id: "p9-v2-s1", translation: "第一段", formulaExplanation: "" },
      { id: "p9-v2-s2", translation: "", formulaExplanation: "" },
      { id: "p9-v2-s3", translation: "重复一", formulaExplanation: "" },
      { id: "p9-v2-s3", translation: "重复二", formulaExplanation: "" },
      { id: "p99-v2-s1", translation: "非本页", formulaExplanation: "" },
    ],
  }), source);

  assert.deepEqual(parsed.translated.map((segment) => segment.id), ["p9-v2-s1"]);
  assert.deepEqual(parsed.missingIds, ["p9-v2-s2", "p9-v2-s3"]);
});

test("merges repair batches back into original source order", () => {
  const first = [{ id: "p9-v2-s1", translation: "第一段", formulaExplanation: "" }, { id: "p9-v2-s3", translation: "第三段", formulaExplanation: "" }];
  const repair = [{ id: "p9-v2-s2", translation: "第二段", formulaExplanation: "" }];

  assert.deepEqual(mergeTranslationBatches(source, [first, repair]).map((segment) => segment.id), source.map((segment) => segment.id));
  assert.equal(MAX_TRANSLATION_REPAIR_ATTEMPTS, 2);
});

test("retains the existing LaTeX JSON escape repair", () => {
  const parsed = parseTranslationResponse('{"segments":[{"id":"p1-v2-s1","translation":"\\(x_1\\)","formulaExplanation":""}]}', [{ id: "p1-v2-s1" }]);
  assert.equal(parsed.translated[0].translation, "\\(x_1\\)");
});

test("automatically requests only missing ids and restores the full mapping", async () => {
  const calls = [];
  const repairs = [];
  const completion = await completeTranslationWithRepair(source, async (pending, repairAttempt) => {
    calls.push({ ids: pending.map((segment) => segment.id), repairAttempt });
    if (repairAttempt === 0) {
      return { answer: JSON.stringify({ segments: [
        { id: "p9-v2-s1", translation: "第一段", formulaExplanation: "" },
        { id: "p9-v2-s3", translation: "第三段", formulaExplanation: "" },
      ] }) };
    }
    return { answer: JSON.stringify({ segments: [
      { id: "p9-v2-s2", translation: "第二段", formulaExplanation: "" },
    ] }) };
  }, (pending, repairAttempt) => repairs.push({ ids: pending.map((segment) => segment.id), repairAttempt }));

  assert.deepEqual(calls, [
    { ids: ["p9-v2-s1", "p9-v2-s2", "p9-v2-s3"], repairAttempt: 0 },
    { ids: ["p9-v2-s2"], repairAttempt: 1 },
  ]);
  assert.deepEqual(repairs, [{ ids: ["p9-v2-s2"], repairAttempt: 1 }]);
  assert.deepEqual(completion.translated.map((segment) => segment.translation), ["第一段", "第二段", "第三段"]);
  assert.equal(completion.repairAttempts, 1);
});

test("stops after the bounded repair budget and reports remaining ids", async () => {
  await assert.rejects(
    completeTranslationWithRepair(source, async () => ({ answer: '{"segments":[]}' })),
    (error) => error instanceof TranslationRepairError
      && error.missingIds.join(",") === source.map((segment) => segment.id).join(","),
  );
});

test("turns an invocation error into a repair attempt with the original failure context", async () => {
  const calls = [];
  const progress = [];
  const completion = await completeTranslationWithRepair(source, async (pending, repairAttempt, previousFailure) => {
    calls.push({ ids: pending.map((segment) => segment.id), repairAttempt, previousFailure });
    if (repairAttempt === 0) throw new Error("Codex CLI 响应超时");
    return { answer: JSON.stringify({ segments: pending.map((segment) => ({ id: segment.id, translation: `修复 ${segment.id}`, formulaExplanation: "" })) }) };
  }, (pending, repairAttempt, previousFailure) => progress.push({ count: pending.length, repairAttempt, previousFailure }));

  assert.equal(calls.length, 2);
  assert.deepEqual(calls[1], { ids: source.map((segment) => segment.id), repairAttempt: 1, previousFailure: "Codex CLI 响应超时" });
  assert.deepEqual(progress, [{ count: 3, repairAttempt: 1, previousFailure: "Codex CLI 响应超时" }]);
  assert.equal(completion.translated.length, 3);
});
