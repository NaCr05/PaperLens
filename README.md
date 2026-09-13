# PaperLens Local

[English](./README.en.md) · [TODO](./TODO.md) · [Apache-2.0 License](./LICENSE)

> 一个本地优先的 PDF 阅读器：导入资料、同步原文与译文，并直接连接本机 Codex 完成更准确的全文翻译。

PaperLens 面向论文、课程讲义和其他 PDF 学习资料。文件在本机读取，原文与译文保持段落对应，翻译请求直接交给本机 Codex。

## 演示视频

<video src="https://github.com/user-attachments/assets/58a690bb-1713-4989-953f-b0f5932e93bd" controls muted playsinline width="100%"></video>
## 核心功能

- **多格式导入**：支持 PDF、DOC、DOCX、PPT 和 PPTX；Office 文件通过本机 LibreOffice 临时转换为 PDF。
- **段落双向同步**：悬停、聚焦或点击原文/译文段落，都可以定位另一侧的对应内容。
- **全文翻译**：一键从当前页开始翻译全文，逐页保存进度，之后可以继续未完成的页面。
- **本机 Codex**：默认直接调用已登录的本机 Codex，翻译使用可用模型和 `paper-reader` Skill，减少额外配置并提升翻译准确度。

## 使用流程

1. 在“我的空间”导入资料，按文件夹整理，并从最近阅读继续。

   <img src="./public/readme-step-1-space.png" alt="步骤 1：导入与整理" width="100%">

2. 打开资料，左侧阅读原文，右侧查看同步译文，在底部 AI Chat 直接提问。

   <img src="./public/readme-step-2-reader.png" alt="步骤 2：阅读、翻译与提问" width="100%">

3. 调整缩放继续阅读，公式和段落在原文与译文之间保持对应。

   <img src="./public/readme-step-3-sync.png" alt="步骤 3：同步阅读" width="100%">

## 工作方式

```mermaid
flowchart LR
  INPUT["PDF / DOC / DOCX / PPT / PPTX"] --> CONVERT["本机转换（Office 文件）"]
  CONVERT --> READER["PaperLens PDF 阅读器"]
  READER --> SYNC["原文与译文段落同步"]
  READER --> BRIDGE["127.0.0.1:43123 本机 bridge"]
  BRIDGE --> CODEX["已登录的本机 Codex"]
  CODEX --> TRANSLATION["逐页或全文翻译"]
```

PDF 由浏览器本地读取；Office 文件只在本机转换。AI bridge 仅监听 `127.0.0.1`，主动翻译时才会把资料内容交给本机 Codex。

## 环境要求

- macOS；Windows 11 64 位已支持开发启动与构建，功能范围见下方 Windows 说明
- Node.js `>= 22.13.0`
- npm
- 使用本机 AI 功能时，需要安装并登录 [Codex CLI](https://developers.openai.com/codex/cli/)
- 需要导入 DOC/DOCX/PPT/PPTX 时，再安装 LibreOffice
- 可选：全局安装 `paper-reader` Skill

## 安装与启动

```bash
git clone https://github.com/Peter-cuhk/PaperLens.git
cd PaperLens
npm install
cp .env.example .env
npm run dev
```

打开 <http://localhost:3000>。

`npm run dev` 会启动：

| 服务 | 地址 | 用途 |
| --- | --- | --- |
| PaperLens Web | `http://localhost:3000` | PDF 阅读器界面 |
| AI bridge | `http://127.0.0.1:43123` | 本机 Codex 翻译调用 |
| iPad USB gateway | 自动检测 `169.254.*.*` | 可选的直连访问 |

### Windows（PowerShell）

安装 Node.js `>= 22.13.0` 和 Git 后，在 PowerShell 中运行：

```powershell
git clone https://github.com/Peter-cuhk/PaperLens.git
cd PaperLens
npm ci
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
npm run dev
```

打开 <http://localhost:3000>，在另一个 PowerShell 窗口检查 bridge：

```powershell
Invoke-RestMethod http://127.0.0.1:43123/health
```

`ok: true` 和 `service: "PaperLens AI bridge"` 表示 bridge 已启动。当前 Windows 适配覆盖开发启动、构建和 Web 启动；Codex 自动发现与调用、Office 转换以及 iPad USB 连接仍待单独适配和验证。因此 `providers.local-codex.available: false` 或 `USB: waiting…` 不代表网页启动失败，启动检查也不需要登录 AI 账户。

在运行服务的窗口按 `Ctrl+C` 停止本次启动的服务。开发参数通过 `--` 转发，例如 `npm run dev -- --port 3001`。项目目录可以包含空格或中文。

构建并查看生产 Web 页面：

```powershell
npm run build
npm run start -- --hostname localhost
```

`start` 只启动构建后的 Web 服务，不会启动 AI bridge 或 USB gateway。日常本机阅读开发流程使用 `npm run dev`。

如果 PowerShell 提示无法加载 `npm.ps1`，可在上述命令中把 `npm` 换成 `npm.cmd`，无需修改系统执行策略。

### macOS 首次启动检查

```bash
node --version       # >= 22.13.0
npm --version
codex login status   # 应显示已登录
cp .env.example .env # 只需首次执行
npm run dev
curl http://127.0.0.1:43123/health
```

健康检查中应看到 `defaultProvider: "local-codex"` 和 `providers.local-codex.available: true`。网页右上角应显示“本机 Codex · <模型名>”。

如只需要启动 bridge：

```bash
npm run bridge
```

### 启动兼容性检查

```bash
npm run test:startup
npm run build
npm run test:startup-smoke
npm run typecheck
npm run lint
```

`test:startup` 使用独立模拟服务验证参数、中文／空格路径、失败处理和进程清理；`test:startup-smoke` 需要先构建，会启动真实开发／生产 Web 服务、检查页面和 bridge，再停止服务。两者均不会发起 AI 推理或文档转换。

GitHub Actions 在 Windows 和 macOS、Node.js 22 和 24 上执行上述检查，并将仓库放在带空格和中文的目录中。完整测试命令仍为 `npm test`；其中现有 Codex 模拟 CLI 测试使用 Unix shebang，页面源码测试还依赖个人目录的 `paper-reader/SKILL.md`，干净 Windows 环境仍可能因这两项前置条件失败。这些问题不属于本轮启动适配的通过项。

## 使用方式

1. 在“我的空间”点击“导入学习资料”，或把文件拖入页面。
2. 在阅读区选择页面；左侧显示原文，右侧显示译文。
3. 点击“翻译全文”，让本机 Codex 按页完成整份资料翻译。
4. 悬停、聚焦或点击任一侧段落，另一侧会同步定位对应段落。

当前默认使用本机 Codex；未来改用 ChatGPT 的计划记录在 [TODO](./TODO.md)，本 README 不展开实验性网页回答通道。

项目名称统一为 `PaperLens`；相关后续事项记录在 [TODO](./TODO.md) 中。

## 待办事项

- [ ] 未来将 AI 路径接入 ChatGPT 网页端。
- [ ] 发布并上线官网，未来支持 API 按使用量计费（用多少付多少）。
