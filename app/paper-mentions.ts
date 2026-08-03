export type PaperMentionRecord = {
  id: string;
  displayName: string;
  fileName: string;
  aliases?: string[];
  repositoryUrl?: string;
  lastOpenedAt?: number;
};

export type FolderMentionRecord = {
  id: string;
  name: string;
  paperIds: string[];
  updatedAt?: number;
};

export type MentionSuggestion<TPaper extends PaperMentionRecord, TFolder extends FolderMentionRecord> =
  | { kind: "paper"; record: TPaper; score: number }
  | { kind: "folder"; record: TFolder; score: number };

export type MentionRange = { start: number; end: number; query: string };
export type PaperPageText = { pageNumber: number; text: string };
export type WholeDocumentChatContext = {
  text: string;
  contextPageNumbers: number[];
  relatedPages: PaperPageText[];
  indexedPages: number;
  totalPages: number;
};

type TitleTextItem = { str?: string; transform?: number[] };

function cleanLabel(value: string) {
  return value
    .replace(/\.pdf$/i, "")
    .replace(/[\u0000-\u001f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function repositoryAlias(repositoryUrl: string) {
  try {
    const url = new URL(repositoryUrl);
    if (url.hostname.toLowerCase() !== "github.com") return "";
    return decodeURIComponent(url.pathname.split("/").filter(Boolean)[1] || "").replace(/\.git$/i, "");
  } catch {
    return "";
  }
}

export function isLowSignalPaperName(value: string) {
  const name = cleanLabel(value);
  if (!name) return true;
  const compact = name.replace(/[\s._-]+/g, "");
  return /^\d{5,}$/.test(compact)
    || /^\d{4}\.\d{4,6}(?:v\d+)?$/i.test(name)
    || /^(?:paper|document|untitled|download|main|fulltext|arxiv)$/i.test(name);
}

function validTitle(value: string) {
  const title = cleanLabel(value);
  if (title.length < 6 || title.length > 240 || isLowSignalPaperName(title)) return "";
  if (/^\(?\s*(?:anonymous|unknown|none|null|no title|untitled)\s*\)?$/i.test(title)) return "";
  if (/^(?:microsoft (?:word|powerpoint)|adobe (?:acrobat|indesign))\b/i.test(title)) return "";
  if (/^(?:https?:\/\/|www\.|arxiv:|doi:)/i.test(title)) return "";
  if (!/[A-Za-z\u3400-\u9fff]/.test(title)) return "";
  return title;
}

export function inferPaperTitle(items: TitleTextItem[], fileName: string, metadataTitle = "") {
  const metadata = validTitle(metadataTitle);
  if (metadata) return metadata;

  const positioned = items
    .filter((item) => typeof item.str === "string" && item.str.trim() && Array.isArray(item.transform) && item.transform.length >= 6)
    .map((item) => ({
      text: item.str!.trim(),
      x: Number(item.transform![4]) || 0,
      y: Number(item.transform![5]) || 0,
      size: Math.max(Math.abs(Number(item.transform![0]) || 0), Math.abs(Number(item.transform![3]) || 0)),
    }))
    .filter((item) => item.size > 0 && !/^(?:arxiv|doi|https?:\/\/)/i.test(item.text));

  if (positioned.length) {
    const rows: { y: number; size: number; parts: { x: number; text: string }[] }[] = [];
    for (const item of [...positioned].sort((a, b) => b.y - a.y || a.x - b.x)) {
      const row = rows.find((candidate) => {
        const sizeRatio = Math.max(candidate.size, item.size) / Math.max(1, Math.min(candidate.size, item.size));
        return sizeRatio <= 1.4 && Math.abs(candidate.y - item.y) <= Math.max(2.5, item.size * .22);
      });
      if (row) {
        row.parts.push({ x: item.x, text: item.text });
        row.size = Math.max(row.size, item.size);
      } else {
        rows.push({ y: item.y, size: item.size, parts: [{ x: item.x, text: item.text }] });
      }
    }
    const maxY = Math.max(...rows.map((row) => row.y));
    const minY = Math.min(...rows.map((row) => row.y));
    const topBoundary = maxY - Math.max(40, (maxY - minY) * .42);
    const topRows = rows.filter((row) => row.y >= topBoundary);
    const maxSize = Math.max(...topRows.map((row) => row.size));
    const titleRows = topRows
      .filter((row) => row.size >= maxSize * .78)
      .sort((a, b) => b.y - a.y)
      .slice(0, 4);
    const inferred = validTitle(titleRows.map((row) => row.parts.sort((a, b) => a.x - b.x).map((part) => part.text).join(" ")).join(" "));
    if (inferred) return inferred;
  }

  return cleanLabel(fileName) || "未命名资料";
}

export function buildPaperAliases(values: Array<string | undefined>) {
  const aliases: string[] = [];
  const seen = new Set<string>();
  for (const raw of values) {
    if (!raw) continue;
    const value = cleanLabel(raw);
    const key = normalizeSearchText(value);
    if (!value || !key || seen.has(key)) continue;
    seen.add(key);
    aliases.push(value);
  }
  return aliases;
}

export function choosePaperDisplayName(inferredTitle: string, fileName: string, existingDisplayName = "") {
  const existing = cleanLabel(existingDisplayName);
  const meaningfulExisting = validTitle(existing);
  return validTitle(inferredTitle) || meaningfulExisting || cleanLabel(fileName) || "未命名资料";
}

export function normalizeSearchText(value: string) {
  return cleanLabel(value).normalize("NFKD").toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
}

export function getActivePaperMention(text: string, cursor: number): MentionRange | null {
  const beforeCursor = text.slice(0, Math.max(0, cursor));
  const match = beforeCursor.match(/(?:^|[\s，。！？、；：,.!?;:(（])@([^@\s]*)$/u);
  if (!match) return null;
  const atOffset = match[0].lastIndexOf("@");
  const start = beforeCursor.length - match[0].length + atOffset;
  return { start, end: cursor, query: match[1] || "" };
}

export function removeMentionQuery(text: string, range: MentionRange) {
  const before = text.slice(0, range.start).replace(/\s+$/, "");
  const after = text.slice(range.end).replace(/^\s+/, "");
  if (!before) return after;
  if (!after) return `${before} `;
  return `${before} ${after}`;
}

function scorePaper(record: PaperMentionRecord, query: string) {
  const needle = normalizeSearchText(query);
  const labels = buildPaperAliases([record.displayName, record.fileName, ...(record.aliases || []), repositoryAlias(record.repositoryUrl || "")]);
  if (!needle) return 1;
  let best = -1;
  labels.forEach((label, index) => {
    const normalized = normalizeSearchText(label);
    if (!normalized.includes(needle)) return;
    const score = normalized === needle ? 1000 : normalized.startsWith(needle) ? 700 : 400;
    best = Math.max(best, score - index * 8 - Math.max(0, normalized.length - needle.length) * .02);
  });
  return best;
}

export function searchMentionPapers<T extends PaperMentionRecord>(records: T[], query: string, options: { currentPaperId?: string; selectedIds?: string[]; limit?: number } = {}) {
  const selected = new Set(options.selectedIds || []);
  return records
    .filter((record) => record.id !== options.currentPaperId && !selected.has(record.id))
    .map((record) => ({ record, score: scorePaper(record, query) }))
    .filter((candidate) => candidate.score >= 0)
    .sort((a, b) => b.score - a.score || (b.record.lastOpenedAt || 0) - (a.record.lastOpenedAt || 0))
    .slice(0, options.limit || 6)
    .map((candidate) => candidate.record);
}

export function searchMentionTargets<TPaper extends PaperMentionRecord, TFolder extends FolderMentionRecord>(
  papers: TPaper[],
  folders: TFolder[],
  query: string,
  options: { currentPaperId?: string; selectedPaperIds?: string[]; selectedFolderIds?: string[]; limit?: number } = {},
) {
  const selectedPapers = new Set(options.selectedPaperIds || []);
  const selectedFolders = new Set(options.selectedFolderIds || []);
  const needle = normalizeSearchText(query);
  const paperCandidates: MentionSuggestion<TPaper, TFolder>[] = papers
    .filter((paper) => paper.id !== options.currentPaperId && !selectedPapers.has(paper.id))
    .map((paper) => ({ kind: "paper" as const, record: paper, score: scorePaper(paper, query) }))
    .filter((candidate) => candidate.score >= 0);
  const folderCandidates: MentionSuggestion<TPaper, TFolder>[] = folders
    .filter((folder) => !selectedFolders.has(folder.id) && folder.paperIds.length > 0)
    .map((folder) => {
      const normalized = normalizeSearchText(folder.name);
      const score = !needle
        ? 120
        : normalized === needle
          ? 1020
          : normalized.startsWith(needle)
            ? 720
            : normalized.includes(needle)
              ? 420
              : -1;
      return { kind: "folder" as const, record: folder, score };
    })
    .filter((candidate) => candidate.score >= 0);

  return [...folderCandidates, ...paperCandidates]
    .sort((a, b) => b.score - a.score
      || (b.kind === "folder" ? b.record.updatedAt || 0 : b.record.lastOpenedAt || 0)
        - (a.kind === "folder" ? a.record.updatedAt || 0 : a.record.lastOpenedAt || 0))
    .slice(0, options.limit || 8);
}

function queryTokens(value: string) {
  const normalized = value.normalize("NFKD").toLocaleLowerCase();
  const latin = normalized.match(/[a-z0-9][a-z0-9._-]{1,}/g) || [];
  const chineseRuns = normalized.match(/[\u3400-\u9fff]{2,}/g) || [];
  const chinese = chineseRuns.flatMap((run) => run.length <= 3 ? [run] : Array.from({ length: run.length - 1 }, (_, index) => run.slice(index, index + 2)));
  return [...new Set([...latin, ...chinese].map((token) => token.replace(/[^\p{L}\p{N}]+/gu, "")).filter((token) => token.length >= 2))].slice(0, 24);
}

function scoredPaperPages(question: string, pages: PaperPageText[]) {
  const tokens = queryTokens(question);
  return pages
    .filter((page) => page.text.trim())
    .map((page) => {
      const haystack = page.text.normalize("NFKD").toLocaleLowerCase();
      const matched = tokens.reduce((total, token) => {
        const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const count = Math.min(8, (haystack.match(new RegExp(escaped, "g")) || []).length);
        return total + (count ? 3 + count : 0);
      }, 0);
      const overviewBoost = page.pageNumber <= 2 ? 1.5 : 0;
      return { ...page, score: matched + overviewBoost };
    });
}

export function rankPaperPages(question: string, pages: PaperPageText[], limit = 3) {
  return scoredPaperPages(question, pages)
    .sort((a, b) => b.score - a.score || a.pageNumber - b.pageNumber)
    .slice(0, limit)
    .sort((a, b) => a.pageNumber - b.pageNumber)
    .map(({ pageNumber, text }) => ({ pageNumber, text }));
}

export function buildWholeDocumentChatContext(
  question: string,
  pages: PaperPageText[],
  currentPage: number,
  currentPageText: string,
  totalPages: number,
  maxRelatedPages = 5,
): WholeDocumentChatContext {
  const indexedPages = pages.filter((page) => page.text.trim()).length;
  const relatedPages = rankPaperPages(
    question,
    pages.filter((page) => page.pageNumber !== currentPage),
    maxRelatedPages,
  );
  const currentText = currentPageText.trim().slice(0, 12_000);
  const relatedText = relatedPages.map((page) => (
    `[整篇 PDF 检索证据，第 ${page.pageNumber} 页]\n${page.text.trim().slice(0, 2_800)}`
  )).join("\n\n");
  const coverage = `已检索整篇 PDF 中 ${indexedPages}/${Math.max(totalPages, indexedPages)} 个具有可提取文字的页面`;
  return {
    text: [
      `[当前阅读页，第 ${currentPage} 页]\n${currentText}`,
      `[整篇 PDF 检索说明]\n${coverage}；以下是与当前问题最相关的其他证据页。回答必须注明证据页码；未提供的页面内容不得猜测。`,
      relatedText,
    ].filter(Boolean).join("\n\n"),
    contextPageNumbers: [currentPage, ...relatedPages.map((page) => page.pageNumber)],
    relatedPages,
    indexedPages,
    totalPages,
  };
}

export function rankFolderPaperContexts<T extends PaperMentionRecord & { pages: PaperPageText[] }>(
  question: string,
  papers: T[],
  limit = 4,
  pagesPerPaper = 2,
) {
  return papers
    .map((paper) => {
      const rankedPages = scoredPaperPages(question, paper.pages)
        .sort((a, b) => b.score - a.score || a.pageNumber - b.pageNumber)
        .slice(0, pagesPerPaper);
      const contentScore = rankedPages.reduce((total, page) => total + page.score, 0);
      const titleScore = Math.max(0, scorePaper(paper, question));
      return {
        paper,
        pages: rankedPages.sort((a, b) => a.pageNumber - b.pageNumber).map(({ pageNumber, text }) => ({ pageNumber, text })),
        score: contentScore * 20 + titleScore,
      };
    })
    .filter((candidate) => candidate.pages.length > 0)
    .sort((a, b) => b.score - a.score || (b.paper.lastOpenedAt || 0) - (a.paper.lastOpenedAt || 0))
    .slice(0, limit)
    .map(({ paper, pages }) => ({ ...paper, pages }));
}
