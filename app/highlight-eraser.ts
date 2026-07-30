export type EraserPoint = { x: number; y: number };

export type ErasableHighlight = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

// Fragments thinner than roughly one PDF-page pixel are visual residue rather
// than useful highlight content, so discard them after a cut.
const MIN_FRAGMENT_SIZE = 0.002;

export function eraseHighlightAtPoint<T extends ErasableHighlight>(
  highlights: T[],
  point: EraserPoint,
  radiusX: number,
  radiusY: number,
  eraseId: string,
) {
  let changed = false;
  const next: T[] = [];
  highlights.forEach((highlight, highlightIndex) => {
    const left = highlight.x;
    const top = highlight.y;
    const right = highlight.x + highlight.width;
    const bottom = highlight.y + highlight.height;
    const eraseLeft = point.x - radiusX;
    const eraseTop = point.y - radiusY;
    const eraseRight = point.x + radiusX;
    const eraseBottom = point.y + radiusY;
    const cutLeft = Math.max(left, eraseLeft);
    const cutTop = Math.max(top, eraseTop);
    const cutRight = Math.min(right, eraseRight);
    const cutBottom = Math.min(bottom, eraseBottom);

    if (cutLeft >= cutRight || cutTop >= cutBottom) {
      next.push(highlight);
      return;
    }

    changed = true;
    const fragments = [
      { x: left, y: top, width: highlight.width, height: cutTop - top },
      { x: left, y: cutBottom, width: highlight.width, height: bottom - cutBottom },
      { x: left, y: cutTop, width: cutLeft - left, height: cutBottom - cutTop },
      { x: cutRight, y: cutTop, width: right - cutRight, height: cutBottom - cutTop },
    ].filter((fragment) => fragment.width > MIN_FRAGMENT_SIZE && fragment.height > MIN_FRAGMENT_SIZE);

    const baseId = highlight.id.split("-erased-")[0];
    fragments.forEach((fragment, index) => {
      next.push({ ...highlight, ...fragment, id: `${baseId}-erased-${eraseId}-${highlightIndex}-${index}` });
    });
  });
  return changed ? next : highlights;
}
