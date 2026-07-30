# PaperLens Design QA

## 产品定位扩展：从论文阅读器到学习资料工作台 — 2026-07-30

- 产品主定位更新为“本地优先的学习资料阅读与理解工作台”，覆盖论文、课程 PPT、讲义和阅读材料。
- 现有 PDF、Word、PPT/PPTX 导入与本机转换能力保持不变；首页、空状态、阅读器、AI Chat、移动端标签和网页元信息统一改用“资料/文档”语言。
- 翻译、术语和问答提示词不再假定输入一定是英文学术论文，同时继续保留公式、引用、专业术语和证据页码要求。
- GitHub/alphaXiv 仓库核实仍作为论文或课程代码材料的增强能力，不再代表整个产品只服务论文。
- 桌面第一屏和 390 × 844 移动端均显示新定位；移动端实测 `scrollWidth = 390`，无水平溢出。
- 新的 `public/og.png` 直接使用 1760 × 992 的真实产品界面，替换旧“论文镜 / 双栏论文”宣传图。
- 验证证据：`output/playwright/learning-materials-positioning-desktop.png`、`output/playwright/learning-materials-positioning-mobile.png`。
- 浏览器控制台：0 errors，0 warnings；TypeScript、ESLint、production build 与 52 个 Node 回归测试全部通过。

final result: passed

## Cross-paper `@` mentions and paper aliases — 2026-07-30

- Imported PDFs now prefer a meaningful metadata title or the visually prominent first-page title instead of exposing a numeric or arbitrary filename as the paper identity. Placeholder metadata such as `(anonymous)` is rejected.
- Each stored paper keeps one stable ID plus searchable aliases from its formal title, original filename, prior aliases, and detected GitHub repository name.
- Live validation upgraded `LingBot_VA2_paper.pdf` to `Native Video-Action Pretraining for Generalizable Robot Control`; typing `@Ling` returned that formal title with `也可通过 LingBot_VA2_paper 找到`.
- The mention menu supports keyboard navigation, Enter/Tab selection, Escape dismissal, mouse selection, removable chips, duplicate exclusion, and a three-paper limit.
- Sending a live cross-paper question parsed the referenced 29-page PDF locally, displayed the formal-title evidence chip, and entered the relevant-page retrieval state without browser console errors. The request was then intentionally stopped before waiting for a model answer.
- Referenced papers contribute at most three question-ranked pages each. The bridge instructs the model to cite paper names and page numbers, separate evidence across papers, and state when the retrieved pages are insufficient.
- Verification: 36 Node tests, TypeScript typecheck, production build, and live in-app browser interaction all passed.

final result: passed

## Dynamic GitHub repository routing — 2026-07-30

- PaperLens now scans the first four PDF pages independently of the restored reading position, covering repository links printed after the abstract.
- A live PDF containing `https://github.com/openai/openai-agents-python` displayed a connected-repository badge next to “本机 Codex”.
- URL parsing was corrected so the period before `1. Introduction` is not absorbed into the repository name; three dedicated extraction tests cover normal, PDF-spaced, and absent-link cases.
- General-question live bridge check returned `repositoryUsed: false` and `repositoryDecision: skipped` without reading the repository.
- Code-question live bridge check returned `repositoryUsed: true`, cited `src/agents/agent.py`, and identified `Agent(AgentBase, Generic[TContext])` from the real repository.
- The current Codex CLI requires top-level `--search` before `exec`; the bridge now uses the verified argument order. Regression tests reject the previous invalid ordering.
- Chat answers expose the routing result as either “已核实 owner/repo” or “本次无需读取仓库”.
- The compact AI Chat header now shows a concrete link such as `GitHub · openai/openai-agents-python`, not a generic connection label. Live DOM verification confirmed `href=https://github.com/openai/openai-agents-python` and `target=_blank`; the expanded context row exposes the same repository link.

final result: passed

## “我的空间”入口与论文库 — 2026-07-30

