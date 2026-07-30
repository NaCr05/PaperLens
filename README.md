# PaperLens 论文镜

> 面向英文学术论文的本地优先双栏阅读器：左侧保留 PDF 原文，右侧生成结构化中文译文，底部通过本机 Codex 进行论文问答。

![PaperLens 论文镜](./public/og.png)

PaperLens 希望把“阅读原文、查看译文、理解公式、引用图表、继续追问”放在同一个界面里。PDF 在浏览器中解析与渲染；翻译和问答通过回环地址上的本机 bridge 调用已登录的 Codex CLI，不需要另配 OpenAI API Key。

## 核心能力

- **双栏论文阅读**：PDF 原文与中文译文并排展示，支持缩略图、翻页和 60%–250% 缩放。
- **段落双向同步**：悬停、聚焦或点击任一侧段落，都能定位另一侧对应内容。
- **精确上下文选择**：单击引用整段，拖选则只引用实际选中的文字和行。
- **公式渲染与解释**：译文和 AI Chat 均使用 KaTeX；无法可靠恢复的 PDF 公式会提示以左侧原文为准，不猜测残缺公式。
- **论文图片上下文**：自动检测带 Figure/Fig. 图注的图片区域，点击即可截取整图加入 AI Chat；聊天输入框也支持 `Command-V` 粘贴截图。
- **本机论文问答**：Codex 结合当前页、选中文字、图片和最近对话回答，并明确区分可见事实与解释。
- **仓库核实模式**：检测到论文仓库后，代码实现类问题会要求核实 GitHub、alphaXiv 或实时来源，避免按经验臆测接口。
- **批注与阅读手势**：支持 PDF 文字标亮、橡皮擦，以及页面边界处的单页滚动切换。
- **iPad 直连**：可选的 USB link-local 网关让 iPad 通过 Mac 访问阅读器，同时保持 Codex bridge 仅监听本机回环地址。

## 工作方式

```mermaid
flowchart LR
  PDF["本地 PDF"] --> PDFJS["PDF.js 解析与画布渲染"]
  PDFJS --> Reader["原文、段落、公式与图片区域"]
  Reader --> UI["PaperLens 双栏界面"]
  UI --> Proxy["同源 /api/codex 代理"]
  Proxy --> Bridge["127.0.0.1:43123 本机 bridge"]
  Bridge --> Codex["已登录的 Codex CLI"]
  Codex --> UI
```

PaperLens 是 **local-first**，但不是完全离线工具：PDF 文件由浏览器本地读取；当你主动翻译或提问时，相关页面文字、选区或图片会交给本机 Codex CLI 处理。是否产生网络请求取决于 Codex CLI 的运行方式。

## 环境要求

- macOS（当前开发和 iPad USB 流程的验证环境）
- Node.js `>= 22.13.0`
- npm
- 已安装并登录的 [Codex CLI](https://developers.openai.com/codex/cli/)
- 推荐安装全局 `paper-reader` Skill，用于约束翻译、解释和仓库核实行为

检查环境：

```bash
node --version
npm --version
codex --version
codex login status
```

## 安装与启动

```bash
git clone https://github.com/Peter-cuhk/PaperLens.git
cd PaperLens
npm install
npm run dev
```

打开 [http://localhost:3000](http://localhost:3000)。

`npm run dev` 会同时启动：

| 服务 | 地址 | 用途 |
| --- | --- | --- |
| PaperLens Web | `http://localhost:3000` | 阅读器界面 |
| Codex bridge | `http://127.0.0.1:43123` | 本机翻译和问答调用 |
| iPad USB gateway | 自动检测 `169.254.*.*` | 可选的直连访问入口 |

如只需要启动 bridge：

```bash
npm run bridge
```

## 使用指南

### 导入与阅读

1. 在“我的空间”点击“导入本地论文”，或把 PDF 拖入页面。
2. 使用左侧缩略图或顶部页码切换页面。
3. `100%` 表示适应阅读区宽度；点击百分比可快速恢复。
4. 普通滚动只移动当前页；到达边界后继续一次明确手势才会翻页，避免触控板惯性连续跳页。

### 翻译与公式

1. 点击右侧“翻译本页”。
2. 译文按 PDF 几何分段，并与原文段落保持映射。
3. 可可靠恢复的公式通过 KaTeX 排版，并附带变量、上下标或求和范围说明。
4. PDF 抽取破坏了公式结构时，界面显示“公式以左侧原文为准”。

### AI Chat

- 单击原文段落：引用整段。
- 拖选原文：只引用选区。
- 点击 Figure 悬停框：截取整张论文图片及完整图注。
- 在输入框按 `Command-V`：加入剪贴板截图。
- 每次最多引用 4 张图片；单图上限 10 MB，总上限 24 MB。
- 图片会写入请求级临时目录，并在本次 Codex 调用结束后清理。

## 安全边界

- Codex bridge 只监听 `127.0.0.1`，不会直接暴露到局域网或 iPad。
- bridge 只接受 PaperLens 本地来源，并在只读 sandbox 中调用 Codex。
- 本地粘贴图片仅接受 PNG、JPEG 和 WebP。
- 仓库实现问题要求真实来源证据；来源不可用时应明确停止，而不是补猜实现。
- `.env*`、构建缓存、运行输出、临时工作文件和 `node_modules` 已通过 `.gitignore` 排除。

## 项目结构

```text
app/
  page.tsx                  # 阅读器主界面、PDF 渲染、翻译、聊天与同步
  figure-regions.ts         # 图注驱动的图片区域检测与像素边界修正
  selection-geometry.ts     # PDF 文本选区合并
  page-turn-gesture.ts      # 边界翻页手势状态机
  github-repository.ts      # 论文仓库 URL 提取
bridge/
  server.mjs                # 回环 Codex bridge、提示词和图片临时文件
scripts/
  dev.mjs                   # 同时启动 Web、bridge 与 USB gateway
  usb-gateway.mjs           # iPad USB link-local 转发
tests/                      # 图框、选区、翻页、仓库和页面契约测试
public/
  pdf.worker.min.mjs        # 与当前 PDF.js 版本匹配的 worker
worker/                     # Web/API worker 入口
design-qa.md                # 实现与浏览器验收记录
```

## 开发与验证

```bash
npm run lint
npm test
```

`npm test` 会先执行生产构建，再运行 Node 测试。当前回归覆盖：

- PDF 图框与多行图注边界
- 跨行文字选区合并
- 页面边界翻页手势
- GitHub 仓库地址提取
- 页面、KaTeX、Codex bridge、iPad gateway 和图片上下文的源码契约

## 常见问题

### 页面显示“Codex 未连接”

确认 `codex` 已安装并登录，并检查 bridge：

```bash
curl http://127.0.0.1:43123/health
```

### 端口被占用

```bash
lsof -nP -iTCP:3000 -sTCP:LISTEN
lsof -nP -iTCP:43123 -sTCP:LISTEN
```

关闭旧的 PaperLens 进程后重新运行 `npm run dev`。

### 公式没有正确恢复

PDF 的视觉公式经常被拆成多个无结构文本片段。PaperLens 只对能够无歧义恢复的内容生成 LaTeX；其余情况保留左侧 PDF 作为权威来源。

## 当前状态

PaperLens 目前是面向本地论文阅读工作流的个人项目，重点是实用性和可验证行为，而不是通用云端文献管理。实现与浏览器验收细节记录在 [`design-qa.md`](./design-qa.md)。
