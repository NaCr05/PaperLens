import { spawn } from "node:child_process";
import { access, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, extname, join, parse } from "node:path";
import { pathToFileURL } from "node:url";

export const OFFICE_DOCUMENT_EXTENSIONS = Object.freeze([".doc", ".docx", ".ppt", ".pptx"]);

function defaultSofficeCandidates() {
  return [
    process.env.PAPERLENS_SOFFICE_PATH,
    "soffice",
    "/Applications/LibreOffice.app/Contents/MacOS/soffice",
    "/opt/homebrew/bin/soffice",
    "/usr/local/bin/soffice",
  ].filter(Boolean);
}

export class DocumentConversionError extends Error {
  constructor(message, { code = "conversion_failed", status = 500 } = {}) {
    super(message);
    this.name = "DocumentConversionError";
    this.code = code;
    this.status = status;
  }
}

function executableCandidates(candidate) {
  if (candidate.includes("/")) return [candidate];
  return (process.env.PATH || "").split(":").filter(Boolean).map((directory) => join(directory, candidate));
}

export async function findSoffice(candidates = defaultSofficeCandidates()) {
  for (const candidate of candidates) {
    for (const path of executableCandidates(candidate)) {
      try {
        await access(path);
        return path;
      } catch {
        // Continue through explicit paths and PATH entries.
      }
    }
  }
  return "";
}

export function normalizeOfficeFileName(fileName) {
  const safeBaseName = basename(String(fileName || "")).replaceAll("\0", "").trim();
  const extension = extname(safeBaseName).toLowerCase();
  if (!OFFICE_DOCUMENT_EXTENSIONS.includes(extension)) {
    throw new DocumentConversionError("仅支持 Word（DOC/DOCX）和 PowerPoint（PPT/PPTX）文件", {
      code: "unsupported_document_type",
      status: 415,
    });
  }
  const stem = parse(safeBaseName).name.replace(/[\\/:*?"<>|]/g, "_").trim().slice(0, 140) || "document";
  return `${stem}${extension}`;
}

function runSoffice(executablePath, args, timeoutMs) {
  return new Promise((resolve, reject) => {
    const child = spawn(executablePath, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill("SIGTERM");
      reject(new DocumentConversionError("文档转换超时，请检查文件是否损坏或过大", { code: "conversion_timeout", status: 504 }));
    }, timeoutMs);

    child.stdout.on("data", (chunk) => { stdout = `${stdout}${chunk}`.slice(-8_000); });
    child.stderr.on("data", (chunk) => { stderr = `${stderr}${chunk}`.slice(-8_000); });
    child.on("error", (error) => {
      clearTimeout(timeout);
      if (!settled) {
        settled = true;
        reject(new DocumentConversionError(`无法启动本机文档转换：${error.message}`, { code: "converter_unavailable", status: 503 }));
      }
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      if (settled) return;
      settled = true;
      if (code === 0) resolve({ stdout, stderr });
      else reject(new DocumentConversionError(stderr.trim() || stdout.trim() || `文档转换失败（状态码 ${code}）`));
    });
  });
}

export async function createDocumentConverter({ candidates, timeoutMs = 120_000 } = {}) {
  const executablePath = await findSoffice(candidates);
  return {
    available: Boolean(executablePath),
    engine: executablePath ? "LibreOffice" : "",
    formats: OFFICE_DOCUMENT_EXTENSIONS,
    async convert(bytes, fileName) {
      if (!executablePath) {
        throw new DocumentConversionError("本机未检测到 LibreOffice，暂时无法把 Word/PPT 转为 PDF", {
          code: "converter_unavailable",
          status: 503,
        });
      }
      const normalizedName = normalizeOfficeFileName(fileName);
      const directory = await mkdtemp(join(tmpdir(), "paperlens-convert-"));
      const inputDirectory = join(directory, "input");
      const outputDirectory = join(directory, "output");
      const profileDirectory = join(directory, "profile");
      await Promise.all([mkdir(inputDirectory), mkdir(outputDirectory), mkdir(profileDirectory)]);
      const inputPath = join(inputDirectory, normalizedName);
      try {
        await writeFile(inputPath, bytes, { flag: "wx" });
        await runSoffice(executablePath, [
          `-env:UserInstallation=${pathToFileURL(profileDirectory).href}`,
          "--headless",
          "--nologo",
          "--nodefault",
          "--nolockcheck",
          "--nofirststartwizard",
          "--convert-to",
          "pdf",
          "--outdir",
          outputDirectory,
          inputPath,
        ], timeoutMs);
        const outputNames = await readdir(outputDirectory);
        const outputName = outputNames.find((name) => extname(name).toLowerCase() === ".pdf");
        if (!outputName) throw new DocumentConversionError("转换程序没有生成 PDF，请确认文件能在 Word 或 PowerPoint 中正常打开");
        const pdf = await readFile(join(outputDirectory, outputName));
        if (!pdf.length) throw new DocumentConversionError("转换生成了空的 PDF 文件");
        return { pdf, fileName: `${parse(normalizedName).name}.pdf`, engine: "LibreOffice" };
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    },
  };
}
