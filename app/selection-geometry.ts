export type SelectionRect = { x: number; y: number; width: number; height: number; text: string };

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
