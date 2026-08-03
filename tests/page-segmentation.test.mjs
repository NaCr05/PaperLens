import assert from "node:assert/strict";
import test from "node:test";

import { buildPageSegments, compatibleTranslationPages, isPageTranslationCompatible } from "../app/page-segmentation.ts";

const viewport = { width: 600, height: 840 };
const transform = (x, y, size = 10) => [size, 0, 0, size, x, y];
const item = (str, x, y, width, fontName = "body", size = 10) => ({ str, transform: transform(x, y, size), width, fontName });

test("keeps complete translations valid across transient source re-segmentation", () => {
  const current = [
    { id: "p8-v2-s1", translation: "第一段" },
    { id: "p8-v2-s2", translation: "第二段" },
  ];
  assert.equal(isPageTranslationCompatible(8, current), true);
  assert.equal(isPageTranslationCompatible(8, [{ id: "p8-s1", translation: "旧译文" }]), false);
  assert.equal(isPageTranslationCompatible(8, [{ id: "p8-v2-s1", translation: "已保存的单段译文" }]), true);
  assert.equal(isPageTranslationCompatible(8, [{ id: "p8-v2-s1", translation: "" }, current[1]]), false);
  assert.equal(isPageTranslationCompatible(8, [{ id: "p8-v2-s2", translation: "缺少首段" }]), false);
});

test("counts only compatible pages and keeps stale cache out of full translation progress", () => {
  const pages = compatibleTranslationPages({
    7: [{ id: "p7-v2-s1", translation: "当前译文" }],
    8: [{ id: "p8-s1", translation: "旧版译文" }],
    9: [{ id: "p9-v2-s1", translation: "" }],
    10: [{ id: "p10-visual", translation: "整页图片译文" }],
  });
  assert.deepEqual(pages, [7, 10]);
});

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

test("coalesces one display equation's offset glyph runs into one formula segment", () => {
  const items = [
    item("To summarize, we minimize", 60, 390, 180),
    item("ℒ fm ( 𝜉 ; 𝑊 0 ) =", 112, 346, 95),
    item("1 ∑︁ 𝑡", 178, 356, 22, "math", 7),
    item("ℓ 𝑡 ( 𝜉 𝑡 ; 𝑊 𝑡 − 1 ) =", 203, 346, 90),
    item("1 ∑︁ 𝑡", 271, 356, 22, "math", 7),
    item("E 𝑡 ,𝜖 [︁ ‖ 𝑣 𝜃 ( Φ 𝑡 ) − ( 𝐴 𝑡 − 𝜖 ) ‖ 2 ]︁", 296, 346, 190),
    item("𝑡 = 1", 185, 335, 18, "math", 7),
    item("𝑡 = 1", 278, 335, 18, "math", 7),
    item("(5)", 520, 346, 14),
    item("where each noise level is sampled independently.", 60, 316, 310),
  ];

  const segments = buildPageSegments(items, viewport, 5);
  const formulas = segments.filter((segment) => segment.kind === "formula");
  assert.equal(formulas.length, 1);
  assert.match(formulas[0].text, /\(5\)/);
  assert.match(formulas[0].text, /∑/);
  assert.ok(formulas[0].rects.length >= 3);
});
