import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ProviderError } from "./provider-errors.mjs";

// Use the catalog maintained by the installed CLI instead of hard-coding account access.
export async function readCodexModels(codexRoot) {
  return Object.keys(await readCodexModelCatalog(codexRoot));
}

export async function readCodexModelCatalog(codexRoot) {
  try {
    const catalog = JSON.parse(await readFile(join(codexRoot, "models_cache.json"), "utf8"));
    return Object.fromEntries((catalog.models || [])
      .filter((model) => model.visibility === "list" && typeof model.slug === "string")
      .map((model) => [model.slug, (model.supported_reasoning_levels || []).map((level) => level.effort).filter((effort) => typeof effort === "string")]));
  } catch {
    return {};
  }
}

export function codexModelForRequest(mode, options, allowedModels) {
  const translation = mode === "translate" || mode === "terms";
  const fallback = translation ? "gpt-5.6-luna" : "gpt-5.6-sol";
  const selected = (translation ? options.translationModel : options.chatModel) ?? fallback;
  if (selected && !allowedModels.includes(selected) && options.provider === "local-codex") {
    throw new ProviderError(`本机 Codex 模型列表中没有 ${String(selected).slice(0, 80)}，请刷新 AI 服务设置并重新选择`, { code: "invalid_model", status: 400, provider: "local-codex" });
  }
  // API-provider fallbacks can carry a model belonging to another provider.
  return selected === "" ? "" : allowedModels.includes(selected) ? selected : allowedModels.includes(fallback) ? fallback : "";
}

export function codexEffortForRequest(mode, options, model, catalog) {
  const translation = mode === "translate" || mode === "terms";
  const effort = (translation ? options.translationReasoningEffort : options.chatReasoningEffort) || (translation ? "medium" : "high");
  const supported = catalog[model] || [];
  if (supported.length && !supported.includes(effort)) {
    throw new ProviderError(`模型 ${model} 不支持 ${effort} 推理强度，请重新选择`, { code: "invalid_reasoning_effort", status: 400, provider: "local-codex" });
  }
  if (!["none", "minimal", "low", "medium", "high", "xhigh", "max", "ultra"].includes(effort)) {
    throw new ProviderError("不支持的推理强度", { code: "invalid_reasoning_effort", status: 400, provider: "local-codex" });
  }
  return effort;
}
