import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_CHAT_HEIGHT,
  DEFAULT_PANEL_WIDTHS,
  clampChatHeight,
  clampPanelWidths,
  parseReadingProgress,
  resizeChatHeight,
  resizePanelWidths,
  restoredReadingPage,
  writeReadingProgress,
} from "../app/reader-workspace.ts";

test("local reading progress overrides a stale stored page and stays bounded", () => {
  assert.equal(restoredReadingPage(1, 72, { page: 10, updatedAt: 100 }), 10);
  assert.equal(restoredReadingPage(8, 9, { page: 20, updatedAt: 100 }), 9);
});

test("reading progress storage tolerates malformed data", () => {
  assert.deepEqual(parseReadingProgress("not-json"), {});
  const updated = writeReadingProgress("not-json", "paper-a", 10, 123);
  assert.deepEqual(parseReadingProgress(updated), { "paper-a": { page: 10, updatedAt: 123 } });
});

test("dragging the left divider left grows the center panel", () => {
  assert.deepEqual(resizePanelWidths("left", DEFAULT_PANEL_WIDTHS, -40, 1400), { left: 104, right: 420 });
});

test("dragging the right divider right grows the center panel", () => {
  assert.deepEqual(resizePanelWidths("right", DEFAULT_PANEL_WIDTHS, 60, 1400), { left: 144, right: 360 });
});

test("panel widths preserve a usable center column", () => {
  assert.deepEqual(clampPanelWidths({ left: 300, right: 720 }, 900), { left: 246, right: 280 });
});

test("dragging the AI Chat divider upward grows the drawer", () => {
  assert.equal(resizeChatHeight(DEFAULT_CHAT_HEIGHT, -80, 900), 372);
});

test("AI Chat height preserves a usable paper reading area", () => {
  assert.equal(clampChatHeight(900, 700), 440);
  assert.equal(clampChatHeight(20, 700), 180);
});
