import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { access, mkdtemp, rm, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const HOST = "127.0.0.1";
const PORT = Number(process.env.PAPERLENS_CODEX_PORT || 43123);
const PROJECT_ROOT = fileURLToPath(new URL("../", import.meta.url));
const CODEX_CANDIDATES = [process.env.PAPERLENS_CODEX_PATH, "/opt/homebrew/bin/codex", "/usr/local/bin/codex"].filter(Boolean);
const CODEX_ROOT = process.env.CODEX_HOME || join(homedir(), ".codex");
const PAPER_READER_SKILL = process.env.PAPERLENS_SKILL_PATH || join(CODEX_ROOT, "skills", "paper-reader", "SKILL.md");
const ALLOWED_ORIGINS = new Set([
  "http://localhost:3000",
  "http://127.0.0.1:3000",
]);

let codexPath = "codex";
let activeRequest = false;
let skillAvailable = false;

for (const candidate of CODEX_CANDIDATES) {
  try {
    await access(candidate);
    codexPath = candidate;
    break;
  } catch {
    // Continue to the next known installation path.
  }
}

try {
  await access(PAPER_READER_SKILL);
  skillAvailable = true;
} catch {
  skillAvailable = false;
}

function corsHeaders(origin) {
  const allowedOrigin = ALLOWED_ORIGINS.has(origin) ? origin : "http://localhost:3000";
  return {
    "access-control-allow-origin": allowedOrigin,
    "access-control-allow-headers": "content-type",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "cache-control": "no-store",
    "content-type": "application/json; charset=utf-8",
    vary: "Origin",
  };
}

function sendJson(response, status, body, origin) {
  response.writeHead(status, corsHeaders(origin));
  response.end(JSON.stringify(body));
}

async function readJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 34_000_000) throw new Error("请求内容过长；请减少图片数量或尺寸");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

function compact(value, limit) {
  return typeof value === "string" ? value.trim().slice(0, limit) : "";
}

function imageMetadata(payload) {
  return Array.isArray(payload.images)
    ? payload.images.slice(0, 4).map((image, index) => ({
        label: compact(image?.label, 160) || `图片 ${index + 1}`,
        source: image?.source === "paper" ? "论文页面截图" : "用户粘贴图片",
        pageNumber: Number.isInteger(image?.pageNumber) ? image.pageNumber : null,
      }))
    : [];
}

async function materializeImages(payload) {
  const images = Array.isArray(payload.images) ? payload.images.slice(0, 4) : [];
  if (!images.length) return { directory: "", paths: [] };
  const directory = await mkdtemp(join(tmpdir(), "paperlens-images-"));
  const paths = [];
  let totalBytes = 0;
  try {
    for (let index = 0; index < images.length; index += 1) {
      const dataUrl = compact(images[index]?.dataUrl, 15_000_000);
      const match = dataUrl.match(/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=\r\n]+)$/);
      if (!match) throw new Error(`第 ${index + 1} 张图片格式不受支持`);
      const bytes = Buffer.from(match[2], "base64");
      if (!bytes.length || bytes.length > 10 * 1024 * 1024) throw new Error(`第 ${index + 1} 张图片超过 10 MB`);
      totalBytes += bytes.length;
      if (totalBytes > 24 * 1024 * 1024) throw new Error("图片总大小不能超过 24 MB");
      const extension = match[1] === "jpeg" ? "jpg" : match[1];
      const path = join(directory, `image-${index + 1}.${extension}`);
      await writeFile(path, bytes, { flag: "wx" });
      paths.push(path);
    }
    return { directory, paths };
  } catch (error) {
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
}

