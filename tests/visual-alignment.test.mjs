import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";
import {buildPageSegments} from "../app/page-segmentation.ts";
import {alignCachedVisualTranslation, parseVisualBlocks, sourceSegmentAtPoint, visualPageMapping} from "../app/visual-alignment.ts";
import {parseTranslationResponse} from "../app/translation-response.ts";

const translation = String.raw`# 一些著名的微分方程

## 受迫弹簧

\[my''+\gamma y'+ky=F(t)\]

## 热方程

\[\frac{\partial u}{\partial t}=k\left(\frac{\partial^2u}{\partial x^2}+\frac{\partial^2u}{\partial y^2}\right)\]

## 薛定谔方程

\[i\hbar\frac{\partial\Psi}{\partial t}=-\frac{\hbar}{2m}\frac{\partial^2\Psi}{\partial x^2}+V\Psi\]

## 洛伦兹系统

\[x'=\sigma(y-x)\]

\[y'=x(\rho-z)-y\]

\[z'=xy-\beta z\]

## 逻辑斯蒂方程

\[\frac{dy}{dt}=ry\left(1-\frac{y}{K}\right)\]

Prof. Maximilian Klambauer

第 1 讲，MAT244 H1F`;

test("recovers cached equations across differing Chinese/English column order", async () => {
  const fixture = JSON.parse(await readFile(new URL("./fixtures/differential-equations-page3.json", import.meta.url), "utf8"));
  const source = buildPageSegments(fixture.items,fixture.viewport,3);
  const blocks = alignCachedVisualTranslation(translation, source);
  assert.equal(blocks.length,8);
  for (const [label, original] of [["受迫弹簧","Forced spring"],["热方程","Heat equation"],["薛定谔","Schrodinger"],["洛伦兹","Lorenz system"],["逻辑斯蒂","Logistic equation"]]) {
    const block = blocks.find(b=>b.translation.includes(label));
    assert.ok(block?.rects.length, label);
    assert.ok(block.sourceText.includes(original), label + ": " + block.sourceText);
  }
  const mapped = visualPageMapping(3,[{id:"p3-visual",translation,formulaExplanation:""}],source);
  const heat = mapped.source.find(s=>s.text.includes("Heat equation"));
  assert.ok(heat.rects.every(r=>r.x>.5));
  const spring = mapped.source.find(s=>s.text.includes("Forced spring"));
  assert.ok(spring.rects.every(r=>r.x<.5));
  assert.equal(sourceSegmentAtPoint(mapped.source,heat.rects[0].x+.002,heat.rects[0].y+.002)?.id, heat.id);
  assert.ok(mapped.translations.some(t=>t.id===heat.id && t.translation.includes("热方程")));
});

test("does not invent correspondence for unrelated cached prose", () => {
  const blocks = alignCachedVisualTranslation("这是一个无法确定对应原文的段落。", [{id:"p1-s1",text:"Unrelated original",kind:"paragraph",rects:[{x:.1,y:.2,width:.7,height:.1}]}]);
  assert.equal(blocks[0].rects.length,0);
});

test("preserves validated visual blocks through JSON storage and rejects invalid geometry or coverage", () => {
  const visualBlocks = [{translation:"标题",sourceText:"Title",rects:[{x:.1,y:.1,width:.5,height:.1}]},{translation:"正文",sourceText:"Body",rects:[{x:.1,y:.3,width:.5,height:.2}]}];
  const source = [{id:"p1-visual",requireVisualBlocks:true}];
  const answer = JSON.stringify({segments:[{id:"p1-visual",translation:"标题\n\n正文",visualBlocks}]});
  const parsed = parseTranslationResponse(answer,source).translated;
  assert.deepEqual(JSON.parse(JSON.stringify(parsed))[0].visualBlocks,visualBlocks);
  assert.equal(visualPageMapping(1,parsed,[]).source.length,2);
  assert.throws(()=>parseVisualBlocks([{...visualBlocks[0],rects:[{x:.8,y:.1,width:.5,height:.1}]}]));
  assert.throws(()=>parseTranslationResponse(JSON.stringify({segments:[{id:"p1-visual",translation:"遗漏正文",visualBlocks}]}),source));
  assert.throws(()=>parseTranslationResponse(JSON.stringify({segments:[{id:"p1-visual",translation:"没有对应关系"}]}),source));
});
