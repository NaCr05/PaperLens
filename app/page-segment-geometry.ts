export type TextLinePart = { x: number; width: number; height: number };

export type NormalizedTextRect = { x: number; y: number; width: number; height: number };
export type TextSegmentGeometry = { id: string; rects: NormalizedTextRect[] };
export type PdfTextGeometryItem = { str?: string; transform?: number[]; width?: number };
export type TextItemSegmentOwner = { text: string; segmentId: string };

export function splitTextLineParts<T extends TextLinePart>(parts: T[], viewportWidth: number): T[][] {
  const runs: T[][] = [];
  let run: T[] = [];
  const flush = () => {
    if (run.length) runs.push(run);
    run = [];
  };

  for (const part of [...parts].sort((a, b) => a.x - b.x)) {
    const previous = run[run.length - 1];
    const gap = previous ? part.x - (previous.x + previous.width) : 0;
    const height = Math.max(previous?.height || 0, part.height);
    const midpoint = viewportWidth / 2;
    const crossesColumnGutter = previous
      && previous.x + previous.width <= midpoint + viewportWidth * .025
      && part.x >= midpoint - viewportWidth * .025;
    // IEEE-style papers often have a gutter narrower than 1.35 em. A gap at
    // the page's centre needs a lower threshold than an ordinary in-line gap.
    const gutterThreshold = crossesColumnGutter
      ? Math.max(viewportWidth * .006, height * .65)
      : Math.max(viewportWidth * .012, height * 1.35);
    if (previous && gap > gutterThreshold) flush();
    run.push(part);
  }
  flush();
  return runs;
}

export function mergeAdjacentTextRects(rects: NormalizedTextRect[]): NormalizedTextRect[] {
  const merged: NormalizedTextRect[] = [];
  for (const rect of [...rects].sort((a, b) => a.y - b.y || a.x - b.x)) {
    const previous = merged[merged.length - 1];
    const sameLeft = previous && Math.abs(previous.x - rect.x) <= .006;
    const sameRight = previous && Math.abs((previous.x + previous.width) - (rect.x + rect.width)) <= .012;
    const verticalGap = previous ? rect.y - (previous.y + previous.height) : Number.POSITIVE_INFINITY;
    if (previous && sameLeft && sameRight && verticalGap >= -.003 && verticalGap <= .006) {
      const bottom = Math.max(previous.y + previous.height, rect.y + rect.height);
      previous.y = Math.min(previous.y, rect.y);
      previous.height = bottom - previous.y;
      continue;
    }
    merged.push({ ...rect });
  }
  return merged;
}

export function mapPdfTextItemsToSegments(
  items: PdfTextGeometryItem[],
  segments: TextSegmentGeometry[],
  viewportWidth: number,
  viewportHeight: number,
): TextItemSegmentOwner[] {
  return items
    .filter((item) => typeof item.str === "string" && item.str.trim().length > 0 && Array.isArray(item.transform))
    .map((item) => {
      const transform = item.transform!;
      const height = Math.max(Math.hypot(transform[2] || 0, transform[3] || 0), 6);
      const centerX = ((transform[4] || 0) + Math.max(item.width || 0, 1) / 2) / viewportWidth;
      const centerY = 1 - ((transform[5] || 0) + height / 2) / viewportHeight;
      const segment = segments.find((candidate) => candidate.rects.some((rect) => (
        centerX >= rect.x - .004 && centerX <= rect.x + rect.width + .004 &&
        centerY >= rect.y - .004 && centerY <= rect.y + rect.height + .004
      )));
      return { text: item.str!.trim(), segmentId: segment?.id || "" };
    });
}

function normalizedText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

export function alignRenderedTextToSegments(renderedTexts: string[], owners: TextItemSegmentOwner[]): string[] {
  if (renderedTexts.length === owners.length) return owners.map((owner) => owner.segmentId);

  let ownerIndex = 0;
  return renderedTexts.map((renderedText) => {
    const target = normalizedText(renderedText);
    if (!target) return "";
    const searchEnd = Math.min(owners.length, ownerIndex + 24);
    let matchIndex = -1;
    for (let index = ownerIndex; index < searchEnd; index += 1) {
      if (normalizedText(owners[index].text) === target) {
        matchIndex = index;
        break;
      }
    }
    if (matchIndex < 0) return "";
    ownerIndex = matchIndex + 1;
    return owners[matchIndex].segmentId;
  });
}
