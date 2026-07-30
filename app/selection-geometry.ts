export type SelectionRect = { x: number; y: number; width: number; height: number; text: string };

export function shouldLockMarkerToLine(startY: number, currentY: number, lineHeight: number): boolean {
  return Math.abs(currentY - startY) <= Math.max(8, lineHeight * 1.15);
}

export function normalizeSelectionRect(
  rect: { left: number; top: number; right: number; bottom: number },
  frame: { left: number; top: number; width: number; height: number },
  text: string,
): SelectionRect | null {
  const left = Math.max(frame.left, Math.min(frame.left + frame.width, rect.left));
  const right = Math.max(frame.left, Math.min(frame.left + frame.width, rect.right));
  const top = Math.max(frame.top, Math.min(frame.top + frame.height, rect.top));
  const bottom = Math.max(frame.top, Math.min(frame.top + frame.height, rect.bottom));
  if (right - left <= 1 || bottom - top <= 1) return null;
  return {
    x: (left - frame.left) / frame.width,
    y: (top - frame.top) / frame.height,
    width: (right - left) / frame.width,
    height: (bottom - top) / frame.height,
    text,
  };
}

export function mergeSelectionRects(rects: SelectionRect[]): SelectionRect[] {
  const ordered = [...rects].sort((a, b) => Math.abs(a.y - b.y) > .004 ? a.y - b.y : a.x - b.x);
  const merged: SelectionRect[] = [];
  for (const rect of ordered) {
    const current = merged[merged.length - 1];
    const currentMiddle = current ? current.y + current.height / 2 : 0;
    const rectMiddle = rect.y + rect.height / 2;
    const sameLine = current && Math.abs(currentMiddle - rectMiddle) <= Math.max(current.height, rect.height) * .55;
    const touches = current && rect.x <= current.x + current.width + .012;
    if (!current || !sameLine || !touches) {
      merged.push({ ...rect });
      continue;
    }
    const right = Math.max(current.x + current.width, rect.x + rect.width);
    const bottom = Math.max(current.y + current.height, rect.y + rect.height);
    current.x = Math.min(current.x, rect.x);
    current.y = Math.min(current.y, rect.y);
    current.width = right - current.x;
    current.height = bottom - current.y;
  }
  return merged;
}
