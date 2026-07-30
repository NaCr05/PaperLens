import assert from "node:assert/strict";
import test from "node:test";

import { mergeSelectionRects, normalizeSelectionRect } from "../app/selection-geometry.ts";

test("merges adjacent PDF text fragments on the same visual line", () => {
  const merged = mergeSelectionRects([
    { x: .10, y: .20, width: .18, height: .018, text: "selected text" },
    { x: .286, y: .201, width: .20, height: .017, text: "selected text" },
    { x: .10, y: .235, width: .42, height: .018, text: "selected text" },
    { x: .10, y: .270, width: .16, height: .018, text: "selected text" },
  ]);

  assert.equal(merged.length, 3);
  assert.ok(Math.abs(merged[0].x - .10) < 1e-9);
  assert.ok(Math.abs(merged[0].width - .386) < 1e-9);
  assert.ok(Math.abs(merged[1].y - .235) < 1e-9);
});

test("keeps distant fragments and neighboring lines separate", () => {
  const merged = mergeSelectionRects([
    { x: .10, y: .20, width: .12, height: .018, text: "selected text" },
    { x: .25, y: .20, width: .12, height: .018, text: "selected text" },
    { x: .10, y: .225, width: .30, height: .018, text: "selected text" },
  ]);

  assert.equal(merged.length, 3);
});

test("clips selection geometry to the visible PDF frame", () => {
  const normalized = normalizeSelectionRect(
    { left: 80, top: 90, right: 460, bottom: 130 },
    { left: 100, top: 100, width: 300, height: 500 },
    "line",
  );

  assert.deepEqual(normalized, { x: 0, y: 0, width: 1, height: .06, text: "line" });
});
