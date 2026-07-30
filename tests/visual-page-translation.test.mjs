import assert from "node:assert/strict";
import test from "node:test";

import { createVisualPageSegment, isVisualPageSegments, VISUAL_PAGE_SOURCE } from "../app/visual-page-translation.ts";

test("creates one full-page segment for a scanned PDF page", () => {
  const segment = createVisualPageSegment(4);
  assert.equal(segment.id, "p4-visual");
  assert.equal(segment.text, VISUAL_PAGE_SOURCE);
  assert.deepEqual(segment.rects, [{ x: .015, y: .015, width: .97, height: .97 }]);
  assert.equal(isVisualPageSegments([segment]), true);
});

test("does not classify ordinary PDF text segments as visual pages", () => {
  assert.equal(isVisualPageSegments([{ id: "p4-s1", text: "Extracted text" }]), false);
  assert.equal(isVisualPageSegments([]), false);
});