- Source visual truth: `/var/folders/2h/02kb61_d7sb74rmws2m1sbnw0000gn/T/codex-clipboard-d75e7ad8-144e-46c3-a2d5-25e7289f7108.png`
- Source pixels: 2694 × 762; normalized to 2048 × 579 for comparison.
- Implementation: `work/design-captures/library-implementation-qa-2048x579.png`
- Implementation pixels and CSS viewport: 2048 × 579 at device scale factor 1.
- Combined full-view evidence: `work/design-captures/library-qa-comparison.png`
- Responsive evidence: `work/design-captures/library-mobile-final-390x844.png`
- State: one persisted local PDF, ready to continue at page 2.

**Findings**

- No actionable P0, P1, or P2 mismatch remains. The implementation preserves the reference’s quiet white/lavender paper-library surface, real first-page thumbnail, recent-paper card, completion/readiness status, and direct card-to-reader behavior while adding the requested PaperLens “我的空间” hierarchy.
- Fonts and typography: Geist/PingFang keeps the existing PaperLens UI language; title, section, filename, status, and metadata weights remain distinct without marketing-style decoration.
- Spacing and layout rhythm: the intro was tightened so the paper thumbnail and filename remain visible in the short 2048 × 579 reference viewport. The card grid scales from four columns to one column without horizontal overflow.
- Colors and visual tokens: existing PaperLens purple, lavender surface, neutral borders, and green ready state are reused consistently.
- Image quality and asset fidelity: every imported PDF uses its real rendered first page as the card thumbnail; no placeholder illustration or code-drawn image replaces it.
- Copy and content: “我的空间”, “最近阅读”, local-device storage disclosure, page count, last-opened time, and last-read page all reflect real stored data.

**Interaction and persistence checks**

- Existing paper card opened the real 29-page PDF.
- Page 2 was selected, then the top-left PaperLens control returned to “我的空间”.
- The card changed to “上次读到第 2 页”.
- A full page reload preserved the PDF card, thumbnail, page count, file size, and page-2 reading position through IndexedDB.
- Browser console errors: 0.
- Narrow 390 × 844 layout retained the library card and import path with no horizontal overflow.

**Comparison history**

- Earlier capture `work/design-captures/library-implementation-2048x545.png` placed the card details too low in the short viewport.
- Reduced the workspace’s top padding and recent-section gap, and shortened the preview region.
- Post-fix evidence `work/design-captures/library-implementation-qa-2048x579.png` keeps the hierarchy and paper-card identity visible together.
- A mobile header density issue exposed the Codex status beside the compact import action; the final narrow capture hides that nonessential status and retains the primary import control.

Focused-region comparison was not needed because the normalized full-view comparison renders the complete source card and the implementation card at readable size, including filename, status, and thumbnail.

final result: passed

## Final result

passed

No P0, P1, or P2 visual or interaction defects remain in the verified state.

## Visual truth and verified states

- Reference: `work/design-captures/reference-workspace.png`
- Normalized reference: `work/design-captures/reference-workspace-normalized.png`
- Base implementation: `work/design-captures/implementation-enhanced-loaded.png`
- AI Chat answer state: `work/design-captures/implementation-enhanced-chat-answer.png`
- Full-view comparison: `work/design-captures/qa-comparison-enhanced-desktop.png`
- Focused right-pane comparison: `work/design-captures/qa-comparison-enhanced-right-pane.png`
- AI Chat extension comparison: `work/design-captures/qa-comparison-enhanced-chat.png`
- Desktop viewport: 2048 × 1019 CSS pixels

The verified build preserves the reference hierarchy: narrow lavender thumbnail rail, a dominant center paper canvas, and a pale right-side content panel. PaperLens adds a compact bottom AI Chat drawer without turning the reader into a dashboard or presentation surface.

## Responsive evidence

- Mobile paper view: `work/design-captures/implementation-enhanced-mobile-paper.png`
- Mobile AI Chat view: `work/design-captures/implementation-enhanced-mobile-chat.png`
- Mobile viewport: 390 × 844 CSS pixels

The thumbnail rail and right panel are removed at the mobile breakpoint. A persistent paper/translation switch remains visible, and the AI Chat drawer opens within the available height without horizontal overflow.

## Interaction checks

