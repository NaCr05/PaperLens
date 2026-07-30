import type { FigureRegion } from "./figure-regions";
import { splitTextLineParts } from "./page-segment-geometry.ts";

export type PdfTextItem = {
  str?: string;
  transform?: number[];
  width?: number;
  height?: number;
  fontName?: string;
  hasEOL?: boolean;
};

export type PdfViewport = { width: number; height: number };
export type SyncRect = { x: number; y: number; width: number; height: number };
export type PageSegment = { id: string; text: string; kind: "heading" | "paragraph"; rects: SyncRect[] };

type Positioned = {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontName: string;
  hasEOL: boolean;
};

type Lane = "wide" | "left" | "right";
type Line = {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  right: number;
  heading: boolean;
  inlineHeading: boolean;
  lane: Lane;
  captionIndex: number;
  parts: Positioned[];
};

type SegmentDraft = Omit<PageSegment, "id"> & { topY: number };
const SEGMENTATION_VERSION = 2;

function median(values: number[]) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function containsPoint(rect: SyncRect, point: { x: number; y: number }, padding = 0) {
  return point.x >= rect.x - padding && point.x <= rect.x + rect.width + padding
    && point.y >= rect.y - padding && point.y <= rect.y + rect.height + padding;
}

function captionOwner(line: Pick<Line, "x" | "right" | "y" | "height">, figures: FigureRegion[], viewport: PdfViewport) {
  const centerX = ((line.x + line.right) / 2) / viewport.width;
  const top = 1 - (line.y + line.height) / viewport.height;
  return figures.findIndex((figure) => {
    const laneLeft = figure.rect.x - .008;
    const laneRight = figure.rect.x + figure.rect.width + .008;
    const captionTop = figure.captionRect.y - .008;
    const captionBottom = Math.min(.97, figure.captionRect.y + figure.captionRect.height + .008);
    return centerX >= laneLeft && centerX <= laneRight && top >= captionTop && top <= captionBottom;
  });
}

function inferBodyFont(lines: Array<Omit<Line, "heading" | "inlineHeading" | "lane" | "captionIndex">>, bodyHeight: number) {
  const usage = new Map<string, number>();
  for (const line of lines) {
    if (line.height > bodyHeight * 1.28) continue;
    for (const part of line.parts) {
      if (!part.fontName || !/[A-Za-z\p{L}]/u.test(part.text)) continue;
      usage.set(part.fontName, (usage.get(part.fontName) || 0) + part.text.replace(/\s/g, "").length);
    }
  }
  return [...usage].sort((a, b) => b[1] - a[1])[0]?.[0] || "";
}

function hasInlineHeading(line: Pick<Line, "parts">, bodyFont: string) {
  if (!bodyFont || line.parts.length < 2 || line.parts[0].fontName === bodyFont) return false;
  const firstBodyPart = line.parts.findIndex((part) => part.fontName === bodyFont);
  if (firstBodyPart <= 0) return false;
  const prefix = line.parts.slice(0, firstBodyPart).map((part) => part.text).join(" ").replace(/\s+/g, " ").trim();
  const body = line.parts.slice(firstBodyPart).map((part) => part.text).join(" ").replace(/\s+/g, " ").trim();
  const words = prefix.split(/\s+/).filter(Boolean);
  return words.length >= 2
    && prefix.length >= 8
    && prefix.length <= 86
    && /^[A-Z\p{Lu}]/u.test(prefix)
    && !/[.!?;:]$/.test(prefix)
    && /^[A-Z\p{Lu}\d]/u.test(body);
}

function draftFromLines(block: Line[], viewport: PdfViewport): SegmentDraft | null {
  if (!block.length) return null;
  const text = block.map((line) => line.text).join("\n").replace(/-\n(?=[a-z])/g, "").replace(/\n/g, " ").replace(/\s+/g, " ").trim();
  if (!text) return null;
  const rects = block.map((line) => ({
    x: Math.max(0, line.x / viewport.width),
    y: Math.max(0, 1 - (line.y + line.height) / viewport.height),
    width: Math.min(1, Math.max(line.width / viewport.width, .008)),
    height: Math.min(.08, Math.max((line.height * 1.28) / viewport.height, .009)),
  }));
  return {
    text,
    kind: block.length === 1 && block[0].heading ? "heading" : "paragraph",
    rects,
    topY: Math.max(...block.map((line) => line.y)),
  };
}

