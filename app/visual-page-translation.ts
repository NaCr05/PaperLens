export const VISUAL_PAGE_SOURCE = "[[PAPERLENS_VISUAL_PAGE]]";

export type VisualPageSegment = {
  id: string;
  text: string;
  kind: "paragraph";
  rects: { x: number; y: number; width: number; height: number }[];
};

export function createVisualPageSegment(pageNumber: number): VisualPageSegment {
  return {
    id: `p${pageNumber}-visual`,
    text: VISUAL_PAGE_SOURCE,
    kind: "paragraph",
    rects: [{ x: .015, y: .015, width: .97, height: .97 }],
  };
}

export function isVisualPageSegments(segments: { id: string; text: string }[] | undefined) {
  return Boolean(segments?.length === 1 && segments[0].text === VISUAL_PAGE_SOURCE && /-visual$/.test(segments[0].id));
}

export function shouldUseVisualPageTranslation(segments: { text: string }[] | undefined) {
  if (!segments?.length) return false;
  const texts = segments.map((segment) => segment.text.replace(/\s+/g, " ").trim()).filter(Boolean);
  const pageText = texts.join("\n");
  const hasNumberedTable = /\bTable\s+\d+\s*[:.]/i.test(pageText);
  if (!hasNumberedTable) return false;

  const ratioCells = pageText.match(/\b\d+(?:\.\d+)?\s*\/\s*\d+(?:\.\d+)?\b/g) || [];
  const numericCells = texts.filter((text) => /^\d+(?:\.\d+)?(?:\s*[%±]\s*\d+(?:\.\d+)?)?$/.test(text));
  const hasTableHeader = texts.some((text) => /\bMethod\b/i.test(text) && /\b(?:Score|Result|Task|Average|Accuracy|Success)\b/i.test(text));
  return ratioCells.length >= 3 || numericCells.length >= 4 || hasTableHeader;
}
