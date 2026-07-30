import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import test from "node:test";

async function render(pathname = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request(`http://localhost${pathname}`, {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the PaperLens reader shell and metadata", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<html lang="zh-CN">/i);
  assert.match(html, /<title>PaperLens 论文镜 · 双栏论文翻译阅读器<\/title>/i);
  assert.match(html, /导入本地 PDF，保留正在阅读的英文栏，在另一栏查看对应中文翻译。/);
  assert.match(html, /class="workspace-shell hydration-shell"/);
  assert.match(html, /aria-label="正在加载阅读器"/);
  assert.doesNotMatch(html, /Your site is taking shape|Building your site/);
});

test("keeps local PDF reading, direct Codex calls, scrolling, zoom, and mobile controls wired", async () => {
  const [page, bridge, devScript, usbGateway, layout, styles, skill, pdfWorker] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../bridge/server.mjs", import.meta.url), "utf8"),
    readFile(new URL("../scripts/dev.mjs", import.meta.url), "utf8"),
    readFile(new URL("../scripts/usb-gateway.mjs", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(join(homedir(), ".codex", "skills", "paper-reader", "SKILL.md"), "utf8"),
    readFile(new URL("../public/pdf.worker.min.mjs", import.meta.url), "utf8"),
  ]);

  assert.match(page, /type="file"\s+accept="application\/pdf"/);
  assert.match(page, /type AppView = "space" \| "reader"/);
  assert.match(page, /const LIBRARY_DB = "paperlens-local-library"/);
  assert.match(page, /indexedDB\.open\(LIBRARY_DB, 1\)/);
  assert.match(page, /createObjectStore\(LIBRARY_STORE, \{ keyPath: "id" \}\)/);
  assert.match(page, /putStoredPaper/);
  assert.match(page, /getStoredPaper/);
  assert.match(page, /createPdfThumbnail/);
  assert.match(page, /我的空间/);
  assert.match(page, /返回我的空间/);
  assert.match(page, /上次读到第 \{paper\.lastPage\} 页/);
  assert.match(page, /pdfjs\.getDocument\(\{ data \}\)/);
  assert.match(page, /pdfjs-dist\/legacy\/build\/pdf\.mjs/);
  assert.doesNotMatch(page, /import\("pdfjs-dist"\)/);
  assert.match(page, /page\.render\(\{ canvas, viewport, background: "#ffffff" \}\)/);
  assert.match(page, /function getPdfOutputScale\(width: number, height: number\)/);
  assert.match(page, /window\.devicePixelRatio/);
  assert.match(page, /const logicalScale = displayWidth \/ baseViewport\.width/);
  assert.match(page, /viewport: renderViewport/);
  assert.match(page, /canvas\.dataset\.outputScale/);
  assert.match(page, /\[displayWidth,[^\]]*pageNumber,[^\]]*pdf/);
  assert.match(page, /await renderTask\.promise[\s\S]*await page\.getTextContent\(\)/);
  assert.match(page, /await \(textLayerTask as \{ render: \(\) => Promise<void> \}\)\.render\(\);[\s\S]{0,600}textLayer\.style\.width = `\$\{logicalViewport\.width\}px`/);
  assert.match(page, /renderTask\?\.cancel\(\)/);
  assert.match(page, /pdf\.numPages/);
  assert.match(page, /getTextContent\(\)/);
  assert.match(page, /CODEX_BRIDGE/);
  assert.match(page, /const CODEX_BRIDGE = "\/api\/codex"/);
  assert.match(page, /mode: "translate"/);
  assert.match(page, /mode: repositoryUrl \? "auto" : "chat"/);
  assert.match(page, /Math\.min\(pdf\.numPages, 4\)/);
  assert.match(page, /GitHub repository discovery failed/);
  assert.match(page, /在 GitHub 打开仓库/);
  assert.match(page, /href=\{repositoryUrl\}/);
  assert.match(page, /target="_blank"/);
  assert.match(page, /按问题动态核实/);
  assert.match(page, /本次无需读取仓库/);
  assert.match(page, /pdf-text-layer/);
  assert.match(page, /highlight-mark/);
  assert.match(page, /AI Chat/);
  assert.match(page, /detectCaptionFigureRegions/);
  assert.match(page, /refineFigureRegionsWithCanvas/);
  assert.match(page, /figure-region-target/);
  assert.match(page, /addFigureToChat/);
  assert.match(page, /onPaste=\{handleChatPaste\}/);
  assert.match(page, /normalizePastedImage/);
  assert.match(page, /chat-attachments/);
  assert.match(page, /images: chatImages\.map/);
  assert.match(page, /aria-label="移动端视图"/);
  assert.match(page, /changeZoom/);
  assert.match(page, /handleStageScroll/);
  assert.match(page, /onScroll=\{handleStageScroll\}/);
  assert.match(page, /PdfPageView/);
  assert.match(page, /aria-label="连续论文页面"/);
  assert.match(page, /findClosestPageToViewportCenter/);
  assert.match(page, /shouldRenderPage\(targetPage, pageNumber\)/);
  assert.doesNotMatch(page, /accumulatePageTurnIntent|PAGE_TURN_COOLDOWN_MS|onWheel=\{handleStageWheel\}/);
  assert.match(page, /适合宽度（100%）/);
  assert.match(page, /buildPageSegments/);
  assert.match(page, /splitTextLineParts/);
  assert.match(page, /mapPdfTextItemsToSegments/);
  assert.match(page, /alignRenderedTextToSegments/);
  assert.match(page, /const twoColumnPage = leftCount >= 3 && rightCount >= 3/);
  assert.match(page, /> 8_000/);
  assert.match(page, /data-segment-id/);
  assert.match(page, /data-translation-segment/);
  assert.match(page, /katex\.renderToString/);
  assert.match(page, /formulaExplanation/);
  assert.match(page, /item\.role === "assistant" \? <ScientificText text=\{item\.text\} \/>/);
  assert.match(page, /SOURCE_FORMULA/);
  assert.match(page, /jsonPunctuationEscape/);
  assert.match(page, /jsonUnicodeEscape/);
  assert.match(page, /activateSegment/);
  assert.match(page, /handleSourceClick/);
  assert.match(page, /selectionMadeRef/);
  assert.match(page, /mergeSelectionRects/);
  assert.match(page, /selectionContextRects/);
  assert.match(page, /contextSegmentIds/);
  assert.match(page, /range\.intersectsNode/);
  assert.match(page, /selection\.removeAllRanges\(\)/);
  assert.match(page, /className="thumbnail-label"/);
  assert.match(page, /setChatContextKind\("paragraph"\)/);
  assert.match(page, /setChatContextKind\("selection"\)/);
  assert.match(page, /单击引用整段，拖选则只引用选中文字/);
  assert.match(page, /onMouseMove=\{\(\) =>/);
  assert.doesNotMatch(page, /copyForCodex|openPaste|粘贴当前页译文/);

  assert.match(bridge, /spawn\(codexPath/);
  assert.match(bridge, /materializeImages/);
  assert.match(bridge, /args\.push\("--image", path\)/);
  assert.match(bridge, /paperlens-images-/);
  assert.match(bridge, /图片上下文/);
  assert.match(bridge, /24 \* 1024 \* 1024/);
  assert.match(bridge, /"--sandbox", "read-only"/);
  assert.match(bridge, /GitHub MCP、alphaXiv/);
  assert.match(bridge, /\[\[REPOSITORY_USED\]\]/);
  assert.match(bridge, /\[\[REPOSITORY_SKIPPED\]\]/);
  assert.match(bridge, /payload\.mode === "repository" \|\| payload\.mode === "auto"/);
  assert.match(bridge, /repositoryMode \? \["--search", "exec"\] : \["exec"\]/);
  assert.doesNotMatch(bridge, /args\.push\("--search"\)/);
  assert.match(bridge, /extractRepositoryDecision/);
  assert.match(bridge, /\$paper-reader/);
  assert.match(bridge, /skillAvailable/);
  assert.match(bridge, /translationSegments/);
  assert.match(bridge, /只输出严格 JSON/);
  assert.match(bridge, /公式规则/);
  assert.match(bridge, /formulaExplanation/);
  assert.match(bridge, /公式输出规则/);
  assert.match(bridge, /\[\[SOURCE_FORMULA\]\]/);
  assert.match(bridge, /127\.0\.0\.1/);
  assert.match(devScript, /\["--hostname", "localhost"\]/);
  assert.match(devScript, /scripts\/usb-gateway\.mjs/);
  assert.match(devScript, /fileURLToPath/);
  assert.match(bridge, /fileURLToPath/);
  assert.match(usbGateway, /169\.254\./);
  assert.match(usbGateway, /PaperLens iPad USB/);
  assert.match(usbGateway, /incoming\.on\("error", closeUpstream\)/);
  assert.match(usbGateway, /socket\.on\("error", destroyPair\)/);
  assert.match(usbGateway, /server\.on\("clientError"/);
  assert.match(layout, /PaperLens 论文镜/);
  assert.match(styles, /\.pdf-stage \{[^}]*overflow: auto/);
  assert.match(styles, /\.pdf-document-flow \{[^}]*flex-direction: column;[^}]*gap: 18px/);
  assert.match(styles, /-webkit-overflow-scrolling: touch/);
  assert.match(styles, /scrollbar-gutter: stable both-edges/);
  assert.match(styles, /\.paper-frame \{[^}]*max-width: none/);
  assert.match(styles, /\.sync-segment-box/);
  assert.match(styles, /\.figure-region-target/);
  assert.match(styles, /\.chat-attachments/);
  assert.match(styles, /\.sync-segment-box\.context/);
  assert.match(styles, /\.sync-selection-line/);
  assert.match(styles, /\.thumbnail-item > \.thumbnail-label/);
  assert.doesNotMatch(styles, /\.thumbnail-item span \{/);
  assert.match(styles, /\.thumbnail-item i \.anticon \{[^}]*position: absolute;[^}]*inset: 0;[^}]*justify-content: center;[^}]*margin: 0;[^}]*padding: 0/);
  assert.match(styles, /\.thumbnail-item i \.anticon svg \{[^}]*width: 11px;[^}]*height: 11px/);
  assert.match(styles, /\.translated-segment\.active/);
  assert.match(styles, /\.translated-segment\.context/);
  assert.match(styles, /\.translated-math\.display/);
  assert.match(styles, /\.formula-explanation/);
  assert.match(skill, /name: paper-reader/);
  assert.match(skill, /## Verify repository claims/);
  assert.match(pdfWorker, /getOrInsertComputed/);

  await access(new URL("../public/pdf.worker.min.mjs", import.meta.url));
});