- A real five-page local PDF loaded and all page thumbnails rendered.
- PDF canvas and selectable text layer were measured after the fix: 887.4 × 1148.4 px and 887.0 × 1147.9 px respectively.
- Text selection, selection-to-chat context, yellow highlight rectangles, drag-to-erase partial geometry, and page-scoped storage are wired through the rendered text layer. The eraser owns an interaction layer above the transparent PDF text spans, so pointer and pen strokes cut only the touched highlight area while leaving neighboring marks intact.
- The abstract's GitHub URL was detected as `openai/openai-agents-python`; repository verification mode toggled on and off and changed the chat prompt.
- A real browser-originated request reached the local Codex bridge and returned: “闭环控制的核心作用是通过持续观察并验证动作是否真正成功，在失败或停滞时及时恢复，避免智能体盲目执行。”
- The Codex connection dialog confirmed current ChatGPT login/config usage, loopback-only bridge access, and read-only sandboxing.
- Browser console reported zero application errors in the final desktop state.

## Fix history

- Constrained the workspace grid row so the AI Chat drawer remains inside the viewport.
- Fixed the PDF.js text layer's computed width from 0 px to the paper width, restoring real text hit-testing and selection alignment.
- Kept the right panel visually quiet until a translation exists.
- Added repository-mode disclosure instead of silently claiming that a code answer was verified.
- Preserved mobile toolbar legibility by removing nonessential zoom controls at the narrow breakpoint.

## Automated verification

- `npm run lint`: passed
- `npm test`: passed
- Production build: passed
- Node tests: 2 passed, 0 failed
- Bridge health: passed at `127.0.0.1:43123`

The Vinext build emits a non-blocking optimize-imports warning for the Ant Design icon barrel; the built application and browser render remain correct.

## Interaction correction — 2026-07-30

- Center-paper wheel scrolling was re-tested from `scrollTop: 0` to the measured page maximum.
- The paper now treats 100% as fit-to-width. At 120%, the measured frame width increased from 687 px to 824.4 px, the scroll width increased from 715 px to 852 px, and horizontal scrolling became available.
- Clicking the percentage restored 100%, a 687 px frame, and zero horizontal offset.
- The legacy copy-to-Codex and paste-translation controls were removed.
- A real page-originated translation completed and populated the right pane without an API key or clipboard step.
- A real page-originated AI Chat request completed inside the bottom drawer.
- Global Skill `/Users/peterxie/.codex/skills/paper-reader/SKILL.md` passed `quick_validate.py`; bridge health reported `skillAvailable: true`.

## Bidirectional paragraph synchronization — 2026-07-30

- PDF.js source text is grouped into stable page-local segments and every rendered text span is assigned to its segment by geometry.
- Page 1 of the bundled sample mapped all 257 rendered spans into 31 source segments under the final classifier.
- A real local Codex translation returned exactly 31 structured translations for those 31 source segments.
- Source to translation: hovering a source paragraph centered and highlighted its matching Chinese segment.
- Translation to source: activating a late translated paragraph scrolled the PDF stage from the top to its measured `333 px` maximum and highlighted the exact source lines.
- Evidence: `work/design-captures/implementation-sync-source-hover.png` and `work/design-captures/implementation-sync-translation-hover.png`.

## Direct iPad USB access — 2026-07-30

- macOS detected the attached iPad over USB and created an active link-local Ethernet route: Mac `169.254.228.223`, iPad `169.254.63.156`.
- PaperLens remains loopback-only at `localhost:3000`; Codex remains loopback-only at `127.0.0.1:43123`.
- A dedicated gateway listens only on the Mac's USB link address and forwards requests with a local Host header, avoiding exposure on Wi-Fi.
- `http://169.254.228.223:3000/` returned `200` and `/api/codex/health` returned `ok: true` through the USB path.
- Real browser verification at the USB URL showed the hydrated PaperLens shell, `Codex 已连接`, no console errors, and no horizontal overflow at a `1024 × 768` iPad landscape viewport.

## Paragraph and selection context — 2026-07-30

