"use client";

import {
  CheckOutlined,
  ClearOutlined,
  CloseCircleOutlined,
  CloseOutlined,
  CopyOutlined,
  DownOutlined,
  ExportOutlined,
  FilePdfOutlined,
  GithubOutlined,
  GlobalOutlined,
  HighlightOutlined,
  HomeOutlined,
  LeftOutlined,
  MessageOutlined,
  PictureOutlined,
  PlusOutlined,
  ReloadOutlined,
  RightOutlined,
  RobotOutlined,
  SearchOutlined,
  SelectOutlined,
  SendOutlined,
  SettingOutlined,
  TranslationOutlined,
  UpOutlined,
  UploadOutlined,
  ZoomInOutlined,
  ZoomOutOutlined,
} from "@ant-design/icons";
import katex from "katex";
import { type ClipboardEvent as ReactClipboardEvent, type MouseEvent as ReactMouseEvent, type TouchEvent as ReactTouchEvent, type WheelEvent as ReactWheelEvent, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { detectCaptionFigureRegions, refineFigureRegionsWithCanvas, type FigureRegion } from "./figure-regions";
import { findGitHubRepository } from "./github-repository";
import { accumulatePageTurnIntent, EMPTY_PAGE_TURN_INTENT, PAGE_TURN_COOLDOWN_MS, TOUCH_PAGE_TURN_THRESHOLD, WHEEL_PAGE_TURN_THRESHOLD, type PageTurnIntent } from "./page-turn-gesture";
import { mergeSelectionRects, type SelectionRect } from "./selection-geometry";

type PdfTextItem = { str?: string; transform?: number[]; width?: number };
type PdfTextContent = { items: PdfTextItem[]; styles?: Record<string, unknown>; lang?: string | null };
type PdfViewport = { width: number; height: number };
type PdfRenderTask = { promise: Promise<void>; cancel: () => void };
type PdfPage = {
  getViewport: (options: { scale: number }) => PdfViewport;
  getTextContent: () => Promise<PdfTextContent>;
  render: (options: { canvas: HTMLCanvasElement; viewport: PdfViewport; background?: string }) => PdfRenderTask;
};
type PdfDocument = {
  numPages: number;
  getPage: (pageNumber: number) => Promise<PdfPage>;
  destroy: () => Promise<void>;
};
type RightTab = "translation" | "outline" | "terms" | "notes";
type MobileView = "paper" | "translation";
type AnnotationMode = "select" | "highlight" | "erase";
type BridgeStatus = "checking" | "ready" | "offline";
type HighlightRect = { id: string; groupId: string; x: number; y: number; width: number; height: number; text: string };
type PendingSelection = { text: string; rects: SelectionRect[]; x: number; y: number };
type ChatMessage = { id: string; role: "user" | "assistant"; text: string; imageLabels?: string[]; repositoryUsed?: boolean; repositoryName?: string };
type ChatImageAttachment = { id: string; label: string; source: "paper" | "clipboard"; dataUrl: string; pageNumber?: number };
type ChatContextKind = "paragraph" | "selection";
type SyncRect = { x: number; y: number; width: number; height: number };
type PageSegment = { id: string; text: string; kind: "heading" | "paragraph"; rects: SyncRect[] };
type TranslatedSegment = { id: string; translation: string; formulaExplanation: string };
type AppView = "space" | "reader";
type LibraryPaper = {
  id: string;
  fileName: string;
  displayName: string;
  importedAt: number;
  lastOpenedAt: number;
  lastModified: number;
  lastPage: number;
  pageCount: number;
  size: number;
  thumbnail: string;
};
type StoredPaper = LibraryPaper & { file: Blob };
type LoadPdfOptions = { paperId?: string; skipPersist?: boolean; initialPage?: number };
type PageScrollTarget = "top" | "bottom";

// Keep Codex loopback-only. The dev server proxies this same-origin path to the
// local bridge so an iPad can use PaperLens without exposing port 43123.
const CODEX_BRIDGE = "/api/codex";
const LIBRARY_DB = "paperlens-local-library";
const LIBRARY_STORE = "papers";

function openLibraryDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(LIBRARY_DB, 1);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(LIBRARY_STORE)) {
        database.createObjectStore(LIBRARY_STORE, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("无法打开本地论文库"));
  });
}

async function listStoredPapers() {
  const database = await openLibraryDatabase();
  return new Promise<StoredPaper[]>((resolve, reject) => {
    const transaction = database.transaction(LIBRARY_STORE, "readonly");
    const request = transaction.objectStore(LIBRARY_STORE).getAll();
    request.onsuccess = () => resolve((request.result as StoredPaper[]).sort((a, b) => b.lastOpenedAt - a.lastOpenedAt));
    request.onerror = () => reject(request.error || new Error("无法读取本地论文库"));
    transaction.oncomplete = () => database.close();
    transaction.onerror = () => {
      database.close();
      reject(transaction.error || new Error("无法读取本地论文库"));
    };
  });
}

async function getStoredPaper(id: string) {
  const database = await openLibraryDatabase();
  return new Promise<StoredPaper | undefined>((resolve, reject) => {
    const transaction = database.transaction(LIBRARY_STORE, "readonly");
    const request = transaction.objectStore(LIBRARY_STORE).get(id);
    request.onsuccess = () => resolve(request.result as StoredPaper | undefined);
    request.onerror = () => reject(request.error || new Error("无法打开这篇论文"));
    transaction.oncomplete = () => database.close();
    transaction.onerror = () => {
      database.close();
      reject(transaction.error || new Error("无法打开这篇论文"));
    };
  });
}

async function putStoredPaper(paper: StoredPaper) {
  const database = await openLibraryDatabase();
  return new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(LIBRARY_STORE, "readwrite");
    transaction.objectStore(LIBRARY_STORE).put(paper);
    transaction.oncomplete = () => {
      database.close();
      resolve();
    };
    transaction.onerror = () => {
      database.close();
      reject(transaction.error || new Error("无法保存论文"));
    };
  });
}

async function updateStoredPaper(id: string, patch: Partial<LibraryPaper>) {
  const database = await openLibraryDatabase();
  return new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(LIBRARY_STORE, "readwrite");
    const store = transaction.objectStore(LIBRARY_STORE);
    const request = store.get(id);
    request.onsuccess = () => {
      const current = request.result as StoredPaper | undefined;
      if (current) store.put({ ...current, ...patch });
    };
    transaction.oncomplete = () => {
      database.close();
      resolve();
    };
    transaction.onerror = () => {
      database.close();
      reject(transaction.error || new Error("无法更新阅读进度"));
    };
  });
}

async function createPdfThumbnail(pdf: PdfDocument) {
  const page = await pdf.getPage(1);
  const baseViewport = page.getViewport({ scale: 1 });
  const viewport = page.getViewport({ scale: Math.min(1, 360 / baseViewport.width) });
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(viewport.width));
  canvas.height = Math.max(1, Math.round(viewport.height));
  await page.render({ canvas, viewport, background: "#ffffff" }).promise;
  return canvas.toDataURL("image/jpeg", .84);
}

function formatLibraryDate(timestamp: number) {
  const date = new Date(timestamp);
  const now = new Date();
  if (date.toDateString() === now.toDateString()) {
    return `今天 ${date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false })}`;
  }
  return date.toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit", year: date.getFullYear() === now.getFullYear() ? undefined : "numeric" });
}

function formatFileSize(size: number) {
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("无法读取图片"));
    reader.onerror = () => reject(reader.error || new Error("无法读取图片"));
    reader.readAsDataURL(file);
  });
}

async function normalizePastedImage(file: File) {
  if (!file.type.startsWith("image/")) throw new Error("剪贴板中没有可用图片");
  if (file.size > 10 * 1024 * 1024) throw new Error("单张图片不能超过 10 MB");
  const original = await readFileAsDataUrl(file);
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const element = new Image();
    element.onload = () => resolve(element);
    element.onerror = () => reject(new Error("无法解析粘贴的图片"));
    element.src = original;
  });
  const maxEdge = 1800;
  const scale = Math.min(1, maxEdge / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("浏览器无法处理这张图片");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/png");
}

