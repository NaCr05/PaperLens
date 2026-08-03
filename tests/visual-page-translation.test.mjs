import assert from "node:assert/strict";
import test from "node:test";

import { createVisualPageSegment, isVisualPageSegments, shouldUseVisualPageTranslation, VISUAL_PAGE_SOURCE } from "../app/visual-page-translation.ts";

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

test("routes numbered tables with several result cells through visual translation", () => {
  const segments = [
    { text: "Can history alone match RoboTTT? Naively concatenating past observations does not reliably help." },
    { text: "Method Pup Go Car Circuit Gear Bot" },
    { text: "RoboTTT 9 / 20 13 / 20 2 / 10" },
    { text: "GR00T N1.7 3 / 20 3 / 20 0 / 10" },
    { text: "Table 1: Main evaluation: fully successful trials on three assembly tasks." },
  ];
  assert.equal(shouldUseVisualPageTranslation(segments), true);
});

test("routes an uncaptioned slide table through full-page visual translation", () => {
  const columns = [.07, .18, .34, .52, .72];
  const rows = [.24, .34, .44, .54];
  const segments = rows.flatMap((y, row) => columns.map((x, column) => ({
    text: row === 0
      ? ["Round #", "Open/close dates", "Round is open to", "Submit requests for", "Deadline"][column]
      : `row-${row}-column-${column}`,
    rects: [{ x, y, width: column === 2 ? .16 : .1, height: .022 }],
  })));
  assert.equal(shouldUseVisualPageTranslation(segments), true);
});

test("does not mistake ordinary two-column prose for a table", () => {
  const segments = Array.from({ length: 8 }, (_, row) => [
    { text: `Left-column paragraph ${row}`, rects: [{ x: .08, y: .14 + row * .08, width: .36, height: .02 }] },
    { text: `Right-column paragraph ${row}`, rects: [{ x: .55, y: .14 + row * .08, width: .36, height: .02 }] },
  ]).flat();
  assert.equal(shouldUseVisualPageTranslation(segments), false);
});

test("keeps ordinary prose and table mentions on text-layer translation", () => {
  assert.equal(shouldUseVisualPageTranslation([
    { text: "We compare our results with Table 1 and discuss the main trend." },
    { text: "The method improves consistently across all tasks." },
  ]), false);
});