function buildPrompt(payload) {
  const mode = payload.mode;
  const pageText = compact(payload.pageText, 28_000);
  const selectedText = compact(payload.selectedText, 6_000);
  const question = compact(payload.question, 4_000);
  const paperTitle = compact(payload.paperTitle, 300);
  const repositoryUrl = compact(payload.repositoryUrl, 500);
  const attachedImages = imageMetadata(payload);
  const translationSegments = Array.isArray(payload.segments)
    ? payload.segments.slice(0, 120).map((segment) => ({
        id: compact(segment?.id, 80),
        kind: segment?.kind === "heading" ? "heading" : "paragraph",
        text: compact(segment?.text, 4_000),
      })).filter((segment) => segment.id && segment.text)
    : [];
  const history = Array.isArray(payload.history)
    ? payload.history.slice(-6).map((item) => `${item.role === "assistant" ? "Codex" : "读者"}: ${compact(item.text, 2_000)}`).join("\n\n")
    : "";

  if (mode === "translate") {
    if (!pageText) throw new Error("当前页没有可翻译文字");
    const segments = translationSegments.length ? translationSegments : [{ id: "p1-s1", kind: "paragraph", text: pageText }];
    return [
      "Use $paper-reader in translation mode.",
      "你是 PaperLens 中的论文翻译助手。把下面的英文学术论文内容翻译成自然、准确、易读的简体中文。",
      "严格要求：保留章节层级、公式、变量、引用编号和专业术语；不要总结；不要补充原文没有的信息。",
      "公式规则：所有可可靠还原的数学公式必须转写为有效 LaTeX；行内公式使用 \\( ... \\)，独立公式使用 \\[ ... \\]。不要在公式分隔符外裸露下划线、花括号或 \\prod、\\sum 等命令。公式内容本身不要翻译或改写。",
      "PDF 可能把同一公式的主体、乘积/求和符号、上下限和编号拆到多个输入 segment。只要当前 segment 不是一条完整、可独立核对的公式，或公式的任何关键部分位于相邻 segment，就必须使用 [[SOURCE_FORMULA]]；禁止输出缺少乘积号、上下限、条件项或等号一侧的半条 LaTeX 公式。",
      "如果 PDF 抽取结果不足以无歧义地还原某个公式，绝对不要猜；在该公式原本的位置写入精确标记 [[SOURCE_FORMULA]]，界面会引导读者查看左侧原文。",
      "读者明确希望理解公式：只要本段包含公式，就在 formulaExplanation 中用 1–3 句简体中文解释公式表达的关系、主要变量和上下标/求和范围；只依据当前页上下文，不确定的符号要明确说上下文未定义。没有公式时 formulaExplanation 必须是空字符串。",
      "JSON 转义要求：LaTeX 的每个反斜杠在 JSON 字符串中必须写成双反斜杠，例如 \\\\prod、\\\\theta、\\\\[ 和 \\\\]；确保整个输出可被 JSON.parse 直接解析。",
      "为了让原文与译文双向同步，只输出严格 JSON，不要 Markdown 代码围栏，不要输出 JSON 以外的说明。结构必须是：{\"segments\":[{\"id\":\"原始 id\",\"translation\":\"对应中文译文（公式用 LaTeX 或 [[SOURCE_FORMULA]]）\",\"formulaExplanation\":\"公式解释；无公式时为空字符串\"}]}。每个输入 id 必须恰好出现一次、顺序不变，不得合并或拆分段落。",
      `论文：${paperTitle || "本地论文"}`,
      "当前页分段原文：",
      JSON.stringify(segments),
    ].join("\n\n");
  }

  if (!question) throw new Error("请输入问题");
  const common = [
    "Use $paper-reader in explanation mode unless this is a repository implementation question.",
    "你是运行在 PaperLens 论文阅读器里的本机 Codex。请用简体中文回答，先给直接结论，再解释依据。不要假装看过没有提供或没有查到的内容。",
    "公式输出规则：回答中的每一个数学公式都必须写成有效 LaTeX；行内公式使用 \\( ... \\)，独立公式使用 \\[ ... \\]。不要在分隔符外裸露下划线、花括号或 \\prod、\\sum 等 LaTeX 命令，也不要把公式放进 Markdown 代码围栏。对公式的解释要说明它表达的关系、主要变量以及上下标或求和/乘积范围；当前上下文没有定义的符号要明确指出，禁止猜测。",
    `论文：${paperTitle || "本地论文"}`,
    pageText ? `当前页内容：\n${pageText}` : "",
    selectedText ? `读者选中的重点段落：\n${selectedText}` : "",
    attachedImages.length ? `图片上下文：\n${attachedImages.map((image, index) => `${index + 1}. ${image.label}（${image.source}${image.pageNumber ? `，论文第 ${image.pageNumber} 页` : ""}）`).join("\n")}` : "",
    attachedImages.length ? "请实际查看随请求附带的图片，并将图中的架构、模块、箭头、图例和文字与页面文本结合起来回答。明确区分图片中可见事实与自己的解释；看不清的部分直接说明，不得根据常识补画或猜测。" : "",
    history ? `最近对话：\n${history}` : "",
  ].filter(Boolean);

  if (mode === "repository") {
    common.push(
      "Use $paper-reader in repository verification mode.",
      `论文对应仓库：${repositoryUrl}`,
      "这是一个代码实现问题。必须先通过 GitHub MCP、alphaXiv 的仓库读取工具或实时网页检索核实仓库内容，再回答。请引用准确的文件路径、类/函数/配置名和可访问链接；如果仓库无法访问或证据不足，明确说明，不得凭经验猜测。",
      "最终回答第一行必须是 [[REPOSITORY_USED]]，界面会隐藏这个标记。",
    );
  } else if (mode === "auto") {
    if (!repositoryUrl) throw new Error("自动仓库模式缺少仓库链接");
    common.push(
      `论文已检测到对应仓库：${repositoryUrl}`,
      "先根据读者问题动态判断是否需要读取仓库。一般的论文概念解释、摘要理解、方法直觉、术语和只依赖当前段落的问题，不要读取仓库，直接依据提供的论文上下文回答。",
      "如果问题涉及代码实现、文件或目录、类/函数/接口、配置参数、训练或评估脚本、数据格式、命令行、复现步骤、部署行为，或要求核对论文与代码是否一致，必须切换到 $paper-reader repository verification mode，并先通过 GitHub MCP、alphaXiv 的仓库读取工具或实时网页检索核实真实仓库。引用准确的路径、符号和可访问链接；访问失败时明确说明，禁止猜测。",
      "最终回答第一行必须二选一：实际读取并核实仓库时输出 [[REPOSITORY_USED]]；没有读取仓库时输出 [[REPOSITORY_SKIPPED]]。界面会隐藏这个标记并展示本次路由结果。",
    );
  }

  common.push(`读者问题：\n${question}`);
  return common.join("\n\n");
}

