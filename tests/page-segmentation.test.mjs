import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { buildPageSegments, compatibleTranslationPages, isPageTranslationCompatible } from "../app/page-segmentation.ts";
import { mapPdfTextItemsToSegments } from "../app/page-segment-geometry.ts";

const viewport = { width: 600, height: 840 };
const transform = (x, y, size = 10) => [size, 0, 0, size, x, y];
const item = (str, x, y, width, fontName = "body", size = 10) => ({ str, transform: transform(x, y, size), width, fontName });

test("keeps the real slide's wrapped sentence in one selectable paragraph", async () => {
  const fixture = JSON.parse(await readFile(new URL("./fixtures/modelling-ode-page11.json", import.meta.url), "utf8"));
  const segments = buildPageSegments(fixture.items, fixture.viewport, 11);
  const paragraph = segments.find((segment) => segment.text.startsWith("Key idea"));
  assert.equal(paragraph?.text, "Key idea in modelling with an ODE: identify how a quantity is changing");
  assert.equal(paragraph?.rects.length, 2);
  const owners = mapPdfTextItemsToSegments(fixture.items, segments, fixture.viewport.width, fixture.viewport.height);
  assert.equal(owners.find((owner) => owner.text === "changing")?.segmentId, paragraph.id);
  assert.equal(owners.find((owner) => owner.text.startsWith("Key idea"))?.segmentId, paragraph.id);
  assert.notEqual(owners.find((owner) => owner.text.startsWith("What is it"))?.segmentId, paragraph.id);
  assert.notEqual(owners.find((owner) => owner.text.startsWith("How can you"))?.segmentId, paragraph.id);
});

test("keeps a displaced slide note out of the full-width paragraph", async () => {
  const fixture = JSON.parse(await readFile(new URL("./fixtures/modelling-ode-page11.json", import.meta.url), "utf8"));
  for (const [x, y] of [[65, 209.063], [28.346, 200]]) {
    const items = fixture.items.map((item) => item.str === "changing"
      ? { ...item, transform: [...item.transform.slice(0, 4), x, y] } : item);
    const segments = buildPageSegments(items, fixture.viewport, 11);
    assert.equal(segments.find((segment) => segment.text.startsWith("Key idea"))?.rects.length, 1);
  }
});

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

test("invalidates flattened text translations when source geometry is a table", () => {
  const source = [0, 1, 2, 3].flatMap((row) => [0, 1, 2, 3].map((column) => ({
    id: `p8-v2-s${row * 4 + column + 1}`,
    text: `cell-${row}-${column}`,
    kind: "paragraph",
    rects: [{ x: .08 + column * .2, y: .2 + row * .1, width: .12, height: .02 }],
  })));
  const flattened = source.map((segment) => ({ id: segment.id, translation: `译文 ${segment.text}` }));
  assert.equal(isPageTranslationCompatible(8, flattened, source), false);
  assert.equal(isPageTranslationCompatible(8, [{ id: "p8-visual", translation: "| 表头 |\n| --- |" }], source), true);
});

test("requires exact segment coverage when live source segments are available", () => {
  const source = [
    { id: "p5-v2-s1", text: "One", kind: "paragraph", rects: [{ x: .1, y: .2, width: .5, height: .02 }] },
    { id: "p5-v2-s2", text: "Two", kind: "paragraph", rects: [{ x: .1, y: .3, width: .5, height: .02 }] },
  ];
  assert.equal(isPageTranslationCompatible(5, [
    { id: "p5-v2-s1", translation: "一" },
    { id: "p5-v2-s2", translation: "二" },
  ], source), true);
  assert.equal(isPageTranslationCompatible(5, [{ id: "p5-v2-s1", translation: "一" }], source), false);
});

test("keeps an explicitly visual translation after text-layer recovery", () => {
  const source = buildPageSegments([item("Modelling with ODE", 60, 500, 200)], viewport, 12);
  const translated = [{ id: "p12-visual", translation: "用常微分方程建模" }];
  assert.equal(isPageTranslationCompatible(12, translated, source), true);
  assert.equal(isPageTranslationCompatible(11, translated, source), false);
  assert.equal(isPageTranslationCompatible(12, [{ ...translated[0], translation: "" }], source), false);
});

test("keeps narrow-gutter two-column text in separate complete paragraphs", () => {
  const items = [];
  for (let row = 0; row < 8; row += 1) {
    items.push(item(`Left column sentence ${row} continues`, 54, 500 - row * 12, 247));
    items.push(item(`Right column sentence ${row} continues`, 312, 500 - row * 12, 247));
  }
  const segments = buildPageSegments(items, { width: 612, height: 792 }, 6);
  assert.equal(segments.length, 2);
  assert.match(segments[0].text, /^Left column sentence 0/);
  assert.match(segments[1].text, /^Right column sentence 0/);
  assert.ok(!segments.some((segment) => /Left column[\s\S]*Right column|Right column[\s\S]*Left column/.test(segment.text)));
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
