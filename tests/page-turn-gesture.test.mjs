import assert from "node:assert/strict";
import test from "node:test";

import {
  accumulatePageTurnIntent,
  EMPTY_PAGE_TURN_INTENT,
  TOUCH_PAGE_TURN_THRESHOLD,
  WHEEL_PAGE_TURN_THRESHOLD,
} from "../app/page-turn-gesture.ts";

test("keeps ordinary in-page scrolling from changing pages", () => {
  const result = accumulatePageTurnIntent(EMPTY_PAGE_TURN_INTENT, {
    deltaY: 220,
    atStart: false,
    atEnd: false,
    timestamp: 100,
    threshold: WHEEL_PAGE_TURN_THRESHOLD,
  });
  assert.equal(result.turn, 0);
  assert.equal(result.intent.distance, 0);
});

test("turns exactly one page after a deliberate downward boundary scroll", () => {
  const first = accumulatePageTurnIntent(EMPTY_PAGE_TURN_INTENT, {
    deltaY: 80,
    atStart: false,
    atEnd: true,
    timestamp: 100,
    threshold: WHEEL_PAGE_TURN_THRESHOLD,
  });
  assert.equal(first.turn, 0);

  const second = accumulatePageTurnIntent(first.intent, {
    deltaY: 80,
    atStart: false,
    atEnd: true,
    timestamp: 180,
    threshold: WHEEL_PAGE_TURN_THRESHOLD,
  });
  assert.equal(second.turn, 1);
  assert.equal(second.intent.distance, 0);
});

test("does not combine slow, unrelated wheel movements", () => {
  const first = accumulatePageTurnIntent(EMPTY_PAGE_TURN_INTENT, {
    deltaY: 100,
    atStart: false,
    atEnd: true,
    timestamp: 100,
    threshold: WHEEL_PAGE_TURN_THRESHOLD,
  });
  const second = accumulatePageTurnIntent(first.intent, {
    deltaY: 100,
    atStart: false,
    atEnd: true,
    timestamp: 800,
    threshold: WHEEL_PAGE_TURN_THRESHOLD,
  });
  assert.equal(second.turn, 0);
  assert.equal(second.intent.distance, 100);
});

test("supports an upward boundary swipe with a touch-sized threshold", () => {
  const result = accumulatePageTurnIntent(EMPTY_PAGE_TURN_INTENT, {
    deltaY: -TOUCH_PAGE_TURN_THRESHOLD,
    atStart: true,
    atEnd: false,
    timestamp: 100,
    threshold: TOUCH_PAGE_TURN_THRESHOLD,
  });
  assert.equal(result.turn, -1);
});
