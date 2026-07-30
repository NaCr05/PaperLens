import { splitTextLineParts } from "./page-segment-geometry.ts";

export type FigureTextItem = { str?: string; transform?: number[]; width?: number };
export type FigureViewport = { width: number; height: number };
export type FigureRegion = {
  id: string;
  label: string;
  caption: string;
  rect: { x: number; y: number; width: number; height: number };
  captionRect: { x: number; y: number; width: number; height: number };
};

type PositionedLine = {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  right: number;
  top: number;
  bottom: number;
};

const CAPTION_PATTERN = /^(?:fig(?:ure)?\.?|图)\s*([A-Z]?\d+(?:[.-]\d+)?)/i;

function buildLines(items: FigureTextItem[], viewport: FigureViewport): PositionedLine[] {
  const positioned = items
    .filter((item): item is Required<Pick<FigureTextItem, "str" | "transform">> & FigureTextItem => (
      typeof item.str === "string" && item.str.trim().length > 0 && Array.isArray(item.transform)
    ))
    .map((item) => ({
      text: item.str.trim(),
      x: item.transform[4] || 0,
      y: item.transform[5] || 0,
      width: Math.max(item.width || 0, 1),
      height: Math.max(Math.hypot(item.transform[2] || 0, item.transform[3] || 0), 6),
    }));

  const buckets: { y: number; height: number; parts: typeof positioned }[] = [];
  for (const item of [...positioned].sort((a, b) => b.y - a.y || a.x - b.x)) {
    let bucket = buckets.find((candidate) => Math.abs(candidate.y - item.y) <= Math.max(3, item.height * .42));
    if (!bucket) {
      bucket = { y: item.y, height: item.height, parts: [] };
      buckets.push(bucket);
    }
    bucket.parts.push(item);
    bucket.height = Math.max(bucket.height, item.height);
  }

  return buckets.flatMap((bucket) => splitTextLineParts(bucket.parts, viewport.width).map((run) => {
    const parts = run.sort((a, b) => a.x - b.x);
    const x = Math.min(...parts.map((part) => part.x));
    const right = Math.max(...parts.map((part) => part.x + part.width));
    const height = Math.max(...parts.map((part) => part.height));
    const top = Math.max(0, 1 - (bucket.y + height * 1.15) / viewport.height);
    const bottom = Math.min(1, 1 - (bucket.y - height * .25) / viewport.height);
    return {
      text: parts.map((part) => part.text).join(" ").replace(/\s+/g, " ").trim(),
      x,
      y: bucket.y,
      width: right - x,
      height,
      right,
      top,
      bottom,
    };
  })).sort((a, b) => a.top - b.top || a.x - b.x);
}

export function detectCaptionFigureRegions(items: FigureTextItem[], viewport: FigureViewport, pageNumber: number): FigureRegion[] {
  if (!viewport.width || !viewport.height) return [];
  const lines = buildLines(items, viewport);
  const regions: FigureRegion[] = [];

  for (let captionIndex = 0; captionIndex < lines.length; captionIndex += 1) {
    const captionLine = lines[captionIndex];
    const captionMatch = captionLine.text.match(CAPTION_PATTERN);
    if (!captionMatch) continue;

    const captionCenter = (captionLine.x + captionLine.right) / 2;
    const fullWidth = captionLine.width > viewport.width * .46 || (
      captionLine.x < viewport.width * .26 && captionLine.right > viewport.width * .74
    );
    const laneLeft = fullWidth ? viewport.width * .045 : captionCenter < viewport.width / 2 ? viewport.width * .045 : viewport.width * .51;
    const laneRight = fullWidth ? viewport.width * .955 : captionCenter < viewport.width / 2 ? viewport.width * .49 : viewport.width * .955;
    const laneWidth = laneRight - laneLeft;
    const captionLines = [captionLine];
    for (let nextIndex = captionIndex + 1; nextIndex < lines.length && captionLines.length < 8; nextIndex += 1) {
      const previousCaptionLine = captionLines[captionLines.length - 1];
      const nextLine = lines[nextIndex];
      const verticalGap = nextLine.top - previousCaptionLine.bottom;
      const nextCenter = (nextLine.x + nextLine.right) / 2;
      const sameLane = fullWidth || (nextCenter >= laneLeft && nextCenter <= laneRight);
      if (!sameLane) {
        if (nextLine.top - previousCaptionLine.bottom > .014) break;
        continue;
      }
      if (/^\d{1,3}$/.test(nextLine.text)) break;
      const plausibleContinuation = verticalGap >= -.004 && verticalGap <= .014 && nextLine.top - captionLine.top <= .15;
      if (!plausibleContinuation || CAPTION_PATTERN.test(nextLine.text)) break;
      captionLines.push(nextLine);
    }
    const lastCaptionLine = captionLines[captionLines.length - 1];
    const figureBottom = Math.max(.06, captionLine.top - .006);
    const candidates = lines.filter((line) => {
      if (line.bottom >= figureBottom || CAPTION_PATTERN.test(line.text)) return false;
      const center = (line.x + line.right) / 2;
      const sameLane = fullWidth || (center >= laneLeft && center <= laneRight);
      const words = line.text.split(/\s+/).filter(Boolean).length;
      const proseLike = words >= 8 && line.width > laneWidth * .53 && (/[.!?:;]$/.test(line.text) || line.text.length > 88);
      return sameLane && proseLike;
    });
    const nearestProse = candidates.sort((a, b) => b.bottom - a.bottom)[0];
    const maxHeightTop = Math.max(.025, figureBottom - (fullWidth ? .42 : .34));
    let figureTop = nearestProse ? Math.max(maxHeightTop, nearestProse.bottom + .012) : maxHeightTop;
    if (figureBottom - figureTop < .09) figureTop = Math.max(.025, figureBottom - (fullWidth ? .24 : .2));

    const captionLeft = Math.min(...captionLines.map((line) => line.x));
    const captionRight = Math.max(...captionLines.map((line) => line.right));
    regions.push({
      id: `p${pageNumber}-figure-${regions.length + 1}`,
      label: `Figure ${captionMatch[1]}`,
      caption: captionLines.map((line) => line.text).join(" ").replace(/\s+/g, " ").trim().slice(0, 1_200),
      rect: {
        x: laneLeft / viewport.width,
        y: figureTop,
        width: (laneRight - laneLeft) / viewport.width,
        height: Math.max(.06, figureBottom - figureTop),
      },
      captionRect: {
        x: captionLeft / viewport.width,
        y: captionLine.top,
        width: (captionRight - captionLeft) / viewport.width,
        height: Math.max(.01, lastCaptionLine.bottom - captionLine.top),
      },
    });
  }

  return regions.filter((region, index, values) => values.findIndex((candidate) => candidate.label === region.label) === index);
}