function median(values: number[]) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function buildPageSegments(items: PdfTextItem[], viewport: PdfViewport, pageNumber: number): PageSegment[] {
  type Positioned = { text: string; x: number; y: number; width: number; height: number };
  type Lane = "wide" | "left" | "right";
  type Line = { text: string; x: number; y: number; width: number; height: number; right: number; heading: boolean; lane: Lane };
  type SegmentDraft = Omit<PageSegment, "id">;
  const positioned: Positioned[] = items
    .filter((item): item is Required<Pick<PdfTextItem, "str" | "transform">> & PdfTextItem => typeof item.str === "string" && item.str.trim().length > 0 && Array.isArray(item.transform))
    .map((item) => ({
      text: item.str!.trim(),
      x: item.transform![4] ?? 0,
      y: item.transform![5] ?? 0,
      width: Math.max(item.width || 0, 1),
      height: Math.max(Math.hypot(item.transform![2] || 0, item.transform![3] || 0), 6),
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

  // Build real visual lines before deciding whether the page is one or two
  // columns. A large horizontal gap is a column gutter; ordinary PDF text
  // chunks on the same baseline stay together as one line.
  const rawLines: Omit<Line, "heading" | "lane">[] = [];
  for (const bucket of lineBuckets) {
    const parts = bucket.parts.sort((a, b) => a.x - b.x);
    let run: Positioned[] = [];
    const flushRun = () => {
      if (!run.length) return;
      const x = Math.min(...run.map((item) => item.x));
      const right = Math.max(...run.map((item) => item.x + item.width));
      const height = Math.max(...run.map((item) => item.height));
      const text = run.map((item) => item.text).join(" ").replace(/\s+/g, " ").trim();
      if (text) rawLines.push({ text, x, y: bucket.y, width: right - x, height, right });
      run = [];
    };
    for (const item of parts) {
      const previous = run[run.length - 1];
      const gap = previous ? item.x - (previous.x + previous.width) : 0;
      const gutterThreshold = Math.max(viewport.width * .045, item.height * 2.8);
      if (previous && gap > gutterThreshold) flushRun();
      run.push(item);
    }
    flushRun();
  }
  rawLines.sort((a, b) => b.y - a.y || a.x - b.x);

  const bodyHeight = median(rawLines.map((line) => line.height).filter((height) => height < 18)) || median(rawLines.map((line) => line.height)) || 9;
  const bodyLines = rawLines.filter((line) => line.text.length > 10 && line.width > viewport.width * .1);
  const isGeometricallyWide = (line: Omit<Line, "heading" | "lane">) => (
    line.width > viewport.width * .56 ||
    (line.x < midpoint - bodyHeight * 2.2 && line.right > midpoint + bodyHeight * 2.2)
  );
  const wideCount = bodyLines.filter(isGeometricallyWide).length;
  const leftCount = bodyLines.filter((line) => !isGeometricallyWide(line) && line.x + line.width / 2 < midpoint).length;
  const rightCount = bodyLines.filter((line) => !isGeometricallyWide(line) && line.x + line.width / 2 >= midpoint).length;
  const twoColumnPage = leftCount >= 3 && rightCount >= 3 && wideCount / Math.max(bodyLines.length, 1) < .58;

  const lines: Line[] = rawLines.map((line) => {
    const lane: Lane = !twoColumnPage || isGeometricallyWide(line)
      ? "wide"
      : line.x + line.width / 2 < midpoint ? "left" : "right";
    return {
      ...line,
      lane,
      heading: line.height > bodyHeight * 1.35 || (line.text.length < 92 && (
        /^(?:abstract|introduction|related work|background|method|approach|experiments?|results?|discussion|conclusion|references|appendix|acknowledgments?)$/i.test(line.text) ||
        /^(?:\d+(?:\.\d+)*|[IVX]+)[\s.:]+.{1,72}$/i.test(line.text)
      )),
    };
  });

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
      if (!block.length) return;
      const text = block.map((line) => line.text).join("\n").replace(/-\n(?=[a-z])/g, "").replace(/\n/g, " ").replace(/\s+/g, " ").trim();
      if (text) {
        const rects = block.map((line) => ({
          x: Math.max(0, line.x / viewport.width),
          y: Math.max(0, 1 - (line.y + line.height) / viewport.height),
          width: Math.min(1, Math.max(line.width / viewport.width, .008)),
          height: Math.min(.08, Math.max((line.height * 1.28) / viewport.height, .009)),
        }));
        drafts.push({ text, kind: block.length === 1 && block[0].heading ? "heading" : "paragraph", rects });
      }
      block = [];
    };

    ordered.forEach((line, index) => {
      const previous = ordered[index - 1];
      const gap = previous ? previous.y - line.y : 0;
      const indented = line.x - flowLeft > Math.max(bodyHeight * 1.1, flowWidth * .025);
      const previousShort = previous ? previous.width < flowWidth * .72 : false;
      const sentenceBreak = previous ? /[.!?。！？:]$/.test(previous.text) && /^[A-Z\d]/.test(line.text) : false;
      const startsBlock = !previous || line.heading || previous.heading || gap > normalGap * 1.48 || (indented && (sentenceBreak || previousShort));
      if (startsBlock && block.length) flush();
      block.push(line);
      // Keep genuinely long abstract paragraphs intact while still guarding
      // against malformed PDFs that expose an entire page as one paragraph.
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
      if (!band || band.bottom - line.y > normalGap * 2.2) {
        wideBands.push({ top: line.y, bottom: line.y, lines: [line] });
      } else {
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

  return drafts.map((segment, index) => ({ ...segment, id: `p${pageNumber}-s${index + 1}` }));
}

function parseTranslatedSegments(answer: string, source: PageSegment[]): TranslatedSegment[] {
  const cleaned = answer.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  let repaired = "";
  for (let index = 0; index < cleaned.length; index += 1) {
    const character = cleaned[index];
    if (character !== "\\") {
      repaired += character;
      continue;
    }
    const next = cleaned[index + 1] || "";
    const afterNext = cleaned[index + 2] || "";
    const jsonPunctuationEscape = next === '"' || next === "\\" || next === "/";
    const jsonUnicodeEscape = next === "u" && /^[0-9a-fA-F]{4}$/.test(cleaned.slice(index + 2, index + 6));
    const jsonControlEscape = /[bfnrt]/.test(next) && !/[A-Za-z]/.test(afterNext);
    if (jsonUnicodeEscape) {
      repaired += cleaned.slice(index, index + 6);
      index += 5;
    } else if (jsonPunctuationEscape || jsonControlEscape) {
      repaired += `\\${next}`;
      index += 1;
    } else {
      repaired += "\\\\";
    }
  }
  const parsed = JSON.parse(repaired) as { segments?: { id?: string; translation?: string; formulaExplanation?: string }[] } | { id?: string; translation?: string; formulaExplanation?: string }[];
  const values = Array.isArray(parsed) ? parsed : parsed.segments;
  if (!Array.isArray(values)) throw new Error("Codex 没有返回可同步的段落结构");
  const translated = new Map(values.map((item) => [item.id || "", {
    translation: (item.translation || "").trim(),
    formulaExplanation: (item.formulaExplanation || "").trim(),
  }]));
  const result = source.map((segment) => ({
    id: segment.id,
    translation: translated.get(segment.id)?.translation || "",
    formulaExplanation: translated.get(segment.id)?.formulaExplanation || "",
  }));
  if (result.some((segment) => !segment.translation)) throw new Error("Codex 返回的段落映射不完整，请重新翻译本页");
  return result;
}

const SCIENTIFIC_TOKEN_SOURCE = String.raw`(\[\[SOURCE_FORMULA\]\])|\\\[([\s\S]*?)\\\]|\$\$([\s\S]*?)\$\$|\\\(([\s\S]*?)\\\)|\$([^$\n]+?)\$`;

function ScientificText({ text }: { text: string }) {
  const parts: React.ReactNode[] = [];
  const scientificToken = new RegExp(SCIENTIFIC_TOKEN_SOURCE, "g");
  let cursor = 0;
  let match: RegExpExecArray | null;
  while ((match = scientificToken.exec(text)) !== null) {
    if (match.index > cursor) parts.push(text.slice(cursor, match.index));
    if (match[1]) {
      parts.push(<span className="formula-source-fallback" key={`source-${match.index}`}>公式以左侧原文为准</span>);
    } else {
      const latex = match[2] ?? match[3] ?? match[4] ?? match[5] ?? "";
      const displayMode = match[2] !== undefined || match[3] !== undefined;
      let html = "";
      try {
        html = katex.renderToString(latex, {
          displayMode,
          throwOnError: true,
          strict: "ignore",
          output: "htmlAndMathml",
        });
      } catch {
        html = "";
      }
      if (html) {
        parts.push(<span className={displayMode ? "translated-math display" : "translated-math"} key={`math-${match.index}`} dangerouslySetInnerHTML={{ __html: html }} />);
      } else {
        parts.push(<span className="formula-source-fallback" key={`invalid-${match.index}`}>公式渲染失败，请看左侧原文</span>);
      }
    }
    cursor = match.index + match[0].length;
  }
  if (cursor < text.length) parts.push(text.slice(cursor));
  return <>{parts}</>;
}

function segmentBounds(segment: PageSegment): SyncRect {
  const left = Math.min(...segment.rects.map((rect) => rect.x));
  const top = Math.min(...segment.rects.map((rect) => rect.y));
  const right = Math.max(...segment.rects.map((rect) => rect.x + rect.width));
  const bottom = Math.max(...segment.rects.map((rect) => rect.y + rect.height));
  const paddingX = .006;
  const paddingY = .005;
  return {
    x: Math.max(0, left - paddingX),
    y: Math.max(0, top - paddingY),
    width: Math.min(1 - Math.max(0, left - paddingX), right - left + paddingX * 2),
    height: Math.min(1 - Math.max(0, top - paddingY), bottom - top + paddingY * 2),
  };
}

function repositoryName(url: string) {
  return url.replace(/^https?:\/\/(?:www\.)?github\.com\//i, "").replace(/\/$/, "");
}

async function invokeCodex(payload: Record<string, unknown>) {
  const response = await fetch(`${CODEX_BRIDGE}/invoke`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const result = await response.json() as { answer?: string; error?: string; repositoryUsed?: boolean; repositoryDecision?: string };
  if (!response.ok || !result.answer) throw new Error(result.error || "Codex 调用失败");
  return {
    answer: result.answer,
    repositoryUsed: result.repositoryUsed,
    repositoryDecision: result.repositoryDecision,
  };
}

export default function Home() {
  const isClient = useSyncExternalStore(() => () => undefined, () => true, () => false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const paperFrameRef = useRef<HTMLDivElement>(null);
  const pdfStageRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatInputRef = useRef<HTMLTextAreaElement>(null);
  const selectionMadeRef = useRef(false);
  const renderSequenceRef = useRef(0);
  const activeRenderTaskRef = useRef<PdfRenderTask | null>(null);
  const pageTurnIntentRef = useRef<PageTurnIntent>({ ...EMPTY_PAGE_TURN_INTENT });
  const pageTurnLockedUntilRef = useRef(0);
  const touchScrollRef = useRef({ y: 0 });
  const pendingPageScrollRef = useRef<{ page: number; target: PageScrollTarget } | null>(null);
  const [appView, setAppView] = useState<AppView>("space");
  const [libraryPapers, setLibraryPapers] = useState<LibraryPaper[]>([]);
  const [libraryLoading, setLibraryLoading] = useState(true);
  const [openingPaperId, setOpeningPaperId] = useState("");
  const [currentPaperId, setCurrentPaperId] = useState("");
  const [pdf, setPdf] = useState<PdfDocument | null>(null);
  const [fileName, setFileName] = useState("");
  const [pageNumber, setPageNumber] = useState(1);
  const [pageSize, setPageSize] = useState({ width: 900, height: 1165 });
  const [zoom, setZoom] = useState(1);
  const [pageTexts, setPageTexts] = useState<Record<number, string>>({});
  const [pageSegments, setPageSegments] = useState<Record<number, PageSegment[]>>({});
  const [translations, setTranslations] = useState<Record<number, TranslatedSegment[]>>({});
  const [highlights, setHighlights] = useState<Record<number, HighlightRect[]>>({});
  const [isTranslating, setIsTranslating] = useState(false);
  const [message, setMessage] = useState("PDF 仅在本机解析");
  const [dragging, setDragging] = useState(false);
  const [showConnect, setShowConnect] = useState(false);
  const [rightTab, setRightTab] = useState<RightTab>("translation");
  const [mobileView, setMobileView] = useState<MobileView>("paper");
  const [notes, setNotes] = useState("");
  const [annotationMode, setAnnotationMode] = useState<AnnotationMode>("select");
  const [pendingSelection, setPendingSelection] = useState<PendingSelection | null>(null);
  const [selectedText, setSelectedText] = useState("");
  const [chatContextKind, setChatContextKind] = useState<ChatContextKind | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatImages, setChatImages] = useState<ChatImageAttachment[]>([]);
  const [isChatting, setIsChatting] = useState(false);
  const [bridgeStatus, setBridgeStatus] = useState<BridgeStatus>("checking");
  const [skillAvailable, setSkillAvailable] = useState(false);
  const [detectedRepositoryUrl, setDetectedRepositoryUrl] = useState("");
  const [stageAvailableWidth, setStageAvailableWidth] = useState(900);
  const [hoveredSegmentId, setHoveredSegmentId] = useState("");
  const [contextSegmentId, setContextSegmentId] = useState("");
  const [contextSegmentIds, setContextSegmentIds] = useState<string[]>([]);
  const [selectionContextRects, setSelectionContextRects] = useState<SyncRect[]>([]);
  const [pageFigures, setPageFigures] = useState<Record<number, FigureRegion[]>>({});
  const [hoveredFigureId, setHoveredFigureId] = useState("");

  const currentText = pageTexts[pageNumber] || "";
  const currentSegments = useMemo(() => pageSegments[pageNumber] || [], [pageNumber, pageSegments]);
  const currentTranslatedSegments = useMemo(() => translations[pageNumber] || [], [pageNumber, translations]);
  const currentTranslation = currentTranslatedSegments.map((segment) => segment.translation).join("\n\n");
  const currentHighlights = highlights[pageNumber] || [];
  const currentFigures = pageFigures[pageNumber] || [];
  const activeSegmentId = hoveredSegmentId || contextSegmentId;
  const activeSegment = currentSegments.find((segment) => segment.id === activeSegmentId) || null;
  const contextSegment = currentSegments.find((segment) => segment.id === contextSegmentId) || null;
  const repositoryFromReadPages = useMemo(() => findGitHubRepository(Object.values(pageTexts).join("\n")), [pageTexts]);
  const repositoryUrl = detectedRepositoryUrl || repositoryFromReadPages;

  const displayPageWidth = Math.max(240, Math.min(pageSize.width, stageAvailableWidth) * zoom);

  const checkCodexBridge = useCallback(async () => {
    setBridgeStatus("checking");
    try {
      const response = await fetch(`${CODEX_BRIDGE}/health`, { cache: "no-store" });
      if (!response.ok) throw new Error("Bridge unavailable");
      const health = await response.json() as { skillAvailable?: boolean };
      setSkillAvailable(Boolean(health.skillAvailable));
      setBridgeStatus("ready");
      return true;
    } catch {
      setSkillAvailable(false);
      setBridgeStatus("offline");
      return false;
    }
  }, []);

  useEffect(() => { void checkCodexBridge(); }, [checkCodexBridge]);

  const refreshLibrary = useCallback(async () => {
    try {
      const papers = await listStoredPapers();
      setLibraryPapers(papers.map((paper) => ({
        id: paper.id,
        fileName: paper.fileName,
        displayName: paper.displayName,
        importedAt: paper.importedAt,
        lastOpenedAt: paper.lastOpenedAt,
        lastModified: paper.lastModified,
        lastPage: paper.lastPage,
        pageCount: paper.pageCount,
        size: paper.size,
        thumbnail: paper.thumbnail,
      })));
    } catch (error) {
      console.error("Paper library read failed", error);
      setMessage("无法读取本地论文库，请刷新后重试");
    } finally {
      setLibraryLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isClient) return;
    void refreshLibrary();
  }, [isClient, refreshLibrary]);

  useEffect(() => {
    const stage = pdfStageRef.current;
    if (!stage) return;
    const syncWidth = () => setStageAvailableWidth(Math.max(280, stage.clientWidth - 28));
    syncWidth();
    const observer = new ResizeObserver(syncWidth);
    observer.observe(stage);
    return () => observer.disconnect();
  }, [appView, isClient]);

  useEffect(() => {
    if (!pdf) return;
    let cancelled = false;
    const discoverRepository = async () => {
      // Repository links are commonly printed after the abstract. Scan the
      // opening pages independently of the user's restored reading position.
      for (let candidatePage = 1; candidatePage <= Math.min(pdf.numPages, 4); candidatePage += 1) {
        const page = await pdf.getPage(candidatePage);
        const content = await page.getTextContent();
        if (cancelled) return;
        const text = content.items.map((item) => item.str || "").join(" ");
        const repository = findGitHubRepository(text);
        if (repository) {
          setDetectedRepositoryUrl(repository);
          return;
        }
      }
    };
    void discoverRepository().catch((error: unknown) => {
      if (!cancelled) console.error("GitHub repository discovery failed", error);
    });
    return () => { cancelled = true; };
  }, [pdf]);

  useEffect(() => {
    if (!pdf) return;
    const sequence = ++renderSequenceRef.current;
    let cancelled = false;
    let renderTask: PdfRenderTask | null = null;
    let textLayerTask: { cancel?: () => void } | null = null;
    let resizeObserver: ResizeObserver | null = null;
    const render = async () => {
      // Safari takes longer to paint complex pages. Finish cancelling the old
      // task before allowing PDF.js to reuse the same canvas for a new page.
      const previousTask = activeRenderTaskRef.current;
      if (previousTask) {
        previousTask.cancel();
        try { await previousTask.promise; } catch { /* expected cancellation */ }
      }
      if (cancelled || sequence !== renderSequenceRef.current) return;

      const page = await pdf.getPage(pageNumber);
      if (cancelled || sequence !== renderSequenceRef.current) return;
      const viewport = page.getViewport({ scale: 1.45 * zoom });
      const displayViewport = page.getViewport({ scale: 1.45 });
      const baseViewport = page.getViewport({ scale: 1 });
      const canvas = canvasRef.current;
      const textLayer = textLayerRef.current;
      const frame = paperFrameRef.current;
      if (!canvas || !textLayer || !frame || cancelled) return;
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      setPageSize({ width: displayViewport.width, height: displayViewport.height });
      const pendingScroll = pendingPageScrollRef.current;
      if (pendingScroll?.page === pageNumber) {
        requestAnimationFrame(() => requestAnimationFrame(() => {
          const stage = pdfStageRef.current;
          if (!stage || pendingPageScrollRef.current?.page !== pageNumber) return;
          stage.scrollTop = pendingScroll.target === "top" ? 0 : Math.max(0, stage.scrollHeight - stage.clientHeight);
          pendingPageScrollRef.current = null;
        }));
      }

      // Paint the paper first. Text extraction can be much slower on iPad for
      // image-heavy PDFs and must never hold the visible page hostage.
      renderTask = page.render({ canvas, viewport, background: "#ffffff" });
      activeRenderTaskRef.current = renderTask;
      await renderTask.promise;
      if (activeRenderTaskRef.current === renderTask) activeRenderTaskRef.current = null;
      if (cancelled) return;
      setMessage(`第 ${pageNumber} 页已显示，正在解析文字…`);

      let content: PdfTextContent;
      try {
        content = await page.getTextContent();
      } catch (error) {
        console.error("PDF text extraction failed", error);
        if (!cancelled && sequence === renderSequenceRef.current) {
          setMessage(`第 ${pageNumber} 页已显示，但文字层无法提取`);
        }
        return;
      }
      if (cancelled || sequence !== renderSequenceRef.current) return;

      // The default PDF.js 6 build targets newer JavaScript runtimes and calls
      // collection helpers such as Map#getOrInsertComputed. iPadOS Safari
      // versions without those helpers fail before a page can render. The
      // legacy build ships the required polyfills while keeping the same API.
      const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
      textLayer.replaceChildren();
      textLayer.style.width = `${viewport.width}px`;
      textLayer.style.height = `${viewport.height}px`;
      textLayerTask = new pdfjs.TextLayer({ textContentSource: content, container: textLayer, viewport: viewport as never });
      await (textLayerTask as { render: () => Promise<void> }).render();
      textLayer.style.width = `${viewport.width}px`;
      textLayer.style.height = `${viewport.height}px`;
      const syncTextLayer = () => {
        const displayScale = frame.clientWidth / viewport.width;
        textLayer.style.transform = `scale(${displayScale})`;
      };
      syncTextLayer();
      resizeObserver = new ResizeObserver(syncTextLayer);
      resizeObserver.observe(frame);

      const segments = buildPageSegments(content.items, baseViewport, pageNumber);
      const figures = refineFigureRegionsWithCanvas(detectCaptionFigureRegions(content.items, baseViewport, pageNumber), canvas);
      const text = segments.map((segment) => segment.text).join("\n\n").trim().slice(0, 28_000);
      requestAnimationFrame(() => {
        if (cancelled) return;
        const bounds = textLayer.getBoundingClientRect();
        if (!bounds.width || !bounds.height) return;
        textLayer.querySelectorAll<HTMLElement>("span").forEach((span) => {
          const rect = span.getBoundingClientRect();
          const centerX = (rect.left + rect.width / 2 - bounds.left) / bounds.width;
          const centerY = (rect.top + rect.height / 2 - bounds.top) / bounds.height;
          const segment = segments.find((candidate) => candidate.rects.some((candidateRect) => (
            centerX >= candidateRect.x - .012 && centerX <= candidateRect.x + candidateRect.width + .012 &&
            centerY >= candidateRect.y - .008 && centerY <= candidateRect.y + candidateRect.height + .012
          )));
          if (segment) span.dataset.segmentId = segment.id;
        });
      });
      if (!cancelled) {
        setPageSegments((previous) => ({ ...previous, [pageNumber]: segments }));
        setPageFigures((previous) => ({ ...previous, [pageNumber]: figures }));
        setPageTexts((previous) => ({ ...previous, [pageNumber]: text }));
        setMessage(figures.length ? `第 ${pageNumber} 页已解析，检测到 ${figures.length} 张可引用图` : `第 ${pageNumber} 页已解析，可选择文字提问`);
      }
    };
    render().catch((error: unknown) => {
      if (cancelled || (error instanceof Error && error.name === "RenderingCancelledException")) return;
      console.error("PDF page render failed", error);
      setMessage(`第 ${pageNumber} 页渲染失败，请重试`);
    });
    return () => {
      cancelled = true;
      renderTask?.cancel();
      textLayerTask?.cancel?.();
      resizeObserver?.disconnect();
    };
  }, [pageNumber, pdf, zoom]);

  const loadFile = useCallback(async (file?: File, options: LoadPdfOptions = {}) => {
    if (!file) return;
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      setMessage("请选择 PDF 文件");
      return;
    }
    setMessage("正在打开 PDF…");
    try {
      const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
      pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
      const fileBuffer = await file.arrayBuffer();
      const data = new Uint8Array(fileBuffer.slice(0));
      const nextPdf = await pdfjs.getDocument({ data }).promise as unknown as PdfDocument;
      if (pdf) await pdf.destroy();
      const paperId = options.paperId || `${file.name}:${file.size}:${file.lastModified}`;
      const initialPage = Math.min(nextPdf.numPages, Math.max(1, options.initialPage || 1));
      setPdf(nextPdf);
      setDetectedRepositoryUrl("");
      setCurrentPaperId(paperId);
      setFileName(file.name.replace(/\.pdf$/i, ""));
      setPageNumber(initialPage);
      setPageTexts({});
      setPageSegments({});
      setTranslations({});
      setHighlights({});
      setChatMessages([]);
      setChatImages([]);
      setSelectedText("");
      setChatContextKind(null);
      setPendingSelection(null);
      setHoveredSegmentId("");
      setContextSegmentId("");
      setContextSegmentIds([]);
      setSelectionContextRects([]);
      setPageFigures({});
      setHoveredFigureId("");
      pageTurnIntentRef.current = { ...EMPTY_PAGE_TURN_INTENT };
      pendingPageScrollRef.current = null;
      setRightTab("translation");
      setAppView("reader");
      setMessage(`已导入，共 ${nextPdf.numPages} 页`);
      if (!options.skipPersist) {
        let thumbnail = "";
        try {
          thumbnail = await createPdfThumbnail(nextPdf);
        } catch (error) {
          console.error("PDF thumbnail render failed", error);
        }
        const timestamp = Date.now();
        await putStoredPaper({
          id: paperId,
          fileName: file.name,
          displayName: file.name.replace(/\.pdf$/i, ""),
          importedAt: timestamp,
          lastOpenedAt: timestamp,
          lastModified: file.lastModified,
          lastPage: initialPage,
          pageCount: nextPdf.numPages,
          size: file.size,
          thumbnail,
          file: new Blob([fileBuffer], { type: "application/pdf" }),
        });
        await refreshLibrary();
      }
    } catch {
      setMessage("PDF 打开失败；加密或扫描版论文可能需要 OCR");
    }
  }, [pdf, refreshLibrary]);

  const openLibraryPaper = useCallback(async (paper: LibraryPaper) => {
    setOpeningPaperId(paper.id);
    try {
      const stored = await getStoredPaper(paper.id);
      if (!stored) throw new Error("论文文件不存在");
      const file = new File([stored.file], stored.fileName, { type: "application/pdf", lastModified: stored.lastModified });
      await loadFile(file, { paperId: stored.id, skipPersist: true, initialPage: stored.lastPage });
      await updateStoredPaper(stored.id, { lastOpenedAt: Date.now() });
      await refreshLibrary();
    } catch (error) {
      console.error("Paper open failed", error);
      setMessage("这篇论文无法打开，请重新导入");
    } finally {
      setOpeningPaperId("");
    }
  }, [loadFile, refreshLibrary]);

  const goToWorkspace = useCallback(() => {
    if (currentPaperId) {
      void updateStoredPaper(currentPaperId, { lastOpenedAt: Date.now(), lastPage: pageNumber })
        .then(refreshLibrary)
        .catch((error) => console.error("Paper progress update failed", error));
    }
    setPendingSelection(null);
    setChatOpen(false);
    setAppView("space");
  }, [currentPaperId, pageNumber, refreshLibrary]);

  const addHighlight = useCallback((selection: PendingSelection) => {
    const groupId = `${pageNumber}-${Date.now()}`;
    const next = selection.rects.map((rect, index) => ({ ...rect, id: `${groupId}-${index}`, groupId, text: selection.text }));
    setHighlights((previous) => ({ ...previous, [pageNumber]: [...(previous[pageNumber] || []), ...next] }));
    setSelectedText(selection.text);
    setChatContextKind("selection");
    setPendingSelection(null);
    window.getSelection()?.removeAllRanges();
    setMessage(`已标亮 ${selection.text.length} 个字符`);
  }, [pageNumber]);

  const handlePaperSelection = useCallback(() => {
    if (annotationMode === "erase") return;
    const selection = window.getSelection();
    const frame = paperFrameRef.current;
    const layer = textLayerRef.current;
    if (!selection || selection.isCollapsed || !selection.rangeCount || !frame || !layer) return;
    const anchor = selection.anchorNode;
    const focus = selection.focusNode;
    if (!anchor || !focus || !layer.contains(anchor) || !layer.contains(focus)) return;
    const text = selection.toString().replace(/\s+/g, " ").trim().slice(0, 6_000);
    if (!text) return;
    const frameBounds = frame.getBoundingClientRect();
    const rangeRects = Array.from(selection.getRangeAt(0).getClientRects()).filter((rect) => rect.width > 1 && rect.height > 1);
    if (!rangeRects.length) return;
    const rects = mergeSelectionRects(rangeRects.map((rect) => ({
      x: Math.max(0, (rect.left - frameBounds.left) / frameBounds.width),
      y: Math.max(0, (rect.top - frameBounds.top) / frameBounds.height),
      width: Math.min(1, rect.width / frameBounds.width),
      height: Math.min(1, rect.height / frameBounds.height),
      text,
    })));
    const lastRect = rangeRects.at(-1)!;
    const nextSelection: PendingSelection = {
      text,
      rects,
      x: Math.min(frameBounds.width - 160, Math.max(8, lastRect.right - frameBounds.left - 120)),
      y: Math.max(8, lastRect.top - frameBounds.top - 42),
    };
    const anchorElement = anchor.nodeType === Node.ELEMENT_NODE ? anchor as HTMLElement : anchor.parentElement;
    const focusElement = focus.nodeType === Node.ELEMENT_NODE ? focus as HTMLElement : focus.parentElement;
    const anchorSegmentId = anchorElement?.closest<HTMLElement>("[data-segment-id]")?.dataset.segmentId || "";
    const focusSegmentId = focusElement?.closest<HTMLElement>("[data-segment-id]")?.dataset.segmentId || "";
    const range = selection.getRangeAt(0);
    const selectedSegmentIds = Array.from(layer.querySelectorAll<HTMLElement>("[data-segment-id]"))
      .filter((element) => range.intersectsNode(element))
      .map((element) => element.dataset.segmentId || "")
      .filter((segmentId, index, values) => segmentId && values.indexOf(segmentId) === index);
    const primarySegmentId = anchorSegmentId || focusSegmentId || selectedSegmentIds[0] || "";
    selectionMadeRef.current = true;
    setSelectedText(text);
    setChatContextKind("selection");
    setContextSegmentId(primarySegmentId);
    setContextSegmentIds(selectedSegmentIds.length ? selectedSegmentIds : primarySegmentId ? [primarySegmentId] : []);
    setSelectionContextRects(rects.map(({ x, y, width, height }) => ({ x, y, width, height })));
    setHoveredSegmentId("");
    if (annotationMode === "highlight") addHighlight(nextSelection);
    else setPendingSelection(nextSelection);
    selection.removeAllRanges();
  }, [addHighlight, annotationMode]);

  const removeHighlight = (groupId: string) => {
    if (annotationMode !== "erase") return;
    setHighlights((previous) => ({ ...previous, [pageNumber]: (previous[pageNumber] || []).filter((item) => item.groupId !== groupId) }));
    setMessage("已擦除标亮");
  };

  const translateCurrent = async () => {
    if (!currentText || !currentSegments.length) {
      setMessage("当前页文字仍在解析");
      return;
    }
    if (bridgeStatus !== "ready") {
      setShowConnect(true);
      return;
    }
    setIsTranslating(true);
    setRightTab("translation");
    setMobileView("translation");
    setMessage("本机 Codex 正在翻译当前页…");
    try {
      const result = await invokeCodex({
        mode: "translate",
        pageText: currentText,
        segments: currentSegments.map(({ id, text, kind }) => ({ id, text, kind })),
        paperTitle: fileName,
      });
      const translated = parseTranslatedSegments(result.answer, currentSegments);
      setTranslations((previous) => ({ ...previous, [pageNumber]: translated }));
      setMessage("当前页翻译完成");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "翻译暂时不可用");
      const bridgeReady = await checkCodexBridge();
      if (!bridgeReady) setShowConnect(true);
    } finally {
      setIsTranslating(false);
    }
  };

  const addFigureToChat = useCallback(async (figure: FigureRegion) => {
    if (!pdf) return;
    const attachmentId = `${currentPaperId || fileName}:p${pageNumber}:${figure.id}`;
    if (chatImages.some((image) => image.id === attachmentId)) {
      setChatOpen(true);
      setMessage(`${figure.label} 已在 AI Chat 上下文中`);
      return;
    }
    if (chatImages.length >= 4) {
      setMessage("AI Chat 最多同时引用 4 张图片，请先移除一张");
      setChatOpen(true);
      return;
    }
    setMessage(`正在截取 ${figure.label}…`);
    try {
      const page = await pdf.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 2.2 });
      const sourceCanvas = document.createElement("canvas");
      sourceCanvas.width = Math.max(1, Math.round(viewport.width));
      sourceCanvas.height = Math.max(1, Math.round(viewport.height));
      await page.render({ canvas: sourceCanvas, viewport, background: "#ffffff" }).promise;
      const sourceX = Math.max(0, Math.floor(figure.rect.x * sourceCanvas.width));
      const sourceY = Math.max(0, Math.floor(figure.rect.y * sourceCanvas.height));
      const sourceWidth = Math.max(1, Math.min(sourceCanvas.width - sourceX, Math.ceil(figure.rect.width * sourceCanvas.width)));
      const sourceHeight = Math.max(1, Math.min(sourceCanvas.height - sourceY, Math.ceil(figure.rect.height * sourceCanvas.height)));
      const maxWidth = 1600;
      const cropScale = Math.min(1, maxWidth / sourceWidth);
      const cropCanvas = document.createElement("canvas");
      cropCanvas.width = Math.max(1, Math.round(sourceWidth * cropScale));
      cropCanvas.height = Math.max(1, Math.round(sourceHeight * cropScale));
      const cropContext = cropCanvas.getContext("2d");
      if (!cropContext) throw new Error("浏览器无法截取论文图片");
      cropContext.fillStyle = "#ffffff";
      cropContext.fillRect(0, 0, cropCanvas.width, cropCanvas.height);
      cropContext.drawImage(sourceCanvas, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, cropCanvas.width, cropCanvas.height);
      const dataUrl = cropCanvas.toDataURL("image/png");
      const label = `${figure.label} · 第 ${pageNumber} 页`;
      setChatImages((previous) => [...previous, { id: attachmentId, label, source: "paper", pageNumber, dataUrl }]);
      setChatOpen(true);
      setHoveredFigureId(figure.id);
      setMessage(`${figure.label} 已加入 AI Chat 图片上下文`);
      requestAnimationFrame(() => chatInputRef.current?.focus());
    } catch (error) {
      console.error("Figure capture failed", error);
      setMessage(error instanceof Error ? error.message : "论文图片截取失败");
    }
  }, [chatImages, currentPaperId, fileName, pageNumber, pdf]);

  const handleChatPaste = useCallback((event: ReactClipboardEvent<HTMLTextAreaElement>) => {
    const imageItem = Array.from(event.clipboardData.items).find((item) => item.kind === "file" && item.type.startsWith("image/"));
    if (!imageItem) return;
    event.preventDefault();
    if (chatImages.length >= 4) {
      setMessage("AI Chat 最多同时引用 4 张图片，请先移除一张");
      return;
    }
    const file = imageItem.getAsFile();
    if (!file) {
      setMessage("无法读取剪贴板图片");
      return;
    }
    void normalizePastedImage(file).then((dataUrl) => {
      const sequence = chatImages.filter((image) => image.source === "clipboard").length + 1;
      setChatImages((previous) => [...previous, {
        id: `clipboard-${Date.now()}`,
        label: `粘贴图片 ${sequence}`,
        source: "clipboard",
        dataUrl,
      }]);
      setChatOpen(true);
      setMessage("粘贴图片已加入 AI Chat 上下文");
    }).catch((error) => {
      setMessage(error instanceof Error ? error.message : "无法处理粘贴图片");
    });
  }, [chatImages]);

  const sendChat = async (preset?: string) => {
    const typedQuestion = (preset || chatInput).trim();
    const question = typedQuestion || (chatImages.length ? "请解释这些图片展示的结构、信息流，以及它们与当前页方法的关系。" : "");
    if (!question || isChatting) return;
    if (bridgeStatus !== "ready") {
      setShowConnect(true);
      return;
    }
    const userMessage: ChatMessage = { id: `user-${Date.now()}`, role: "user", text: question, imageLabels: chatImages.map((image) => image.label) };
    const history = chatMessages.map(({ role, text }) => ({ role, text }));
    setChatMessages((previous) => [...previous, userMessage]);
    setChatInput("");
    setChatOpen(true);
    setIsChatting(true);
    try {
      const result = await invokeCodex({
        mode: repositoryUrl ? "auto" : "chat",
        question,
        pageText: currentText,
        selectedText,
        paperTitle: fileName,
        repositoryUrl,
        history,
        images: chatImages.map(({ label, source, pageNumber: imagePageNumber, dataUrl }) => ({ label, source, pageNumber: imagePageNumber, dataUrl })),
      });
      setChatMessages((previous) => [...previous, {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        text: result.answer,
        repositoryUsed: result.repositoryUsed,
        repositoryName: repositoryUrl ? repositoryName(repositoryUrl) : undefined,
      }]);
    } catch (error) {
      setChatMessages((previous) => [...previous, { id: `assistant-error-${Date.now()}`, role: "assistant", text: `暂时没有得到可靠回答：${error instanceof Error ? error.message : "Codex 调用失败"}` }]);
    } finally {
      setIsChatting(false);
      requestAnimationFrame(() => chatInputRef.current?.focus());
    }
  };

  const changeZoom = useCallback((nextZoom: number) => {
    const stage = pdfStageRef.current;
    const centerX = stage ? (stage.scrollLeft + stage.clientWidth / 2) / Math.max(stage.scrollWidth, 1) : .5;
    const centerY = stage ? (stage.scrollTop + stage.clientHeight / 2) / Math.max(stage.scrollHeight, 1) : 0;
    const bounded = Math.round(Math.min(2.5, Math.max(.6, nextZoom)) * 10) / 10;
    setZoom(bounded);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const nextStage = pdfStageRef.current;
      if (!nextStage) return;
      nextStage.scrollLeft = Math.max(0, centerX * nextStage.scrollWidth - nextStage.clientWidth / 2);
      nextStage.scrollTop = Math.max(0, centerY * nextStage.scrollHeight - nextStage.clientHeight / 2);
    }));
  }, []);

  const activateSegment = useCallback((segmentId: string, origin: "source" | "translation") => {
    if (!segmentId) return;
    setHoveredSegmentId(segmentId);
    if (origin === "source") {
      setRightTab("translation");
      if (!currentTranslatedSegments.some((segment) => segment.id === segmentId)) return;
      requestAnimationFrame(() => {
        const container = document.querySelector<HTMLElement>(".translation-content");
        const target = document.querySelector<HTMLElement>(`[data-translation-segment="${segmentId}"]`);
        if (!container || !target) return;
        const containerRect = container.getBoundingClientRect();
        const targetRect = target.getBoundingClientRect();
        container.scrollTo({ top: container.scrollTop + targetRect.top - containerRect.top - container.clientHeight / 2 + targetRect.height / 2, behavior: "smooth" });
      });
      return;
    }

    const segment = currentSegments.find((candidate) => candidate.id === segmentId);
    const stage = pdfStageRef.current;
    const frame = paperFrameRef.current;
    if (!segment || !stage || !frame || !segment.rects.length) return;
    const left = Math.min(...segment.rects.map((rect) => rect.x));
    const right = Math.max(...segment.rects.map((rect) => rect.x + rect.width));
    const top = Math.min(...segment.rects.map((rect) => rect.y));
    const bottom = Math.max(...segment.rects.map((rect) => rect.y + rect.height));
    stage.scrollTo({
      left: Math.max(0, frame.offsetLeft + ((left + right) / 2) * frame.offsetWidth - stage.clientWidth / 2),
      top: Math.max(0, frame.offsetTop + ((top + bottom) / 2) * frame.offsetHeight - stage.clientHeight / 2),
      behavior: "smooth",
    });
  }, [currentSegments, currentTranslatedSegments]);

  const handleSourceHover = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
    const target = (event.target as HTMLElement).closest<HTMLElement>("[data-segment-id]");
    const segmentId = target?.dataset.segmentId || "";
    if (segmentId && segmentId !== activeSegmentId) activateSegment(segmentId, "source");
  }, [activateSegment, activeSegmentId]);

  const handleSourceClick = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
    if (annotationMode !== "select") return;
    if (selectionMadeRef.current) {
      selectionMadeRef.current = false;
      return;
    }
    const selection = window.getSelection();
    if (selection && !selection.isCollapsed && selection.toString().trim()) return;
    const target = (event.target as HTMLElement).closest<HTMLElement>("[data-segment-id]");
    const segmentId = target?.dataset.segmentId || "";
    const segment = currentSegments.find((candidate) => candidate.id === segmentId);
    if (!segment) return;
    setContextSegmentId(segment.id);
    setContextSegmentIds([segment.id]);
    setSelectionContextRects([]);
    setChatContextKind("paragraph");
    setSelectedText(segment.text.slice(0, 6_000));
    setPendingSelection(null);
    activateSegment(segment.id, "source");
    setMessage("整段已作为 AI Chat 上下文");
  }, [activateSegment, annotationMode, currentSegments]);

  const clearChatContext = useCallback(() => {
    setSelectedText("");
    setChatContextKind(null);
    setContextSegmentId("");
    setContextSegmentIds([]);
    setSelectionContextRects([]);
    setPendingSelection(null);
    window.getSelection()?.removeAllRanges();
  }, []);

  const changePage = useCallback((next: number, scrollTarget: PageScrollTarget = "top") => {
    if (!pdf) return;
    const boundedPage = Math.min(pdf.numPages, Math.max(1, next));
    if (boundedPage === pageNumber) return;
    pendingPageScrollRef.current = { page: boundedPage, target: scrollTarget };
    pageTurnIntentRef.current = { ...EMPTY_PAGE_TURN_INTENT };
    if (scrollTarget === "top" && pdfStageRef.current) pdfStageRef.current.scrollTop = 0;
    setPageNumber(boundedPage);
    setPendingSelection(null);
    setSelectedText("");
    setChatContextKind(null);
    setHoveredSegmentId("");
    setContextSegmentId("");
    setContextSegmentIds([]);
    setSelectionContextRects([]);
  }, [pageNumber, pdf]);

  const tryBoundaryPageTurn = useCallback((deltaY: number, stage: HTMLDivElement, timestamp: number, threshold: number) => {
    if (!pdf || timestamp < pageTurnLockedUntilRef.current) return false;
    const atStart = stage.scrollTop <= 2;
    const atEnd = stage.scrollTop + stage.clientHeight >= stage.scrollHeight - 2;
    const result = accumulatePageTurnIntent(pageTurnIntentRef.current, { deltaY, atStart, atEnd, timestamp, threshold });
    pageTurnIntentRef.current = result.intent;
    if (!result.turn) return false;
    const nextPage = pageNumber + result.turn;
    if (nextPage < 1 || nextPage > pdf.numPages) return false;
    pageTurnLockedUntilRef.current = timestamp + PAGE_TURN_COOLDOWN_MS;
    changePage(nextPage, result.turn === 1 ? "top" : "bottom");
    return true;
  }, [changePage, pageNumber, pdf]);

  const handleStageWheel = useCallback((event: ReactWheelEvent<HTMLDivElement>) => {
    if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
    const scale = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? event.currentTarget.clientHeight : 1;
    if (tryBoundaryPageTurn(event.deltaY * scale, event.currentTarget, performance.now(), WHEEL_PAGE_TURN_THRESHOLD)) {
      event.preventDefault();
    }
  }, [tryBoundaryPageTurn]);

  const handleStageTouchStart = useCallback((event: ReactTouchEvent<HTMLDivElement>) => {
    const touch = event.touches[0];
    if (!touch) return;
    touchScrollRef.current = { y: touch.clientY };
    pageTurnIntentRef.current = { ...EMPTY_PAGE_TURN_INTENT };
  }, []);

  const handleStageTouchMove = useCallback((event: ReactTouchEvent<HTMLDivElement>) => {
    const touch = event.touches[0];
    if (!touch) return;
    const timestamp = performance.now();
    const deltaY = touchScrollRef.current.y - touch.clientY;
    touchScrollRef.current = { y: touch.clientY };
    if (tryBoundaryPageTurn(deltaY, event.currentTarget, timestamp, TOUCH_PAGE_TURN_THRESHOLD) && event.cancelable) {
      event.preventDefault();
    }
  }, [tryBoundaryPageTurn]);

  const resetPageTurnGesture = useCallback(() => {
    pageTurnIntentRef.current = { ...EMPTY_PAGE_TURN_INTENT };
  }, []);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return;
      if (event.key === "ArrowLeft") changePage(pageNumber - 1);
      if (event.key === "ArrowRight") changePage(pageNumber + 1);
      if (event.shiftKey && event.key.toLowerCase() === "t") {
        event.preventDefault();
        void translateCurrent();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  });

  if (!isClient) return <main className="workspace-shell hydration-shell" aria-label="正在加载阅读器" />;

  if (appView === "space") {
    return (
      <main
        className={`library-shell ${dragging ? "dragging" : ""}`}
        onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          void loadFile(event.dataTransfer.files?.[0]);
        }}
      >
        <input
          ref={fileInputRef}
          className="sr-only"
          type="file"
          accept="application/pdf"
          onChange={(event) => {
            void loadFile(event.target.files?.[0]);
            event.currentTarget.value = "";
          }}
        />
        <header className="library-header">
          <div className="library-brand">
            <span className="brand-symbol"><TranslationOutlined /></span>
            <strong>PaperLens</strong>
          </div>
          <nav aria-label="主导航"><span className="active"><HomeOutlined /> 我的空间</span></nav>
          <div className="library-header-actions">
            <button className={`library-bridge ${bridgeStatus}`} onClick={() => setShowConnect(true)}>
              <i />
              {bridgeStatus === "ready" ? "Codex 已连接" : bridgeStatus === "checking" ? "正在检测 Codex" : "Codex 未连接"}
            </button>
            <button className="library-import-button" onClick={() => fileInputRef.current?.click()}><PlusOutlined /> 导入 PDF</button>
          </div>
        </header>

        <section className="library-content">
          <div className="library-intro">
            <div>
              <span className="library-eyebrow">本地论文库</span>
              <h1>我的空间</h1>
              <p>继续阅读已经导入的论文，或把新的 PDF 放进来。</p>
            </div>
            <button onClick={() => fileInputRef.current?.click()}><UploadOutlined /> 导入本地论文</button>
          </div>

          <section className="recent-papers" aria-labelledby="recent-papers-title">
            <div className="section-heading">
              <div>
                <h2 id="recent-papers-title">最近阅读</h2>
                <span>{libraryPapers.length ? `${libraryPapers.length} 篇论文保存在这台设备` : "导入过的论文会保存在这台设备"}</span>
              </div>
            </div>

            {libraryLoading ? (
              <div className="library-loading" aria-label="正在读取本地论文"><span /><span /><span /></div>
            ) : libraryPapers.length ? (
              <div className="paper-card-grid">
                {libraryPapers.map((paper) => (
                  <button
                    className="paper-card"
                    key={paper.id}
                    onClick={() => void openLibraryPaper(paper)}
                    disabled={openingPaperId === paper.id}
                    aria-label={`打开 ${paper.displayName}`}
                  >
                    <span className="paper-preview">
                      {paper.thumbnail ? (
                        // Browser-generated PDF previews are data URLs and do not
                        // benefit from the server-side image pipeline.
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={paper.thumbnail} alt="" />
                      ) : <FilePdfOutlined />}
                      <i>{paper.pageCount} 页</i>
                    </span>
                    <span className="paper-card-body">
                      <strong>{paper.displayName}</strong>
                      <span className="paper-status"><i /> {openingPaperId === paper.id ? "正在打开" : "可继续阅读"}</span>
                      <small>{formatLibraryDate(paper.lastOpenedAt)} · {formatFileSize(paper.size)}</small>
                      <em>上次读到第 {paper.lastPage} 页</em>
                    </span>
                  </button>
                ))}
                <button className="add-paper-card" onClick={() => fileInputRef.current?.click()}>
                  <span><PlusOutlined /></span>
                  <strong>导入另一篇论文</strong>
                  <small>PDF 只在本机解析与保存</small>
                </button>
              </div>
            ) : (
              <button className="library-empty" onClick={() => fileInputRef.current?.click()}>
                <span><FilePdfOutlined /></span>
                <strong>还没有导入论文</strong>
                <p>点击这里选择 PDF，之后可以随时从“我的空间”继续阅读。</p>
                <i><PlusOutlined /> 导入第一篇论文</i>
              </button>
            )}
          </section>
        </section>

        <div className="library-drop-hint"><UploadOutlined /> 松开即可导入 PDF</div>

        {showConnect && (
          <div className="modal-backdrop" onMouseDown={() => setShowConnect(false)}>
            <section className="modal" role="dialog" aria-modal="true" aria-labelledby="space-connect-title" onMouseDown={(event) => event.stopPropagation()}>
              <button className="modal-close" onClick={() => setShowConnect(false)} aria-label="关闭"><CloseOutlined /></button>
              <h2 id="space-connect-title">本机 Codex 连接</h2>
              <p>PaperLens 的翻译和论文问答由本机 Codex 完成，论文文件仍只保存在这台设备。</p>
              <div className={`codex-connection-card ${bridgeStatus}`}>
                <RobotOutlined />
                <div><strong>{bridgeStatus === "ready" ? "Codex 已连接" : bridgeStatus === "checking" ? "正在检测…" : "Codex 桥接未启动"}</strong><span>{bridgeStatus === "ready" ? "打开论文后即可翻译和提问" : "请保持 PaperLens 本地服务运行"}</span></div>
              </div>
              <div className="modal-actions"><button className="plain-button" onClick={() => setShowConnect(false)}>关闭</button><button className="primary-button" onClick={() => void checkCodexBridge()}>重新检测</button></div>
            </section>
          </div>
        )}
      </main>
    );
  }

  return (
    <main className="workspace-shell">
      <input
        ref={fileInputRef}
        className="sr-only"
        type="file"
        accept="application/pdf"
        onChange={(event) => {
          void loadFile(event.target.files?.[0]);
          event.currentTarget.value = "";
        }}
      />

      <aside className="thumbnail-sidebar">
        <div className="app-brand">
          <button className="brand-home-button" title="返回我的空间" aria-label="返回我的空间" onClick={goToWorkspace}>
            <span className="brand-symbol"><TranslationOutlined /></span>
            <strong>PaperLens</strong>
          </button>
          <button title="导入本地 PDF" aria-label="导入本地 PDF" onClick={() => fileInputRef.current?.click()}><UploadOutlined /></button>
        </div>
        <div className="thumbnail-list">
          {pdf ? Array.from({ length: Math.min(pdf.numPages, 30) }, (_, index) => {
            const page = index + 1;
            return <Thumbnail key={page} pdf={pdf} pageNumber={page} active={page === pageNumber} onSelect={() => changePage(page)} />;
          }) : (
            <button className="sidebar-empty" onClick={() => fileInputRef.current?.click()}>
              <FilePdfOutlined />
              <span>导入 PDF</span>
            </button>
          )}
        </div>
      </aside>

      <section className={`document-panel ${mobileView === "paper" ? "mobile-active" : ""}`}>
        <header className="document-header">
          <div className="breadcrumb"><button className="breadcrumb-home" onClick={goToWorkspace}><HomeOutlined /> 我的空间</button> <span>/</span> <strong>{fileName || "未导入文档"}</strong> <DownOutlined /></div>
          <div className="document-actions">
            <button className={`bridge-pill ${bridgeStatus}`} onClick={() => setShowConnect(true)} title="本机 Codex 连接状态"><RobotOutlined /> {bridgeStatus === "ready" ? "Codex 已连接" : bridgeStatus === "checking" ? "检测 Codex" : "Codex 未连接"}</button>
            <button onClick={() => fileInputRef.current?.click()}><UploadOutlined /> 更换 PDF</button>
          </div>
        </header>
        <div className="pdf-toolbar">
          <div className="toolbar-group">
            <button title="搜索"><SearchOutlined /></button>
            <button title="上一页" disabled={!pdf || pageNumber <= 1} onClick={() => changePage(pageNumber - 1)}><UpOutlined /></button>
            <input aria-label="页码" value={pageNumber} disabled={!pdf} onChange={(event) => changePage(Number(event.target.value) || 1)} />
            <span>{pdf?.numPages || 0}</span>
            <button title="下一页" disabled={!pdf || pageNumber >= (pdf?.numPages || 1)} onClick={() => changePage(pageNumber + 1)}><DownOutlined /></button>
          </div>
          <div className="toolbar-group zoom-readout">
            <button title="缩小" disabled={zoom <= .6} onClick={() => changeZoom(zoom - .1)}><ZoomOutOutlined /></button>
            <button className="zoom-reset" title="适合宽度（100%）" onClick={() => changeZoom(1)}>{Math.round(zoom * 100)}%</button>
            <button title="放大" disabled={zoom >= 2.5} onClick={() => changeZoom(zoom + .1)}><ZoomInOutlined /></button>
          </div>
          <div className="annotation-tools" aria-label="论文标注工具">
            <button className={annotationMode === "select" ? "active" : ""} title="选择文字" onClick={() => setAnnotationMode("select")}><SelectOutlined /></button>
            <button className={annotationMode === "highlight" ? "active" : ""} title="马克笔" onClick={() => setAnnotationMode("highlight")}><HighlightOutlined /></button>
            <button className={annotationMode === "erase" ? "active" : ""} title="擦除标亮" onClick={() => setAnnotationMode("erase")}><ClearOutlined /></button>
            <button className={chatOpen ? "active" : ""} title="AI Chat" onClick={() => setChatOpen((value) => !value)}><MessageOutlined /></button>
          </div>
        </div>
        <div
          ref={pdfStageRef}
          className={`pdf-stage ${dragging ? "dragging" : ""} mode-${annotationMode}`}
          onWheel={handleStageWheel}
          onTouchStart={handleStageTouchStart}
          onTouchMove={handleStageTouchMove}
          onTouchEnd={resetPageTurnGesture}
          onTouchCancel={resetPageTurnGesture}
          onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => { event.preventDefault(); setDragging(false); loadFile(event.dataTransfer.files?.[0]); }}
        >
          {pdf ? (
            <div ref={paperFrameRef} className="paper-frame" style={{ width: displayPageWidth, aspectRatio: `${pageSize.width}/${pageSize.height}` }} onMouseUp={handlePaperSelection}>
              <canvas ref={canvasRef} className="pdf-canvas" />
              <div className="sync-highlight-layer" aria-hidden="true">
                {chatContextKind === "selection" && selectionContextRects.map((rect, index) => (
                  <span key={`${rect.x}-${rect.y}-${index}`} className="sync-selection-line context" style={{ left: `${rect.x * 100}%`, top: `${rect.y * 100}%`, width: `${rect.width * 100}%`, height: `${rect.height * 100}%` }}>
                    {index === 0 && <i>选区上下文</i>}
                  </span>
                ))}
                {chatContextKind !== "selection" && contextSegment && activeSegment?.id !== contextSegment.id && (() => {
                  const bounds = segmentBounds(contextSegment);
                  return <span className="sync-segment-box context" style={{ left: `${bounds.x * 100}%`, top: `${bounds.y * 100}%`, width: `${bounds.width * 100}%`, height: `${bounds.height * 100}%` }}><i>整段上下文</i></span>;
                })()}
                {activeSegment && !(chatContextKind === "selection" && contextSegmentIds.includes(activeSegment.id)) && (() => {
                  const bounds = segmentBounds(activeSegment);
                  const isContext = activeSegment.id === contextSegment?.id;
                  return <span className={`sync-segment-box ${isContext ? "context" : "preview"}`} style={{ left: `${bounds.x * 100}%`, top: `${bounds.y * 100}%`, width: `${bounds.width * 100}%`, height: `${bounds.height * 100}%` }}><i>{isContext ? chatContextKind === "selection" ? "选区上下文" : "整段上下文" : "对应译文"}</i></span>;
                })()}
              </div>
              <div className="highlight-layer" aria-label="论文标亮">
                {currentHighlights.map((highlight) => (
                  <button
                    key={highlight.id}
                    title={annotationMode === "erase" ? "点击擦除标亮" : highlight.text}
                    className="highlight-mark"
                    style={{ left: `${highlight.x * 100}%`, top: `${highlight.y * 100}%`, width: `${highlight.width * 100}%`, height: `${highlight.height * 100}%` }}
                    onClick={() => removeHighlight(highlight.groupId)}
                  />
                ))}
              </div>
              <div
                ref={textLayerRef}
                className="pdf-text-layer"
                onMouseDown={() => { selectionMadeRef.current = false; }}
                onMouseMove={handleSourceHover}
                onMouseLeave={() => setHoveredSegmentId("")}
                onClick={handleSourceClick}
              />
              <div className="figure-region-layer" aria-label="论文图片区域">
                {currentFigures.map((figure) => (
                  <button
                    key={figure.id}
                    type="button"
                    className={`figure-region-target ${hoveredFigureId === figure.id ? "active" : ""}`}
                    style={{ left: `${figure.rect.x * 100}%`, top: `${figure.rect.y * 100}%`, width: `${figure.rect.width * 100}%`, height: `${figure.rect.height * 100}%` }}
                    aria-label={`将 ${figure.label} 加入 AI Chat`}
                    title={`${figure.label}：点击截取整图并加入 AI Chat`}
                    onMouseEnter={() => setHoveredFigureId(figure.id)}
                    onMouseLeave={() => setHoveredFigureId("")}
                    onClick={(event) => { event.stopPropagation(); void addFigureToChat(figure); }}
                  >
                    <span><PictureOutlined /> {figure.label} · 点击加入 AI Chat</span>
                  </button>
                ))}
              </div>
              {pendingSelection && (
                <div className="selection-bubble" style={{ left: pendingSelection.x, top: pendingSelection.y }}>
                  <button onClick={() => { setChatOpen(true); setPendingSelection(null); window.getSelection()?.removeAllRanges(); requestAnimationFrame(() => chatInputRef.current?.focus()); }}><MessageOutlined /> 问 Codex</button>
                  <button onClick={() => addHighlight(pendingSelection)}><HighlightOutlined /> 标亮</button>
                </div>
              )}
            </div>
          ) : (
            <button className="upload-empty" onClick={() => fileInputRef.current?.click()}>
              <FilePdfOutlined />
              <strong>导入本地论文</strong>
              <span>点击选择，或把 PDF 拖到这里</span>
              <small>文件只在浏览器本机解析</small>
            </button>
          )}
        </div>

        <section className={`ai-chat-drawer ${chatOpen ? "open" : ""} ${chatImages.length ? "has-images" : ""}`} aria-label="AI Chat">
          <div className="chat-drawer-header">
            <button className="chat-drawer-toggle" onClick={() => setChatOpen((value) => !value)} aria-expanded={chatOpen}>
              <span><RobotOutlined /> AI Chat</span>
              <span className={`bridge-status ${bridgeStatus}`}><i /> {bridgeStatus === "ready" ? "本机 Codex" : "未连接"}</span>
              {selectedText && <span className="collapsed-context">已引用：{selectedText.slice(0, 46)}</span>}
              {!!chatImages.length && <span className="collapsed-images"><PictureOutlined /> {chatImages.length} 张图片</span>}
              <DownOutlined className="drawer-arrow" />
            </button>
            {repositoryUrl && <a className="collapsed-repo" href={repositoryUrl} target="_blank" rel="noreferrer" title={`在 GitHub 打开 ${repositoryName(repositoryUrl)}`} aria-label={`在 GitHub 打开仓库 ${repositoryName(repositoryUrl)}`}><i /><GithubOutlined /><span>GitHub</span><b>{repositoryName(repositoryUrl)}</b><ExportOutlined /></a>}
          </div>
          {chatOpen && (
            <div className="chat-drawer-body">
              <div className="chat-context-row">
                {selectedText ? <button className="context-chip" title={selectedText} onClick={clearChatContext}><span>{chatContextKind === "paragraph" ? "整段" : "选区"}</span>{selectedText.slice(0, 54)}<CloseCircleOutlined /></button> : <span className="context-hint">单击引用整段，拖选则只引用选中文字</span>}
                {repositoryUrl && <a className="repo-chip active connected" href={repositoryUrl} target="_blank" rel="noreferrer" title={`在 GitHub 打开 ${repositoryName(repositoryUrl)}`} aria-label={`在 GitHub 打开仓库 ${repositoryName(repositoryUrl)}`}><GithubOutlined /><strong>{repositoryName(repositoryUrl)}</strong><i>按问题动态核实</i><ExportOutlined /></a>}
              </div>
              <div className="chat-messages">
                {!chatMessages.length ? (
                  <div className="chat-empty">
                    <strong>针对当前页或选中内容提问</strong>
                    <span>回答由本机 Codex 生成；检测到仓库时，代码问题会优先核实 GitHub / alphaXiv。</span>
                    <div>
                      <button onClick={() => void sendChat("用直觉解释选中的这段内容")}>直觉解释</button>
                      <button onClick={() => void sendChat("这段内容在整篇论文的方法里起什么作用？")}>方法位置</button>
                      <button onClick={() => void sendChat("这里最容易误解的点是什么？")}>避免误解</button>
                    </div>
                  </div>
                ) : chatMessages.map((item) => <div key={item.id} className={`chat-message ${item.role}`}><span>{item.role === "assistant" ? <RobotOutlined /> : "你"}</span><div><p>{item.role === "assistant" ? <ScientificText text={item.text} /> : item.text}</p>{item.imageLabels?.length ? <small className="message-images"><PictureOutlined /> {item.imageLabels.join("、")}</small> : null}{item.role === "assistant" && item.repositoryUsed !== undefined ? <small className={`message-repository ${item.repositoryUsed ? "verified" : "skipped"}`}><GithubOutlined /> {item.repositoryUsed ? `已核实 ${item.repositoryName}` : "本次无需读取仓库"}</small> : null}</div></div>)}
                {isChatting && <div className="chat-message assistant loading"><span><RobotOutlined /></span><p>{repositoryUrl ? "Codex 正在判断是否需要核实仓库…" : "Codex 正在阅读上下文并核实答案…"}</p></div>}
              </div>
              <div className="chat-composer">
                {!!chatImages.length && (
                  <div className="chat-attachments" aria-label="图片上下文">
                    {chatImages.map((image) => (
                      <figure key={image.id} className="chat-attachment">
                        {/* Local clipboard/PDF crops are data URLs and cannot use the server image pipeline. */}
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={image.dataUrl} alt={image.label} />
                        <figcaption><PictureOutlined /> {image.label}</figcaption>
                        <button type="button" aria-label={`移除 ${image.label}`} onClick={() => setChatImages((previous) => previous.filter((candidate) => candidate.id !== image.id))}><CloseOutlined /></button>
                      </figure>
                    ))}
                  </div>
                )}
                <div className="chat-composer-row">
                  <textarea ref={chatInputRef} value={chatInput} onChange={(event) => setChatInput(event.target.value)} onPaste={handleChatPaste} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void sendChat(); } }} placeholder={chatImages.length ? "询问图片；也可以继续 Command-V 粘贴…" : repositoryUrl ? "问论文或代码实现；Codex 会按需核实仓库…" : "问当前页或选中内容；可 Command-V 粘贴图片…"} />
                  <button disabled={(!chatInput.trim() && !chatImages.length) || isChatting} onClick={() => void sendChat()} aria-label="发送问题"><SendOutlined /></button>
                </div>
              </div>
            </div>
          )}
        </section>
      </section>

      <aside className={`translation-panel ${mobileView === "translation" ? "mobile-active" : ""}`}>
        <nav className="right-tabs">
          <button className={rightTab === "translation" ? "active" : ""} onClick={() => setRightTab("translation")}>翻译</button>
          <button className={rightTab === "outline" ? "active" : ""} onClick={() => setRightTab("outline")}>内容</button>
          <button className={rightTab === "terms" ? "active" : ""} onClick={() => setRightTab("terms")}>术语</button>
          <button className={rightTab === "notes" ? "active" : ""} onClick={() => setRightTab("notes")}>笔记</button>
        </nav>
        <div className="translation-toolbar">
          <div>
            <button title="上一页" disabled={!pdf || pageNumber <= 1} onClick={() => changePage(pageNumber - 1)}><LeftOutlined /></button>
            <button title="下一页" disabled={!pdf || pageNumber >= (pdf?.numPages || 1)} onClick={() => changePage(pageNumber + 1)}><RightOutlined /></button>
          </div>
          <div>
            <button title={currentTranslation ? "重新翻译（本机 Codex）" : "翻译当前页（本机 Codex）"} disabled={!currentText || isTranslating} onClick={translateCurrent}>{currentTranslation ? <ReloadOutlined /> : <TranslationOutlined />}</button>
            <button title="复制译文" disabled={!currentTranslation} onClick={() => navigator.clipboard.writeText(currentTranslation)}><CopyOutlined /></button>
            <button title="Codex 连接" onClick={() => setShowConnect(true)}><SettingOutlined /></button>
            <button title="简体中文"><GlobalOutlined /></button>
          </div>
        </div>

        <div className="translation-content">
          {rightTab === "translation" && (
            <TranslationView
              pageNumber={pageNumber}
              sourceSegments={currentSegments}
              translatedSegments={currentTranslatedSegments}
              loading={isTranslating}
              hasPdf={!!pdf}
              activeSegmentId={activeSegmentId}
              contextSegmentId={contextSegmentId}
              contextSegmentIds={contextSegmentIds}
              contextKind={chatContextKind}
              onActivate={(segmentId) => activateSegment(segmentId, "translation")}
              onDeactivate={() => setHoveredSegmentId("")}
              onTranslate={translateCurrent}
              onImport={() => fileInputRef.current?.click()}
            />
          )}
          {rightTab === "outline" && <OutlineView text={currentTranslation || currentText} />}
          {rightTab === "terms" && <TermsView hasText={!!currentText} />}
          {rightTab === "notes" && <textarea className="notes-area" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="记录这一页的理解、疑问或实验启发…" />}
        </div>

        {!currentTranslation && (
          <div className="translation-footer">
            <span>{message}</span>
            <button disabled={!currentText || isTranslating} onClick={translateCurrent}><TranslationOutlined /> {isTranslating ? "Codex 翻译中…" : "翻译本页"}</button>
          </div>
        )}
      </aside>

      <div className="mobile-switch" role="tablist" aria-label="移动端视图">
        <button className={mobileView === "paper" ? "active" : ""} onClick={() => setMobileView("paper")}><FilePdfOutlined /> 论文</button>
        <button className={mobileView === "translation" ? "active" : ""} onClick={() => setMobileView("translation")}><TranslationOutlined /> 翻译</button>
      </div>

      {showConnect && (
        <div className="modal-backdrop" onMouseDown={() => setShowConnect(false)}>
          <section className="modal" role="dialog" aria-modal="true" aria-labelledby="connect-title" onMouseDown={(event) => event.stopPropagation()}>
            <button className="modal-close" onClick={() => setShowConnect(false)} aria-label="关闭"><CloseOutlined /></button>
            <h2 id="connect-title">本机 Codex 连接</h2>
            <p>PaperLens 不使用单独的 OpenAI API Key。翻译和问答都通过本机桥接调用你已登录的 Codex，并共享 Paper Reader Skill；代码问题可继续使用 Codex 里的 GitHub、alphaXiv 和网页检索。</p>
            <div className={`codex-connection-card ${bridgeStatus}`}>
              <RobotOutlined />
              <div><strong>{bridgeStatus === "ready" ? "Codex 已连接" : bridgeStatus === "checking" ? "正在检测…" : "Codex 桥接未启动"}</strong><span>{bridgeStatus === "ready" ? `使用当前 ChatGPT 登录 · Paper Reader Skill ${skillAvailable ? "已安装" : "未检测到"}` : "请用 npm run dev 同时启动网页和本机桥接"}</span></div>
            </div>
            <div className="modal-actions"><button className="plain-button" onClick={() => setShowConnect(false)}>关闭</button><button className="primary-button" onClick={() => void checkCodexBridge()}>重新检测</button></div>
            <small>本机桥接只监听 127.0.0.1，并以只读沙盒运行 Codex；论文文件仍只在浏览器本机解析。</small>
          </section>
        </div>
      )}

    </main>
  );
}

