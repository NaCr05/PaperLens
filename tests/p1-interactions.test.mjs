import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  isCurrentDocumentGeneration,
  isImeCompositionEvent,
  normalizeCommittedPageInput,
} from "../app/interaction-guards.ts";

test("page input stays editable until commit, then truncates and clamps", () => {
  assert.equal(normalizeCommittedPageInput("15", 2, 72), 15);
  assert.equal(normalizeCommittedPageInput("2.5", 9, 72), 2);
  assert.equal(normalizeCommittedPageInput("999", 9, 72), 72);
  assert.equal(normalizeCommittedPageInput("0", 9, 72), 1);
  assert.equal(normalizeCommittedPageInput("", 9, 72), 9);
  assert.equal(normalizeCommittedPageInput("not-a-page", 9, 72), 9);
});

test("IME confirmation Enter is not treated as a chat submission", () => {
  assert.equal(isImeCompositionEvent({ isComposing: true }), true);
  assert.equal(isImeCompositionEvent({ isComposing: false, keyCode: 229 }), true);
  assert.equal(isImeCompositionEvent({ isComposing: false, keyCode: 13 }), false);
});

test("document generation accepts only the current load", () => {
  assert.equal(isCurrentDocumentGeneration(4, 4), true);
  assert.equal(isCurrentDocumentGeneration(3, 4), false);
});

test("P1 persistence and async isolation contracts stay wired", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");

  assert.match(page, /highlights\?: Record<number, HighlightRect\[\]>/);
  assert.match(page, /highlights: restoredHighlights/);
  assert.match(page, /setHighlights\(restoredHighlights\)/);
  assert.match(page, /updateStoredPaper\(paperId, \{ highlights: nextHighlights, highlightsUpdatedAt: Date\.now\(\) \}\)/);
  assert.match(page, /highlightSaveQueueRef\.current = highlightSaveQueueRef\.current/);
  assert.match(page, /paperWriteBarrierRef\.current\.set\(paperId, initialPaperWrite\)/);
  assert.match(page, /\.then\(\(\) => paperWriteBarrier\)[\s\S]{0,180}updateStoredPaper\(paperId, \{ highlights:/);
  assert.doesNotMatch(page, /setHighlights\(\(previous\)[\s\S]{0,500}updateStoredPaper/);

  assert.match(page, /const openGeneration = \+\+documentGenerationRef\.current;[\s\S]{0,900}await getStoredPaper\(paper\.id\)/);
  assert.match(page, /const pendingHighlightWrites = highlightSaveQueueRef\.current;[\s\S]{0,350}await pendingHighlightWrites\.catch\(\(\) => undefined\);[\s\S]{0,220}await getStoredPaper\(paper\.id\)/);
  assert.match(page, /generation: openGeneration/);
  assert.match(page, /const loadIsCurrent = \(\) => isCurrentDocumentGeneration\(loadGeneration, documentGenerationRef\.current\)/);
  assert.match(page, /chatAbortRef\.current\?\.abort\(\);[\s\S]{0,160}setIsChatting\(false\)/);
  assert.match(page, /const requestIsCurrent = \(\) => \([\s\S]{0,300}isCurrentDocumentGeneration\(requestGeneration, documentGenerationRef\.current\)/);
  assert.match(page, /if \(!requestIsCurrent\(\)\) return;[\s\S]{0,120}setChatMessages/);
  assert.match(page, /if \(chatAbortRef\.current === controller\) \{[\s\S]{0,180}setIsChatting\(false\)/);

  assert.match(page, /const chatPageSource = await getTranslationSource\(requestPage, controller\.signal, requestGeneration\)/);
  assert.match(page, /text extraction failed; using visual fallback[\s\S]{0,180}content = \{ items: \[\] \}/);
  assert.match(page, /pageText: chatPageSource\.text/);
  assert.match(page, /images: \[\.\.\.chatPageSource\.images, \.\.\.chatImages\]/);
  assert.match(page, /if \(isImeCompositionEvent\(event\.nativeEvent\)\) return;/);

  assert.match(page, /value=\{pageInput\}/);
  assert.match(page, /if \(!pageInputFocusedRef\.current\) setPageInput\(String\(pageNumber\)\)/);
  assert.match(page, /onFocus=\{\(\) => \{ pageInputFocusedRef\.current = true; \}\}/);
  assert.match(page, /onChange=\{\(event\) => setPageInput\(event\.target\.value\)\}/);
  assert.match(page, /pageInputFocusedRef\.current = false;[\s\S]{0,260}commitPageNumberInput\(event\.currentTarget\.value\)/);
});
