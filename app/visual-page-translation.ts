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
