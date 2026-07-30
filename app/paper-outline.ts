export type PaperOutlineSource = "pdf" | "detected";

export type PaperOutlineItem = {
  id: string;
  title: string;
  pageNumber: number;
  level: number;
  source: PaperOutlineSource;
};

export type OutlineHeadingCandidate = {
  title: string;
  pageNumber: number;
};

type PdfReference = { num: number; gen: number };

type PdfOutlineNode = {
  title?: string;
  dest?: string | unknown[] | null;
  items?: PdfOutlineNode[];
};

export type PdfOutlineDocument = {
  numPages: number;
  getOutline?: () => Promise<PdfOutlineNode[] | null>;
  getDestination?: (id: string) => Promise<unknown[] | null>;
  getPageIndex?: (reference: PdfReference) => Promise<number>;
};

function cleanOutlineTitle(value: string) {
  return value.replace(/[\u0000-\u001f]+/g, " ").replace(/\s+/g, " ").trim();
}

function isPdfReference(value: unknown): value is PdfReference {
  return Boolean(value && typeof value === "object" && Number.isInteger((value as PdfReference).num) && Number.isInteger((value as PdfReference).gen));
}

async function resolveDestinationPage(document: PdfOutlineDocument, destination: PdfOutlineNode["dest"]) {
  let explicitDestination = destination;
  if (typeof destination === "string") {
    explicitDestination = await document.getDestination?.(destination) || null;
  }
  if (!Array.isArray(explicitDestination) || !explicitDestination.length) return null;

  const pageReference = explicitDestination[0];
  let pageIndex: number | null = null;
  if (Number.isInteger(pageReference)) pageIndex = pageReference as number;
  else if (isPdfReference(pageReference) && document.getPageIndex) pageIndex = await document.getPageIndex(pageReference);
  if (pageIndex === null || pageIndex < 0 || pageIndex >= document.numPages) return null;
  return pageIndex + 1;
}

export async function extractEmbeddedPaperOutline(document: PdfOutlineDocument): Promise<PaperOutlineItem[]> {
  if (!document.getOutline) return [];
  const nodes = await document.getOutline() || [];

  const visit = async (node: PdfOutlineNode, level: number, path: number[]): Promise<PaperOutlineItem[]> => {
    const children = (await Promise.all((node.items || []).map((child, index) => visit(child, level + 1, [...path, index + 1])))).flat();
    let pageNumber: number | null = null;
    try {
      pageNumber = await resolveDestinationPage(document, node.dest);
    } catch {
      pageNumber = null;
    }
    pageNumber ||= children[0]?.pageNumber || null;
    const title = cleanOutlineTitle(node.title || "");
    if (!title || !pageNumber) return children;
    return [{ id: `pdf-outline-${path.join("-")}`, title, pageNumber, level: Math.min(level, 4), source: "pdf" }, ...children];
  };

  const result = (await Promise.all(nodes.map((node, index) => visit(node, 0, [index + 1])))).flat();
  return result.filter((item, index) => index === 0 || item.title !== result[index - 1].title || item.pageNumber !== result[index - 1].pageNumber);
}

const STANDARD_SECTION = /^(?:abstract|introduction|related works?|background|preliminaries|problem formulation|method(?:ology)?|approach|framework|architecture|experiments?|experimental (?:setup|results)|evaluation|implementation(?: details)?|training|results?|analysis|discussion|limitations?|conclusions?|future work|references|appendix(?:\s+[a-z\d]+)?|acknowledg(?:e)?ments?|supplementary material)\b/i;
const SECTION_NUMBER = /^(\d+(?:\.\d+){0,3}|[IVX]{1,6})(?:[.:])?\s+(.+)/;
const APPENDIX_LETTER = /^(?:appendix\s+)?([A-Z])[.:\-–—]+\s*(.+)/;

export function isLikelyPaperHeading(value: string) {
  const title = cleanOutlineTitle(value);
  if (title.length < 3 || title.length > 120) return false;
  if (/\[\[SOURCE_FORMULA\]\]|https?:\/\/|www\.|@/.test(title)) return false;
  if (title.split(/\s+/).length > 18) return false;
  if (STANDARD_SECTION.test(title)) return true;
  const numbered = title.match(SECTION_NUMBER);
  if (numbered) {
    const rootNumber = Number(numbered[1].split(".")[0]);
    if (Number.isFinite(rootNumber) && rootNumber > 20) return false;
    if (/^[IVX]+$/.test(numbered[1]) && (numbered[2].match(/\p{L}/gu) || []).length < 3) return false;
    if (/^(?:fps|hz|khz|mhz|ghz|ms|%|×)\b/i.test(numbered[2])) return false;
    return /\p{L}/u.test(numbered[2]) && !/[.!?]$/.test(numbered[2]);
  }
  const appendix = title.match(APPENDIX_LETTER);
  return Boolean(appendix && /\p{L}/u.test(appendix[2]) && !/[.!?]$/.test(appendix[2]));
}

function inferOutlineLevel(title: string) {
  const numbered = cleanOutlineTitle(title).match(SECTION_NUMBER);
  if (!numbered || /^[IVX]+$/i.test(numbered[1])) return 0;
  return Math.min(numbered[1].split(".").length - 1, 3);
}

export function buildDetectedPaperOutline(candidates: OutlineHeadingCandidate[]): PaperOutlineItem[] {
  const hasNumberedStructure = candidates.filter((candidate) => SECTION_NUMBER.test(cleanOutlineTitle(candidate.title))).length >= 2;
  const seen = new Set<string>();
  const result: PaperOutlineItem[] = [];
  for (const candidate of candidates) {
    const title = cleanOutlineTitle(candidate.title);
    if (!Number.isInteger(candidate.pageNumber) || candidate.pageNumber < 1 || !isLikelyPaperHeading(title)) continue;
    if (hasNumberedStructure && !SECTION_NUMBER.test(title) && !/^(?:abstract|conclusions?|references|appendix|acknowledg(?:e)?ments?|supplementary material)\b/i.test(title)) continue;
    const key = title.toLocaleLowerCase("en-US");
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({
      id: `detected-outline-${candidate.pageNumber}-${result.length + 1}`,
      title,
      pageNumber: candidate.pageNumber,
      level: inferOutlineLevel(title),
      source: "detected",
    });
  }
  return result;
}

export function selectMajorPaperOutline(items: PaperOutlineItem[]) {
  for (let level = 0; level <= 4; level += 1) {
    const atLevel = items.filter((item) => item.level === level);
    if (atLevel.length >= 2) return atLevel;
  }
  return items;
}
