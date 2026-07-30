import assert from "node:assert/strict";
import test from "node:test";

import { buildDetectedPaperOutline, extractEmbeddedPaperOutline, isLikelyPaperHeading, selectMajorPaperOutline } from "../app/paper-outline.ts";

test("resolves embedded PDF bookmarks to clickable one-based pages", async () => {
  const document = {
    numPages: 12,
    getOutline: async () => [
      { title: "Abstract", dest: [{ num: 7, gen: 0 }], items: [] },
      {
        title: "2 Method",
        dest: "method-page",
        items: [{ title: "2.1 Architecture", dest: [5], items: [] }],
      },
    ],
    getDestination: async (id) => id === "method-page" ? [3] : null,
    getPageIndex: async (reference) => reference.num === 7 ? 0 : -1,
  };

  assert.deepEqual(await extractEmbeddedPaperOutline(document), [
    { id: "pdf-outline-1", title: "Abstract", pageNumber: 1, level: 0, source: "pdf" },
    { id: "pdf-outline-2", title: "2 Method", pageNumber: 4, level: 0, source: "pdf" },
    { id: "pdf-outline-2-1", title: "2.1 Architecture", pageNumber: 6, level: 1, source: "pdf" },
  ]);
});

test("uses the first child page for a bookmark group without its own destination", async () => {
  const document = {
    numPages: 8,
    getOutline: async () => [{ title: "Appendix", dest: null, items: [{ title: "A Details", dest: [6], items: [] }] }],
  };

  const outline = await extractEmbeddedPaperOutline(document);
  assert.equal(outline[0].title, "Appendix");
  assert.equal(outline[0].pageNumber, 7);
});

test("keeps section headings and rejects body fragments when detecting an outline", () => {
  assert.equal(isLikelyPaperHeading("Abstract"), true);
  assert.equal(isLikelyPaperHeading("3.2 Test-Time Training"), true);
  assert.equal(isLikelyPaperHeading("Its capacity is larger than the recurrent neural network state."), false);
  assert.equal(isLikelyPaperHeading("[[SOURCE_FORMULA]]"), false);
  assert.equal(isLikelyPaperHeading("12 FPS · Clean"), false);
  assert.equal(isLikelyPaperHeading("2.3× faster"), false);
  assert.equal(isLikelyPaperHeading("X K"), false);

  assert.deepEqual(buildDetectedPaperOutline([
    { title: "Abstract", pageNumber: 1 },
    { title: "1 Introduction", pageNumber: 2 },
    { title: "2. Related Work", pageNumber: 3 },
    { title: "2.1 Context Expansion", pageNumber: 4 },
    { title: "2.1 Context Expansion", pageNumber: 5 },
    { title: "Its capacity is larger than the recurrent neural network state.", pageNumber: 5 },
    { title: "Conclusion", pageNumber: 9 },
  ]), [
    { id: "detected-outline-1-1", title: "Abstract", pageNumber: 1, level: 0, source: "detected" },
    { id: "detected-outline-2-2", title: "1 Introduction", pageNumber: 2, level: 0, source: "detected" },
    { id: "detected-outline-3-3", title: "2. Related Work", pageNumber: 3, level: 0, source: "detected" },
    { id: "detected-outline-4-4", title: "2.1 Context Expansion", pageNumber: 4, level: 1, source: "detected" },
    { id: "detected-outline-9-5", title: "Conclusion", pageNumber: 9, level: 0, source: "detected" },
  ]);
});

test("shows the paper's major section level instead of every subsection", () => {
  assert.deepEqual(selectMajorPaperOutline([
    { id: "1", title: "Abstract", pageNumber: 1, level: 0, source: "detected" },
    { id: "2", title: "1 Introduction", pageNumber: 2, level: 0, source: "detected" },
    { id: "3", title: "2 Method", pageNumber: 3, level: 0, source: "detected" },
    { id: "4", title: "2.1 Architecture", pageNumber: 4, level: 1, source: "detected" },
  ]).map((item) => item.title), ["Abstract", "1 Introduction", "2 Method"]);

  assert.deepEqual(selectMajorPaperOutline([
    { id: "root", title: "Paper", pageNumber: 1, level: 0, source: "pdf" },
    { id: "a", title: "Introduction", pageNumber: 2, level: 1, source: "pdf" },
    { id: "b", title: "Method", pageNumber: 4, level: 1, source: "pdf" },
  ]).map((item) => item.title), ["Introduction", "Method"]);
});