export function buildPageSegments(
  items: PdfTextItem[],
  viewport: PdfViewport,
  pageNumber: number,
  figures: FigureRegion[] = [],
): PageSegment[] {
  const positioned: Positioned[] = items
    .filter((item): item is Required<Pick<PdfTextItem, "str" | "transform">> & PdfTextItem => typeof item.str === "string" && item.str.trim().length > 0 && Array.isArray(item.transform))
    .map((item) => ({
      text: item.str!.trim(),
      x: item.transform![4] ?? 0,
      y: item.transform![5] ?? 0,
      width: Math.max(item.width || 0, 1),
      height: Math.max(Math.hypot(item.transform![2] || 0, item.transform![3] || 0), Math.abs(item.height || 0), 6),
      fontName: item.fontName || "",
      hasEOL: Boolean(item.hasEOL),
    }));
  if (!positioned.length) return [];

  const midpoint = viewport.width / 2;
  const lineBuckets: { y: number; parts: Positioned[] }[] = [];
  for (const item of [...positioned].sort((a, b) => Math.abs(b.y - a.y) > 3 ? b.y - a.y : a.x - b.x)) {
    let bucket = lineBuckets.find((candidate) => Math.abs(candidate.y - item.y) <= Math.max(3, item.height * .35));
    if (!bucket) {
      bucket = { y: item.y, parts: [] };
      lineBuckets.push(bucket);
    }
    bucket.parts.push(item);
  }

  const rawLines: Array<Omit<Line, "heading" | "inlineHeading" | "lane" | "captionIndex">> = [];
  for (const bucket of lineBuckets) {
    for (const run of splitTextLineParts(bucket.parts, viewport.width)) {
      const parts = [...run].sort((a, b) => a.x - b.x);
      const x = Math.min(...parts.map((item) => item.x));
      const right = Math.max(...parts.map((item) => item.x + item.width));
      const height = Math.max(...parts.map((item) => item.height));
      const text = parts.map((item) => item.text).join(" ").replace(/\s+/g, " ").trim();
      if (text) rawLines.push({ text, x, y: bucket.y, width: right - x, height, right, parts });
    }
  }
  rawLines.sort((a, b) => b.y - a.y || a.x - b.x);

  const bodyHeight = median(rawLines.map((line) => line.height).filter((height) => height < 18)) || median(rawLines.map((line) => line.height)) || 9;
  const bodyFont = inferBodyFont(rawLines, bodyHeight);
  const classified = rawLines.map((line) => {
    const center = { x: (line.x + line.right) / 2 / viewport.width, y: 1 - (line.y + line.height / 2) / viewport.height };
    const top = 1 - (line.y + line.height) / viewport.height;
    const insideFigure = figures.some((figure) => containsPoint(figure.rect, center, .002));
    const usesBodyFont = line.parts.some((part) => part.fontName === bodyFont);
    return {
      ...line,
      heading: line.height > bodyHeight * 1.35 || (line.text.length < 92 && (
        /^(?:abstract|introduction|related work|background|method|approach|experiments?|results?|discussion|conclusion|references|appendix|acknowledgments?)$/i.test(line.text)
        || /^(?:\d+(?:\.\d+)*|[IVX]+)[\s.:]+.{1,72}$/i.test(line.text)
      )),
      inlineHeading: hasInlineHeading(line, bodyFont),
      lane: "wide" as Lane,
      captionIndex: captionOwner(line, figures, viewport),
      figureContent: insideFigure && !usesBodyFont,
      marginArtifact: /^\d{1,4}$/.test(line.text) && (top < .04 || top > .9),
    };
  });
  const proseLines = classified.filter((line) => line.captionIndex < 0 && !line.figureContent && !line.marginArtifact);
  const bodyLines = proseLines.filter((line) => line.text.length > 10 && line.width > viewport.width * .1);
  const isGeometricallyWide = (line: Pick<Line, "width" | "x" | "right">) => (
    line.width > viewport.width * .56
    || (line.x < midpoint - bodyHeight * 2.2 && line.right > midpoint + bodyHeight * 2.2)
  );
  const wideCount = bodyLines.filter(isGeometricallyWide).length;
  const leftCount = bodyLines.filter((line) => !isGeometricallyWide(line) && line.x + line.width / 2 < midpoint).length;
  const rightCount = bodyLines.filter((line) => !isGeometricallyWide(line) && line.x + line.width / 2 >= midpoint).length;
  const twoColumnPage = leftCount >= 3 && rightCount >= 3 && wideCount / Math.max(bodyLines.length, 1) < .58;
  const lines: Line[] = proseLines.map((line) => ({
    ...line,
    lane: !twoColumnPage || isGeometricallyWide(line) ? "wide" : line.x + line.width / 2 < midpoint ? "left" : "right",
  }));

  const buildBlocks = (flow: Line[]): SegmentDraft[] => {
    if (!flow.length) return [];
    const ordered = [...flow].sort((a, b) => b.y - a.y || a.x - b.x);
    const flowLeft = Math.min(...ordered.map((line) => line.x));
    const flowRight = Math.max(...ordered.map((line) => line.right));
    const flowWidth = Math.max(1, flowRight - flowLeft);
    const baselineGaps = ordered.slice(1).map((line, index) => ordered[index].y - line.y).filter((gap) => gap > 2 && gap < bodyHeight * 2.2);
    const normalGap = median(baselineGaps) || bodyHeight * 1.25;
    const drafts: SegmentDraft[] = [];
    let block: Line[] = [];
    const flush = () => {
      const draft = draftFromLines(block, viewport);
      if (draft) drafts.push(draft);
      block = [];
    };

    ordered.forEach((line, index) => {
      const previous = ordered[index - 1];
      const gap = previous ? previous.y - line.y : 0;
      const indented = line.x - flowLeft > Math.max(bodyHeight * 1.1, flowWidth * .025);
      const previousShort = previous ? previous.width < flowWidth * .72 : false;
      const sentenceBreak = previous ? /[.!?。！？:]$/.test(previous.text) && /^[A-Z\d]/.test(line.text) : false;
      const startsBlock = !previous || line.heading || line.inlineHeading || previous.heading
        || gap > normalGap * 1.35
        || (indented && (sentenceBreak || previousShort));
      if (startsBlock && block.length) flush();
      block.push(line);
      if (block.reduce((sum, item) => sum + item.text.length, 0) > 8_000) flush();
    });
    flush();
    return drafts;
  };

  const drafts: SegmentDraft[] = [];
  if (!twoColumnPage) {
    drafts.push(...buildBlocks(lines));
  } else {
    const wideLines = lines.filter((line) => line.lane === "wide");
    const normalGap = median(lines.slice(1).map((line, index) => lines[index].y - line.y).filter((gap) => gap > 2 && gap < bodyHeight * 2.2)) || bodyHeight * 1.25;
    const wideBands: { top: number; bottom: number; lines: Line[] }[] = [];
    for (const line of wideLines) {
      const band = wideBands[wideBands.length - 1];
      if (!band || band.bottom - line.y > normalGap * 2.2) wideBands.push({ top: line.y, bottom: line.y, lines: [line] });
      else {
        band.bottom = line.y;
        band.lines.push(line);
      }
    }

    let upperBoundary = Number.POSITIVE_INFINITY;
    const appendColumnRegion = (top: number, bottom: number) => {
      const region = lines.filter((line) => line.lane !== "wide" && line.y < top && line.y > bottom);
      drafts.push(...buildBlocks(region.filter((line) => line.lane === "left")));
      drafts.push(...buildBlocks(region.filter((line) => line.lane === "right")));
    };
    for (const band of wideBands) {
      appendColumnRegion(upperBoundary, band.top + .01);
      drafts.push(...buildBlocks(band.lines));
      const sideLinesInsideBand = lines.filter((line) => line.lane !== "wide" && line.y <= band.top + .01 && line.y >= band.bottom - .01);
      drafts.push(...buildBlocks(sideLinesInsideBand.filter((line) => line.lane === "left")));
      drafts.push(...buildBlocks(sideLinesInsideBand.filter((line) => line.lane === "right")));
      upperBoundary = band.bottom - .01;
    }
    appendColumnRegion(upperBoundary, Number.NEGATIVE_INFINITY);
  }

  const captions = figures.flatMap((_, figureIndex) => {
    const captionLines = classified.filter((line) => line.captionIndex === figureIndex && !line.marginArtifact).sort((a, b) => b.y - a.y || a.x - b.x);
    const draft = draftFromLines(captionLines, viewport);
    return draft ? [draft] : [];
  });
  const orderedDrafts = twoColumnPage ? [...drafts, ...captions] : [...drafts, ...captions].sort((a, b) => b.topY - a.topY);
  return orderedDrafts.map((draft, index) => ({
    id: `p${pageNumber}-v${SEGMENTATION_VERSION}-s${index + 1}`,
    text: draft.text,
    kind: draft.kind,
    rects: draft.rects,
  }));
}
