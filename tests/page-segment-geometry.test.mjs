import assert from "node:assert/strict";
import test from "node:test";

import { alignRenderedTextToSegments, mapPdfTextItemsToSegments, mergeAdjacentTextRects, splitTextLineParts } from "../app/page-segment-geometry.ts";

test("separates compact neighboring columns without splitting ordinary text chunks", () => {
  const runs = splitTextLineParts([
    { x: 36, width: 110, height: 10, text: "As shown in Table 2," },
    { x: 150, width: 136, height: 10, text: "RoboTTT follows the demonstration" },
    { x: 300, width: 122, height: 10, text: "Task Completion Score" },
  ], 600);
  assert.equal(runs.length, 2);
  assert.deepEqual(runs[0].map((part) => part.text), ["As shown in Table 2,", "RoboTTT follows the demonstration"]);
  assert.deepEqual(runs[1].map((part) => part.text), ["Task Completion Score"]);
});

test("maps PDF text items to paragraph segments without relying on DOM coordinates", () => {
  const owners = mapPdfTextItemsToSegments([
    { str: "First text chunk", width: 120, transform: [10, 0, 0, 10, 50, 700] },
    { str: "Second text chunk", width: 130, transform: [10, 0, 0, 10, 50, 685] },
    { str: "Table heading", width: 80, transform: [10, 0, 0, 10, 350, 700] },
  ], [
    { id: "p1-s1", rects: [{ x: .08, y: .1, width: .3, height: .06 }] },
    { id: "p1-s2", rects: [{ x: .57, y: .1, width: .2, height: .03 }] },
  ], 600, 800);

  assert.deepEqual(owners.map((owner) => owner.segmentId), ["p1-s1", "p1-s1", "p1-s2"]);
  assert.deepEqual(
    alignRenderedTextToSegments(owners.map((owner) => owner.text), owners),
    ["p1-s1", "p1-s1", "p1-s2"],
  );
});

test("aligns rendered spans after PDF.js omits an empty or structural item", () => {
  const owners = [
    { text: "Alpha", segmentId: "p2-s1" },
    { text: "structural marker", segmentId: "" },
    { text: "Beta", segmentId: "p2-s2" },
  ];
  assert.deepEqual(alignRenderedTextToSegments(["Alpha", "Beta"], owners), ["p2-s1", "p2-s2"]);
});

test("keeps disjoint paragraph rows out of one oversized overlay box", () => {
  const rects = mergeAdjacentTextRects([
    { x: .1, y: .2, width: .45, height: .02 },
    { x: .1, y: .22, width: .45, height: .02 },
    { x: .1, y: .24, width: .28, height: .02 },
  ]);
  assert.equal(rects.length, 2);
  assert.deepEqual(rects[0], { x: .1, y: .2, width: .45, height: rects[0].height });
  assert.ok(Math.abs(rects[0].height - .04) < 1e-9);
  assert.deepEqual(rects[1], { x: .1, y: .24, width: .28, height: .02 });
});
