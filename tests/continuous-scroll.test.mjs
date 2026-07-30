import assert from "node:assert/strict";
import test from "node:test";

import { findClosestPageToViewportCenter, shouldRenderPage } from "../app/continuous-scroll.ts";

const frames = [
  { pageNumber: 1, offsetTop: 0, height: 900 },
  { pageNumber: 2, offsetTop: 918, height: 900 },
  { pageNumber: 3, offsetTop: 1836, height: 900 },
];

test("keeps the first page active while the viewport center remains closest to it", () => {
  assert.equal(findClosestPageToViewportCenter(300, 580, frames, 1), 1);
});

test("activates the next page continuously after its center becomes closest", () => {
  assert.equal(findClosestPageToViewportCenter(650, 580, frames, 1), 2);
});

test("falls back to the current page before page frames are registered", () => {
  assert.equal(findClosestPageToViewportCenter(0, 580, [], 7), 7);
});

test("renders the active page and two neighboring pages on each side", () => {
  assert.equal(shouldRenderPage(3, 5), true);
  assert.equal(shouldRenderPage(5, 5), true);
  assert.equal(shouldRenderPage(7, 5), true);
  assert.equal(shouldRenderPage(8, 5), false);
});
