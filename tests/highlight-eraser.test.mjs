import assert from "node:assert/strict";
import test from "node:test";

import { eraseHighlightAtPoint } from "../app/highlight-eraser.ts";

const highlight = { id: "h1", groupId: "g1", x: .1, y: .2, width: .6, height: .04, text: "selected text" };

test("eraser leaves unrelated highlights untouched", () => {
  const highlights = [highlight];
  assert.equal(eraseHighlightAtPoint(highlights, { x: .8, y: .22 }, .02, .02, "stroke"), highlights);
});

test("eraser cuts only the touched portion of one highlight", () => {
  const erased = eraseHighlightAtPoint([highlight], { x: .4, y: .22 }, .05, .03, "stroke");
  assert.equal(erased.length, 2);
  assert.ok(Math.abs(erased[0].x - .1) < 1e-9);
  assert.ok(Math.abs(erased[0].width - .25) < 1e-9);
  assert.ok(Math.abs(erased[1].x - .45) < 1e-9);
  assert.ok(Math.abs(erased[1].width - .25) < 1e-9);
  assert.ok(erased.every((fragment) => fragment.groupId === "g1" && fragment.text === "selected text"));
});

test("eraser removes a highlight only when the whole mark is covered", () => {
  assert.deepEqual(eraseHighlightAtPoint([highlight], { x: .4, y: .22 }, .4, .05, "stroke"), []);
});

test("eraser drops hairline residue after a partial cut", () => {
  const erased = eraseHighlightAtPoint([highlight], { x: .4, y: .21975 }, .05, .01975, "stroke");
  assert.ok(erased.every((fragment) => fragment.width > .002 && fragment.height > .002));
});