function extractRepositoryDecision(answer, mode) {
  const used = answer.includes("[[REPOSITORY_USED]]");
  const skipped = answer.includes("[[REPOSITORY_SKIPPED]]");
  const cleaned = answer.replace(/\[\[REPOSITORY_(?:USED|SKIPPED)\]\]/g, "").trim();
  if (mode === "repository") return { answer: cleaned, repositoryUsed: true, repositoryDecision: "used" };
  if (mode === "auto" && used) return { answer: cleaned, repositoryUsed: true, repositoryDecision: "used" };
  if (mode === "auto" && skipped) return { answer: cleaned, repositoryUsed: false, repositoryDecision: "skipped" };
  return { answer: cleaned, repositoryDecision: mode === "auto" ? "unreported" : "not-applicable" };
}

async function runCodex(payload) {
  const imageBundle = await materializeImages(payload);
  try {
    return await new Promise((resolve, reject) => {
    const repositoryMode = payload.mode === "repository" || payload.mode === "auto";
    // --search is a top-level Codex CLI option and must appear before `exec`.
    const args = repositoryMode ? ["--search", "exec"] : ["exec"];
    args.push("--json", "--sandbox", "read-only", "--skip-git-repo-check", "--ephemeral");
    if (!repositoryMode) args.push("--ignore-user-config");
    for (const path of imageBundle.paths) args.push("--image", path);
    args.push("-C", PROJECT_ROOT, "-");

    const child = spawn(codexPath, args, {
      cwd: PROJECT_ROOT,
      env: { ...process.env, NO_COLOR: "1" },
      stdio: ["pipe", "pipe", "pipe"],
    });
    const prompt = buildPrompt(payload);
    const answers = [];
    let threadId = "";
    let stdoutBuffer = "";
    let stderr = "";
    let settled = false;

    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error("Codex 响应超时，请稍后重试"));
    }, repositoryMode ? 360_000 : 240_000);

    child.stdout.on("data", (chunk) => {
      stdoutBuffer += chunk.toString("utf8");
      const lines = stdoutBuffer.split("\n");
      stdoutBuffer = lines.pop() || "";
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const event = JSON.parse(line);
          if (event.type === "thread.started") threadId = event.thread_id || "";
          if (event.type === "item.completed" && event.item?.type === "agent_message" && event.item.text) {
            answers.push(event.item.text);
          }
        } catch {
          // Codex may emit non-JSON diagnostics; they are captured in stderr instead.
        }
      }
    });
    child.stderr.on("data", (chunk) => {
      stderr = `${stderr}${chunk.toString("utf8")}`.slice(-12_000);
    });
    child.on("error", (error) => {
      clearTimeout(timeout);
      if (!settled) reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      settled = true;
      const answer = answers.at(-1)?.trim();
      if (code === 0 && answer) resolve({ ...extractRepositoryDecision(answer, payload.mode), threadId });
      else reject(new Error(stderr.trim().split("\n").at(-1) || `Codex 退出，状态码 ${code}`));
    });
    child.stdin.end(prompt);
    });
  } finally {
    if (imageBundle.directory) await rm(imageBundle.directory, { recursive: true, force: true });
  }
}

const server = createServer(async (request, response) => {
  const origin = request.headers.origin || "";
  if (request.method === "OPTIONS") {
    response.writeHead(204, corsHeaders(origin));
    response.end();
    return;
  }
  if (request.method === "GET" && request.url === "/health") {
    sendJson(response, 200, { ok: true, service: "PaperLens Codex bridge", codexPath, skillAvailable, busy: activeRequest }, origin);
    return;
  }
  if (request.method !== "POST" || request.url !== "/invoke") {
    sendJson(response, 404, { error: "Not found" }, origin);
    return;
  }
  if (activeRequest) {
    sendJson(response, 429, { error: "Codex 正在处理上一条请求" }, origin);
    return;
  }

  try {
    const payload = await readJson(request);
    if (!["translate", "chat", "auto", "repository"].includes(payload.mode)) throw new Error("不支持的 Codex 模式");
    activeRequest = true;
    const result = await runCodex(payload);
    sendJson(response, 200, result, origin);
  } catch (error) {
    sendJson(response, 500, { error: error instanceof Error ? error.message : "Codex 调用失败" }, origin);
  } finally {
    activeRequest = false;
  }
});

server.listen(PORT, HOST, () => {
  console.log(`PaperLens Codex bridge: http://${HOST}:${PORT}`);
});