function Thumbnail({ pdf, pageNumber, active, onSelect }: { pdf: PdfDocument; pageNumber: number; active: boolean; onSelect: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let cancelled = false;
    let renderTask: PdfRenderTask | null = null;
    const draw = async () => {
      const page = await pdf.getPage(pageNumber);
      const viewport = page.getViewport({ scale: .22 });
      const canvas = canvasRef.current;
      if (!canvas || cancelled) return;
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      renderTask = page.render({ canvas, viewport, background: "#ffffff" });
      await renderTask.promise;
    };
    void draw().catch((error: unknown) => {
      if (!cancelled && !(error instanceof Error && error.name === "RenderingCancelledException")) {
        console.error(`PDF thumbnail ${pageNumber} render failed`, error);
      }
    });
    return () => { cancelled = true; renderTask?.cancel(); };
  }, [pageNumber, pdf]);

  return (
    <button className={`thumbnail-item ${active ? "active" : ""}`} onClick={onSelect} aria-label={`第 ${pageNumber} 页`}>
      <canvas ref={canvasRef} />
      <span className="thumbnail-label"><i>{active ? <CheckOutlined /> : null}</i>第 {pageNumber} 页</span>
    </button>
  );
}

function TranslationView({ pageNumber, sourceSegments, translatedSegments, loading, hasPdf, activeSegmentId, contextSegmentId, contextSegmentIds, contextKind, onActivate, onDeactivate, onTranslate, onImport }: {
  pageNumber: number;
  sourceSegments: PageSegment[];
  translatedSegments: TranslatedSegment[];
  loading: boolean;
  hasPdf: boolean;
  activeSegmentId: string;
  contextSegmentId: string;
  contextSegmentIds: string[];
  contextKind: ChatContextKind | null;
  onActivate: (segmentId: string) => void;
  onDeactivate: () => void;
  onTranslate: () => void;
  onImport: () => void;
}) {
  if (!hasPdf) {
    return <div className="right-empty"><FilePdfOutlined /><strong>先导入一篇论文</strong><span>右侧会显示当前页的完整中文翻译</span><button onClick={onImport}>导入 PDF</button></div>;
  }
  if (loading) {
    return <div className="translation-loading"><span /><span /><span /><span /><span /></div>;
  }
  if (!translatedSegments.length) {
    return <div className="right-empty"><TranslationOutlined /><strong>第 {pageNumber} 页尚未翻译</strong><span>由本机 Codex 保留公式、引用和专业术语</span><button onClick={onTranslate}>翻译本页</button></div>;
  }
  const sourceById = new Map(sourceSegments.map((segment) => [segment.id, segment]));
  return (
    <article className="translated-article">
      <div className="article-kicker">第 {pageNumber} 页 · Codex 中文译文 · 段落同步已开启</div>
      {translatedSegments.map((segment) => {
        const source = sourceById.get(segment.id);
        const heading = source?.kind === "heading";
        const active = segment.id === activeSegmentId;
        const context = contextSegmentIds.includes(segment.id);
        return (
          <section
            key={segment.id}
            data-translation-segment={segment.id}
            className={`translated-segment ${active ? "active" : ""} ${context ? "context" : ""}`}
            tabIndex={0}
            onMouseEnter={() => onActivate(segment.id)}
            onMouseMove={() => {
              if (!active) onActivate(segment.id);
            }}
            onMouseLeave={onDeactivate}
            onFocus={() => onActivate(segment.id)}
            onBlur={onDeactivate}
            onClick={() => onActivate(segment.id)}
          >
            {(active || (context && segment.id === contextSegmentId)) && <span className="sync-translation-label">{context ? contextKind === "selection" ? "选区所属译文" : "整段上下文" : "对应原文"}</span>}
            {heading ? <h3><ScientificText text={segment.translation} /></h3> : <p><ScientificText text={segment.translation} /></p>}
            {segment.formulaExplanation && (
              <aside className="formula-explanation">
                <strong>公式解释</strong>
                <span><ScientificText text={segment.formulaExplanation} /></span>
              </aside>
            )}
          </section>
        );
      })}
    </article>
  );
}

function OutlineView({ text }: { text: string }) {
  const sections = text.split(/\n+/).map((line) => line.trim()).filter((line) => line.length > 4).slice(0, 8);
  return <div className="outline-view"><h3>本页内容</h3>{sections.length ? sections.map((line, index) => <button key={index}><span>{String(index + 1).padStart(2, "0")}</span>{line.slice(0, 80)}</button>) : <p>翻译当前页后，这里会生成便于跳读的内容索引。</p>}</div>;
}

function TermsView({ hasText }: { hasText: boolean }) {
  const terms = [
    ["embodied agent", "具身智能体"],
    ["closed-loop control", "闭环控制"],
    ["state transition", "状态转换"],
    ["policy", "策略"],
  ];
  return <div className="terms-view"><h3>本页术语</h3>{hasText ? terms.map(([en, zh]) => <div key={en}><strong>{en}</strong><span>{zh}</span></div>) : <p>导入论文后，这里会整理本页高频术语。</p>}</div>;
}
