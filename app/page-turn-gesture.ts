export type PageTurnDirection = -1 | 0 | 1;

export type PageTurnIntent = {
  direction: PageTurnDirection;
  distance: number;
  lastEventAt: number;
};

export const EMPTY_PAGE_TURN_INTENT: PageTurnIntent = {
  direction: 0,
  distance: 0,
  lastEventAt: 0,
};

export const WHEEL_PAGE_TURN_THRESHOLD = 150;
export const TOUCH_PAGE_TURN_THRESHOLD = 72;
export const PAGE_TURN_WINDOW_MS = 420;
export const PAGE_TURN_COOLDOWN_MS = 650;

export function accumulatePageTurnIntent(
  previous: PageTurnIntent,
  input: {
    deltaY: number;
    atStart: boolean;
    atEnd: boolean;
    timestamp: number;
    threshold: number;
  },
): { intent: PageTurnIntent; turn: PageTurnDirection } {
  const direction: PageTurnDirection = input.deltaY > 0 ? 1 : input.deltaY < 0 ? -1 : 0;
  const atRequestedBoundary = direction === 1 ? input.atEnd : direction === -1 ? input.atStart : false;
  if (!direction || !atRequestedBoundary) {
    return { intent: { ...EMPTY_PAGE_TURN_INTENT }, turn: 0 };
  }

  const continuesPreviousGesture = previous.direction === direction && input.timestamp - previous.lastEventAt <= PAGE_TURN_WINDOW_MS;
  const distance = (continuesPreviousGesture ? previous.distance : 0) + Math.abs(input.deltaY);
  if (distance >= input.threshold) {
    return { intent: { ...EMPTY_PAGE_TURN_INTENT }, turn: direction };
  }

  return {
    intent: { direction, distance, lastEventAt: input.timestamp },
    turn: 0,
  };
}
