import assert from "node:assert/strict";
import test from "node:test";

import { buildPageSegments } from "../app/page-segmentation.ts";

const viewport = { width: 600, height: 840 };
const transform = (x, y, size = 10) => [size, 0, 0, size, x, y];
const item = (str, x, y, width, fontName = "body", size = 10) => ({ str, transform: transform(x, y, size), width, fontName });

test("keeps inline-heading paragraphs separate and excludes text embedded in a figure", () => {
  const items = [
    item("3.1. Model Architecture", 60, 500, 190, "heading", 14),
    item("RoboTTT integrates TTT layers into robot foundation models.", 60, 470, 430),
    item("It applies to a broad range of backbones.", 60, 457, 300),
    item("Test-Time Training for Robot Actions", 60, 430, 170, "bold"),
    item("As shown in Fig. 2, RoboTTT consists of a vision-language model.", 235, 430, 300),
    item("At timestep t, it predicts an action chunk.", 60, 417, 430),
    item("The TTT layers process information across time.", 60, 404, 420),
    item("Gating for Preserving Pretrained Capabilities", 60, 380, 215, "bold"),
    item("To retain pretrained capabilities", 280, 380, 130),
    item("Attn", 430, 380, 25, "diagram"),
    item("the model is initialized from the base weights", 60, 367, 280),
    item("Flatten over time", 410, 367, 90, "diagram"),
    item("and uses a learned gating mechanism.", 60, 354, 265),
    item("TTT Layer", 430, 354, 55, "diagram"),
    item("The contribution stays small at the start of training.", 60, 341, 290),
    item("Figure 3: Computation flow with tanh gating.", 350, 130, 190, "bold"),
    item("The output is added to the attention output.", 350, 117, 180),
    item("4", 535, 35, 7),
  ];
  const figures = [{
    id: "p4-figure-1",
    label: "Figure 3",
    caption: "Figure 3: Computation flow with tanh gating.",
    rect: { x: .56, y: .52, width: .36, height: .29 },
    captionRect: { x: .58, y: .82, width: .32, height: .05 },
  }];

  const segments = buildPageSegments(items, viewport, 4, figures);
  const texts = segments.map((segment) => segment.text);
  assert.equal(texts.some((text) => /Attn|Flatten over time|TTT Layer/.test(text)), false);
  assert.equal(texts.includes("4"), false);
  assert.equal(texts.filter((text) => text.startsWith("RoboTTT integrates")).length, 1);
  assert.equal(texts.filter((text) => text.startsWith("Test-Time Training for Robot Actions")).length, 1);
  assert.equal(texts.filter((text) => text.startsWith("Gating for Preserving Pretrained Capabilities")).length, 1);
  const gating = segments.find((segment) => segment.text.startsWith("Gating for Preserving Pretrained Capabilities"));
  assert.match(gating?.text || "", /base weights/);
  assert.match(gating?.text || "", /start of training/);
  assert.ok(gating && gating.rects.every((rect) => rect.x + rect.width < .7));
});
