import assert from "node:assert/strict";
import test from "node:test";

import { parsePaperTerms } from "../app/paper-terms.ts";

test("parses page-specific terms and removes duplicates", () => {
  const result = parsePaperTerms(`{
    "terms": [
      { "term": "drifting action expert", "translation": "漂移式动作专家" },
      { "term": "VSDI", "translation": "验证器签名漂移改进" },
      { "term": "Drifting Action Expert", "translation": "重复项" }
    ]
  }`);
  assert.deepEqual(result, [
    { term: "drifting action expert", translation: "漂移式动作专家" },
    { term: "VSDI", translation: "验证器签名漂移改进" },
  ]);
});

test("accepts fenced JSON but rejects an empty term list", () => {
  assert.deepEqual(parsePaperTerms('```json\n{"terms":[{"term":"flow matching","translation":"流匹配"}]}\n```'), [
    { term: "flow matching", translation: "流匹配" },
  ]);
  assert.throws(() => parsePaperTerms('{"terms":[]}'), /没有提取到可靠术语/);
});
