import assert from "node:assert/strict";
import test from "node:test";

import { detectCaptionFigureRegions, findFigureContentTop } from "../app/figure-regions.ts";

const viewport = { width: 600, height: 800 };
const item = (str, x, y, width, height = 10) => ({ str, width, transform: [height, 0, 0, height, x, y] });

test("detects a full-width captioned figure and includes its caption", () => {
  const regions = detectCaptionFigureRegions([
    item("Prior paragraph with enough words to establish the prose boundary above the architecture figure.", 36, 700, 528),
    item("Figure 2. Overview of the proposed architecture and its training stages.", 52, 420, 496),
    item("The caption continues on its second line and explains the main information flow.", 52, 405, 496),
    item("A final caption line describes the training and inference components.", 52, 390, 496),
    item("3.1 Model Architecture", 36, 350, 260, 16),
  ], viewport, 3);

  assert.equal(regions.length, 1);
  assert.equal(regions[0].label, "Figure 2");
  assert.equal(regions[0].id, "p3-figure-1");
  assert.ok(regions[0].rect.x < .06);
  assert.ok(regions[0].rect.width > .89);
  assert.ok(regions[0].rect.height >= .1);
  assert.match(regions[0].caption, /caption continues/);
  assert.match(regions[0].caption, /final caption line/);
  assert.doesNotMatch(regions[0].caption, /Model Architecture/);
  assert.ok(regions[0].captionRect.height > .025);
});

test("keeps a two-column figure inside the caption column", () => {
  const regions = detectCaptionFigureRegions([
    item("A sufficiently long right-column paragraph closes the preceding discussion before the figure.", 318, 650, 245),
    item("Fig. 4. Ablation results.", 320, 460, 210),
  ], viewport, 7);

  assert.equal(regions.length, 1);
  assert.equal(regions[0].label, "Figure 4");
  assert.ok(regions[0].rect.x >= .5);
  assert.ok(regions[0].rect.width < .46);
});

test("does not invent regions without an explicit figure caption", () => {
  const regions = detectCaptionFigureRegions([
    item("Method", 40, 700, 90, 16),
    item("This page contains body text but no figure caption.", 40, 660, 500),
  ], viewport, 2);

  assert.deepEqual(regions, []);
});

test("pixel-row refinement skips a separated running header above the figure", () => {
  const densities = new Array(900).fill(0);
  for (let row = 110; row <= 132; row += 1) densities[row] = .08;
  for (let row = 220; row <= 610; row += 1) densities[row] = .03;
  for (let row = 360; row <= 374; row += 1) densities[row] = 0;

  assert.equal(findFigureContentTop(densities, 90, 700, 32), 220);
});
