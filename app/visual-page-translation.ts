export const VISUAL_PAGE_SOURCE = "[[PAPERLENS_VISUAL_PAGE]]";

export type VisualPageSegment = {
  id: string;
  text: string;
  kind: "paragraph";
  rects: { x: number; y: number; width: number; height: number }[];
};

type VisualTranslationRect = { x: number; y: number; width: number; height: number };
type VisualTranslationCandidate = { text: string; rects?: VisualTranslationRect[] };

export function createVisualPageSegment(pageNumber: number): VisualPageSegment {
  return {
    id: `p${pageNumber}-visual`,
    text: VISUAL_PAGE_SOURCE,
    kind: "paragraph",
    rects: [{ x: .015, y: .015, width: .97, height: .97 }],
  };
}

export function isVisualPageSegments(segments: readonly { id: string; text: string }[] | undefined) {
  return Boolean(segments?.length === 1 && segments[0].text === VISUAL_PAGE_SOURCE && /-visual$/.test(segments[0].id));
}

function clusterByPosition(rects: VisualTranslationRect[], axis: "x" | "y", tolerance: number) {
  const clusters: Array<{ position: number; rects: VisualTranslationRect[] }> = [];
  for (const rect of [...rects].sort((left, right) => left[axis] - right[axis])) {
    const cluster = clusters.find((candidate) => Math.abs(candidate.position - rect[axis]) <= tolerance);
    if (!cluster) {
      clusters.push({ position: rect[axis], rects: [rect] });
      continue;
    }
    cluster.rects.push(rect);
    cluster.position = cluster.rects.reduce((sum, item) => sum + item[axis], 0) / cluster.rects.length;
  }
  return clusters;
}

function hasRepeatedColumnGrid(segments: readonly VisualTranslationCandidate[]) {
  const rects = segments.flatMap((segment) => segment.rects || []).filter((rect) => (
    Number.isFinite(rect.x)
    && Number.isFinite(rect.y)
    && Number.isFinite(rect.width)
    && Number.isFinite(rect.height)
    && rect.width >= .015
    && rect.width <= .48
    && rect.height >= .008
    && rect.height <= .09
    && rect.x >= .02
    && rect.x + rect.width <= .98
    && rect.y >= .08
    && rect.y <= .9
  ));
  if (rects.length < 9) return false;

  const repeatedColumns = clusterByPosition(rects, "x", .026).filter((column) => (
    clusterByPosition(column.rects, "y", .014).length >= 3
  ));
  if (repeatedColumns.length < 3) return false;

  const alignedRows = clusterByPosition(rects, "y", .01).filter((row) => {
    const occupiedColumns = new Set<number>();
    for (const rect of row.rects) {
      let closestColumn = -1;
      let closestDistance = Number.POSITIVE_INFINITY;
      repeatedColumns.forEach((column, index) => {
        const distance = Math.abs(column.position - rect.x);
        if (distance < closestDistance) {
          closestColumn = index;
          closestDistance = distance;
        }
      });
      if (closestColumn >= 0 && closestDistance <= .035) occupiedColumns.add(closestColumn);
    }
    return occupiedColumns.size >= 3;
  });
  if (alignedRows.length < 3) return false;

  const top = Math.min(...alignedRows.map((row) => row.position));
  const bottom = Math.max(...alignedRows.map((row) => row.position));
  return bottom - top >= .08;
}

export function shouldUseVisualPageTranslation(segments: readonly VisualTranslationCandidate[] | undefined) {
  if (!segments?.length) return false;
  const texts = segments.map((segment) => segment.text.replace(/\s+/g, " ").trim()).filter(Boolean);
  const pageText = texts.join("\n");
  const hasNumberedTable = /\bTable\s+\d+\s*[:.]/i.test(pageText);
  const ratioCells = pageText.match(/\b\d+(?:\.\d+)?\s*\/\s*\d+(?:\.\d+)?\b/g) || [];
  const numericCells = texts.filter((text) => /^\d+(?:\.\d+)?(?:\s*[%±]\s*\d+(?:\.\d+)?)?$/.test(text));
  const hasTableHeader = texts.some((text) => /\bMethod\b/i.test(text) && /\b(?:Score|Result|Task|Average|Accuracy|Success)\b/i.test(text));
  const numberedResultTable = hasNumberedTable && (ratioCells.length >= 3 || numericCells.length >= 4 || hasTableHeader);
  return numberedResultTable || hasRepeatedColumnGrid(segments);
}