- Hover now renders one restrained band for each real source line. A paragraph remains one semantic translation unit, but its visual overlay no longer fills inter-line whitespace or bridges a neighboring column.
- A source click locks the paragraph as AI Chat context and labels both sides `整段上下文`.
- A native text selection takes precedence over the following click, replaces the paragraph context with the exact selected text, and labels the owning pair `选区上下文` / `选区所属译文`.
- Selection context now persists its own merged line rectangles and all intersected paragraph IDs. The browser-native range is cleared after capture, preventing a paragraph-sized context box and native glyph selection from appearing at the same time.
- The AI Chat context card explicitly distinguishes `整段` from `选区` and clears both the text and its locked paragraph mapping when removed.
- Historical browser captures remain in `work/design-captures/`, but their paragraph-sized outlines have been superseded by the line-level overlay.
- Mixed-layout regression: `LingBot_VA2_paper.pdf` page 1 remains one semantic abstract segment while displaying its source geometry as individual lines.

## iPad Safari PDF compatibility — 2026-07-30

- Replaced the modern PDF.js browser entry and worker with the matching legacy build.
- This build supplies the collection, Promise, and typed-array compatibility helpers absent from older iPadOS Safari releases, including `Map#getOrInsertComputed` from the reported crash.
- A source regression check prevents the application or worker from silently returning to the incompatible modern build.
- The visible canvas now renders before text extraction, so a slow or unsupported text layer cannot leave the paper area blank while thumbnails are already visible.
- Main-page rendering uses PDF.js's current explicit `canvas` API and cancels/awaits the previous render task before reusing that canvas during fast page changes.
- USB HTTP and WebSocket connections now absorb Safari `ECONNRESET` events per connection; a cancelled request no longer terminates the entire iPad gateway.

## Formula rendering and explanation — 2026-07-30

- Translation output now uses explicit LaTeX delimiters and renders through KaTeX instead of exposing raw underscores, braces, and commands.
- AI Chat assistant messages now share the same scientific-text renderer; the chat prompt requires valid `\\( ... \\)` / `\\[ ... \\]` LaTeX delimiters and a context-grounded explanation of variables and index ranges.
- Every translated formula requests a concise, context-grounded Chinese explanation in a separate `formulaExplanation` field.
- When PDF text extraction is too ambiguous for a faithful formula reconstruction, Codex returns `[[SOURCE_FORMULA]]`; the translation pane shows a clear “公式以左侧原文为准” fallback and preserves source-to-translation navigation.
- Real regression on `work/LingBot_VA2_paper.pdf`, page 4: 86 KaTeX formula nodes rendered, 58 formula explanations appeared, 39 damaged PDF fragments used the source-formula fallback, and no KaTeX error nodes remained.
- The display-formula wrapper no longer creates a block element inside a paragraph; the live DOM reported zero nested block nodes after hot reload.
- Real AI Chat regression on LingBot page 4 asked for Eq. (4): the response rendered one display formula and 17 inline formulas (18 KaTeX nodes total), with zero fallback badges and zero browser console errors.

## Figure and pasted-image context — 2026-07-30

- Captioned PDF figures expose a full-region hover target; clicking it renders a high-resolution page crop and appends it to AI Chat with its figure label and page number.
- Figure detection groups wrapped caption lines as metadata, but ends the visual frame and AI image crop above the caption. The figure, caption, and following paragraph remain distinct regions.
- A second canvas-pixel pass scans upward from the caption, bridges small gaps inside the diagram, and stops at larger whitespace above it. This removes separated running headers and horizontal rules from the figure frame.
- Existing live regression on `LingBot_VA2_paper.pdf`, page 3 confirmed the figure interaction. The final crop policy excludes its caption lines and retains the caption text only as context metadata.
- The AI Chat composer accepts clipboard images through `Command-V`, shows removable thumbnail attachments, and keeps text, paragraph selection, paper figures, and pasted images as simultaneous context.
- Image attachments are passed to the local Codex CLI through its real `--image` input. The loopback bridge validates PNG/JPEG/WebP payloads, caps each image at 10 MB and the request at four images/24 MB, writes only scoped temporary files, and removes them after the request.

## Text and figure overlay boundary correction — 2026-07-30

- RoboTTT page 9 was replayed against the real PDF coordinates. “As shown in Table 2…” and the adjacent “Task Completion Score” table header now produce separate visual runs instead of one cross-column rectangle.

