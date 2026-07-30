export type ReadingProgressEntry = {
  page: number;
  updatedAt: number;
};

export type ReadingProgressMap = Record<string, ReadingProgressEntry>;

export type PanelWidths = {
  left: number;
  right: number;
};

export type ResizeSide = "left" | "right";

export const DEFAULT_PANEL_WIDTHS: PanelWidths = { left: 144, right: 420 };
export const PANEL_RESIZER_WIDTH = 7;
export const MIN_LEFT_PANEL_WIDTH = 88;
export const MAX_LEFT_PANEL_WIDTH = 300;
export const MIN_CENTER_PANEL_WIDTH = 360;
export const MIN_RIGHT_PANEL_WIDTH = 280;
export const MAX_RIGHT_PANEL_WIDTH = 720;
export const DEFAULT_CHAT_HEIGHT = 292;
export const MIN_CHAT_HEIGHT = 180;
export const MIN_READER_CONTENT_HEIGHT = 260;

function finiteNumber(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function clampPage(page: number, pageCount: number) {
  return Math.min(Math.max(1, Math.trunc(finiteNumber(page, 1))), Math.max(1, Math.trunc(finiteNumber(pageCount, 1))));
}

export function parseReadingProgress(raw: string | null): ReadingProgressMap {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, Partial<ReadingProgressEntry>>;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(Object.entries(parsed).flatMap(([paperId, entry]) => {
      if (!entry || typeof entry !== "object") return [];
      const page = Math.trunc(finiteNumber(entry.page, 0));
      const updatedAt = finiteNumber(entry.updatedAt, 0);
      return page >= 1 && updatedAt >= 0 ? [[paperId, { page, updatedAt }]] : [];
    }));
  } catch {
    return {};
  }
}

export function writeReadingProgress(raw: string | null, paperId: string, page: number, updatedAt = Date.now()) {
  return JSON.stringify({
    ...parseReadingProgress(raw),
    [paperId]: { page: Math.max(1, Math.trunc(page)), updatedAt },
  } satisfies ReadingProgressMap);
}

export function restoredReadingPage(storedPage: number, pageCount: number, localProgress?: ReadingProgressEntry) {
  return clampPage(localProgress?.page || storedPage || 1, pageCount);
}

export function clampPanelWidths(widths: PanelWidths, containerWidth: number): PanelWidths {
  const available = Math.max(
    MIN_LEFT_PANEL_WIDTH + MIN_CENTER_PANEL_WIDTH + MIN_RIGHT_PANEL_WIDTH,
    finiteNumber(containerWidth, 0) - PANEL_RESIZER_WIDTH * 2,
  );
  let left = Math.min(MAX_LEFT_PANEL_WIDTH, Math.max(MIN_LEFT_PANEL_WIDTH, finiteNumber(widths.left, DEFAULT_PANEL_WIDTHS.left)));
  let right = Math.min(MAX_RIGHT_PANEL_WIDTH, Math.max(MIN_RIGHT_PANEL_WIDTH, finiteNumber(widths.right, DEFAULT_PANEL_WIDTHS.right)));

  const overflow = left + right + MIN_CENTER_PANEL_WIDTH - available;
  if (overflow > 0) {
    const rightRoom = Math.max(0, right - MIN_RIGHT_PANEL_WIDTH);
    const rightReduction = Math.min(overflow, rightRoom);
    right -= rightReduction;
    left -= Math.min(overflow - rightReduction, Math.max(0, left - MIN_LEFT_PANEL_WIDTH));
  }
  return { left: Math.round(left), right: Math.round(right) };
}

export function resizePanelWidths(
  side: ResizeSide,
  start: PanelWidths,
  deltaX: number,
  containerWidth: number,
) {
  const next = side === "left"
    ? { ...start, left: start.left + deltaX }
    : { ...start, right: start.right - deltaX };
  return clampPanelWidths(next, containerWidth);
}

export function clampChatHeight(height: number, containerHeight: number) {
  const maxHeight = Math.max(
    MIN_CHAT_HEIGHT,
    finiteNumber(containerHeight, 0) - MIN_READER_CONTENT_HEIGHT,
  );
  return Math.round(Math.min(maxHeight, Math.max(MIN_CHAT_HEIGHT, finiteNumber(height, DEFAULT_CHAT_HEIGHT))));
}

export function resizeChatHeight(startHeight: number, deltaY: number, containerHeight: number) {
  return clampChatHeight(startHeight - deltaY, containerHeight);
}