export function findFigureContentTop(rowDensities: number[], startRow: number, endRow: number, gapTolerance: number) {
  const threshold = .0025;
  let cursor = Math.min(rowDensities.length - 1, Math.max(startRow, endRow - 1));
  while (cursor >= startRow && rowDensities[cursor] <= threshold) cursor -= 1;
  if (cursor < startRow) return null;
  let contentTop = cursor;
  let blankRun = 0;
  for (; cursor >= startRow; cursor -= 1) {
    if (rowDensities[cursor] > threshold) {
      contentTop = cursor;
      blankRun = 0;
    } else {
      blankRun += 1;
      if (blankRun > gapTolerance) break;
    }
  }
  return contentTop;
}

export function refineFigureRegionsWithCanvas(regions: FigureRegion[], canvas: HTMLCanvasElement): FigureRegion[] {
  if (!regions.length || !canvas.width || !canvas.height) return regions;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return regions;

  return regions.map((region) => {
    const startX = Math.max(0, Math.floor(region.rect.x * canvas.width));
    const endX = Math.min(canvas.width, Math.ceil((region.rect.x + region.rect.width) * canvas.width));
    const startY = Math.max(0, Math.floor(region.rect.y * canvas.height));
    const endY = Math.min(canvas.height, Math.floor(region.captionRect.y * canvas.height));
    if (endX - startX < 8 || endY - startY < 8) return region;
    const pixels = context.getImageData(startX, startY, endX - startX, endY - startY).data;
    const width = endX - startX;
    const height = endY - startY;
    const sampleStep = Math.max(1, Math.floor(width / 700));
    const rowDensities = new Array(canvas.height).fill(0);
    for (let localY = 0; localY < height; localY += 1) {
      let ink = 0;
      let samples = 0;
      for (let localX = 0; localX < width; localX += sampleStep) {
        const offset = (localY * width + localX) * 4;
        const alpha = pixels[offset + 3];
        const brightness = (pixels[offset] + pixels[offset + 1] + pixels[offset + 2]) / 3;
        if (alpha > 20 && brightness < 244) ink += 1;
        samples += 1;
      }
      rowDensities[startY + localY] = ink / Math.max(1, samples);
    }
    const gapTolerance = Math.max(12, Math.min(34, Math.round(canvas.height * .026)));
    const contentTop = findFigureContentTop(rowDensities, startY, endY, gapTolerance);
    if (contentTop === null) return region;
    const refinedTop = Math.max(0, contentTop / canvas.height - .012);
    const cropBottom = region.rect.y + region.rect.height;
    if (region.captionRect.y - refinedTop < .07 || refinedTop <= region.rect.y + .004) return region;
    return {
      ...region,
      rect: { ...region.rect, y: refinedTop, height: Math.max(.1, cropBottom - refinedTop) },
    };
  });
}