- Translation synchronization uses one lightly tinted bounding box per paragraph. The paragraph remains separated from neighboring columns and labels near the page top move below the box instead of being clipped.
- RoboTTT page 11 Figure 12 was replayed against the real PDF. The detected image frame ends at normalized y `0.2536`; its caption starts at `0.2596`, so the caption and following prose are outside the interactive crop.
- Figure styling uses a one-pixel border and lighter tint. Its hover label separates figure identity from the “加入 AI Chat” action and moves inside only when there is no safe space above.
- Focused lint passed. All 21 Node regressions passed, and the production build completed successfully.

## Full-paper translation queue — 2026-07-30

- Added a separate “翻译全文” action while preserving “翻译本页”.
- The queue starts with the current page, continues forward, then fills earlier pages; already translated pages are skipped.
- Each completed page is written back to the paper record in IndexedDB so a stopped or reopened task resumes from remaining pages.
- Progress reports completed/total pages, current page, provider usage, paused state, and failed pages. Two consecutive failures stop the queue instead of repeatedly calling a broken Provider.

## Continuous document scrolling — 2026-07-30

- The center reader is one native vertical scroll surface. Page bottoms, the 18 px paper gap, and following page tops move through the viewport continuously without wheel/touch thresholds or cooldown locks.
- Every page retains a correctly sized layout frame, while only the current page and two neighboring pages on each side mount PDF canvases and text layers.
- The page nearest the viewport center becomes active, keeping the toolbar page number, thumbnail selection, translation, notes, and chat context synchronized while the document moves.
- Thumbnail, toolbar, and translation-panel navigation scroll to the selected page. Nearby jumps animate unless the operating system requests reduced motion; distant jumps are immediate.
- Focused geometry regressions cover active-page selection, empty-frame fallback, and the two-page render overscan. TypeScript, all 21 Node regressions, and the production build pass.

## Last-read restoration and resizable panels — 2026-07-30

- Active-page changes synchronously update a local progress mirror and asynchronously persist the page, timestamp, and matching page thumbnail in IndexedDB. Refreshing or closing the reader no longer depends on using the in-app back button first.
- “我的空间” shows the actual last-read page preview and an explicit `第 N 页 / 共 M 页` badge. Opening a stored paper restores that page and scrolls the continuous document directly to it.
- Both desktop dividers are pointer-draggable and keyboard accessible. Width constraints preserve usable left, center, and right panels; the chosen layout persists across refreshes. Mobile keeps the existing paper/translation switch without desktop resize handles.
- Real browser regression used a 9-page PDF: page 8 remained visible in the card and reopened at page 8. Dragging the left divider left by 40 px grew the center from 622 px to 662 px; dragging the right divider right by 60 px grew it to 722 px. Refresh restored left/center/right widths of 104/722/360 px.
- TypeScript, lint, the production build, and all 36 Node regressions pass.

## Marker drag preview alignment — 2026-07-30

- Marker mode no longer activates source-to-translation paragraph hover overlays while the user is dragging across PDF text.
- Native selection preview uses the same translucent yellow as the committed marker rectangles; the purple paragraph box and `选区上下文` label remain exclusive to selection mode.
- Committing a marker stroke no longer changes AI Chat's selected-text context. Choosing `标亮` from an explicit text selection still preserves that selection context.
- Real browser regression on `mobile-aloha.pdf` dragged across eight abstract lines. Preview and committed highlight top/bottom coordinates matched with `0 px` delta, no segment box was visible during the drag, and no selection-context overlay remained after mouseup.
- Visual evidence: `output/playwright/marker-preview.png` and `output/playwright/marker-final.png`.

## Paper-specific dynamic terminology — 2026-07-30

- Removed the four hard-coded demo terms. Opening the terminology tab now asks the selected AI provider for 6–10 technical terms that actually appear on the active PDF page and renders the returned English/Chinese pairs.
- Term responses use a strict JSON contract, reject empty output, normalize whitespace, deduplicate English terms case-insensitively, and cap the rendered list at 12 entries.
- Results are cached per paper and page in IndexedDB. Reopening a paper or returning to a previously processed page restores its terms without another provider request; “重新提取” explicitly refreshes them.
- Real browser regression used `17135_Drifting_Policies_for_Vi.pdf`. Page 1 returned terms including `flow matching`, `diffusion heads`, and `rule-based verifier`; page 2 returned a different list including `Unrolled denoising MDP`, `PPO over denoising steps`, and `filtered behavior cloning`.
- Returning from page 2 to page 1 restored the original page-1 list immediately. The browser request log remained at two successful `/api/codex/invoke` requests, proving the return used the page cache.
- TypeScript, lint, the production build, and all 39 Node regressions pass.

