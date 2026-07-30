# PaperLens Design QA

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
- Text selection, selection-to-chat context, yellow highlight rectangles, group erasure, and page-scoped storage are wired through the rendered text layer. The in-app browser automation does not retain native document selection after synthetic drag, so selection geometry and event handling were additionally verified from the live DOM and source contract.
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

- Hover now renders one bounding box around the complete source paragraph instead of separate line bands; the matching translated section uses a complete border as well.
- A source click locks the paragraph as AI Chat context and labels both sides `整段上下文`.
- A native text selection takes precedence over the following click, replaces the paragraph context with the exact selected text, and labels the owning pair `选区上下文` / `选区所属译文`.
- Selection context now persists its own merged line rectangles and all intersected paragraph IDs. The browser-native range is cleared after capture, preventing a paragraph-sized context box and native glyph selection from appearing at the same time.
- The AI Chat context card explicitly distinguishes `整段` from `选区` and clears both the text and its locked paragraph mapping when removed.
- Real browser evidence: `work/design-captures/implementation-context-paragraph-box.png`. The tested source box measured 283.3 × 77.0 px and its translated counterpart measured 394.0 × 94.6 px for the same `p1-s8` segment.
- Mixed-layout regression: `LingBot_VA2_paper.pdf` page 1 is no longer forced through a midpoint-based two-column split. Its complete abstract maps to one `p1-s7` segment with 36 rendered text spans, from “The advent of video-action models” through “complex manipulation tasks.” The locked source box measured 499.9 × 197.7 px; evidence: `work/design-captures/implementation-lingbot-full-paragraph-box.png`.

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
- Figure detection now groups wrapped caption lines before choosing the bottom edge, so the crop keeps the complete caption without absorbing the following section heading.
- A second canvas-pixel pass scans upward from the caption, bridges small gaps inside the diagram, and stops at larger whitespace above it. This removes separated running headers and horizontal rules from the figure frame.
- Live regression on `LingBot_VA2_paper.pdf`, page 3: Figure 1 was detected, clicked, and the generated AI attachment contained the complete architecture diagram plus all five caption lines, with no neighboring section text.
- The AI Chat composer accepts clipboard images through `Command-V`, shows removable thumbnail attachments, and keeps text, paragraph selection, paper figures, and pasted images as simultaneous context.
- Image attachments are passed to the local Codex CLI through its real `--image` input. The loopback bridge validates PNG/JPEG/WebP payloads, caps each image at 10 MB and the request at four images/24 MB, writes only scoped temporary files, and removes them after the request.

## Boundary page-turn scrolling — 2026-07-30

- Normal wheel and trackpad movement scrolls only inside the current PDF page.
- At the bottom edge, a deliberate continued downward scroll advances exactly one page and positions the next page at its top.
- At the top edge, a deliberate continued upward scroll returns exactly one page and positions the previous page at its bottom.
- Wheel input accumulates only inside a 420 ms gesture window. Touch input uses a separate iPad-sized distance threshold, and a 650 ms cooldown prevents momentum from skipping pages.
- Live regression with `LingBot_VA2_paper.pdf`: an in-page scroll kept page 2 active; an additional boundary scroll changed page 2 to page 3 with `scrollTop: 0`; an upward boundary scroll returned to page 2 with `scrollTop: 333`, matching its measured maximum.