## Resizable AI Chat drawer — 2026-07-30

- The horizontal rule above AI Chat is now a pointer-draggable, keyboard-accessible separator. Dragging upward enlarges the drawer; dragging downward returns space to the paper.
- The drawer clamps between a usable chat minimum and a viewport-dependent maximum that preserves at least 260 px for the paper reader. Arrow Up/Down adjusts it in 16 px steps, and double-click restores the 292 px default.
- The chosen height is stored with the existing reader layout and restored after refresh. Image and paper-context attachments now consume the flexible drawer body instead of switching among four hard-coded heights.
- Real browser regression at a 934 px document height dragged the divider upward by 120 px: AI Chat grew from 292 px to 412 px while the PDF stage changed from 542 px to 422 px. After refresh and reopening the stored paper, AI Chat returned at exactly 412 px.

## Marker line locking and full-width drag — 2026-07-30

- Marker strokes now use pointer capture and an explicit PDF text-layer range instead of depending on the browser's native drag selection lifecycle.
- Dragging into the blank area to the right of a text line resolves to that line's final text fragment, so the committed highlight reaches the actual line ending.
- Small vertical drift remains locked to the starting line; moving beyond the line-lock threshold still produces an intentional multi-line highlight.
- Real browser regression on LingBot-VA 2.0 page 2 dragged from x `300` to blank-space x `820` with a 6 px downward drift. It committed one row ending at the text line's measured right edge (`715.27 px`). A fragmented line ended at its final fragment (`749.14 px`), and a deliberate 37 px vertical drag continued to select four rows.
- The production build and all 52 Node regressions pass.
# 文件夹与 AI Chat 整文件夹引用 — 2026-07-30

- “我的空间”支持创建持久化文件夹、按文件夹筛选资料，并通过论文卡片上的下拉控件移动归档；从 IndexedDB v1 自动升级到 v2，保留既有论文、译文、笔记和批注。
- 删除文件夹只解除归档，不删除其中资料。向当前文件夹导入或拖放的新资料会自动归入该文件夹。
- AI Chat 的 `@` 菜单同时搜索论文和文件夹；空查询时优先显示非空文件夹，文件夹候选明确显示资料数量和“按问题检索整个文件夹”。
- 发送问题时会扫描被引用文件夹中的全部论文，并在受控上下文预算内选择最相关的最多 5 份论文及证据页；回答提示要求说明实际采用的资料名称和页码。
- 真实页面验证完成：创建文件夹、把论文移入文件夹、打开论文、输入 `@QA`、选择整个文件夹，折叠栏和编辑器均显示文件夹引用状态。
- TypeScript、生产构建及全部 54 项 Node 回归测试通过；浏览器控制台无应用错误。

# 全文目录与章节跳转 — 2026-07-30

- “内容”不再截取当前页正文或译文，而是生成与翻译状态无关的全文目录；优先读取 PDF 内置书签，没有书签时扫描全文文字层和标题几何信息。
- 目录只保留 Abstract、Introduction、Method、Experiments、Conclusion、References 等主章节层级，并过滤公式变量、FPS 数值、表格列名和正文碎片。
- 每个目录项显示真实 PDF 页码；点击后复用连续阅读区的 `changePage` 跳转，页码输入框、左侧缩略图、中心 PDF 位置和右侧当前章节状态同步更新。
- 扫描期间展示全文页数进度；读取失败时可重试。未翻译页面不会再用底部“翻译本页”浮层遮挡目录。
- 真实浏览器验收使用 29 页 `LingBot_VA2_paper.pdf`：识别 8 个主章节，点击 `3 Data Recipe` 后页码、缩略图和原文均定位到第 15 页，目录项同步高亮；验收后的控制台无新增应用错误。
