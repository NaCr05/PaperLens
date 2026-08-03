import tcb from "@cloudbase/node-sdk";
import { ProviderError, normalizeProviderError } from "../provider-errors.mjs";

export const CLOUDBASE_HUNYUAN_MODELS = ["hy3"];

function normalizeUsage(usage) {
  if (!usage) return undefined;
  return {
    inputTokens: usage.prompt_tokens || 0,
    outputTokens: usage.completion_tokens || 0,
    totalTokens: usage.total_tokens || 0,
    cachedTokens: 0,
    reasoningTokens: 0,
  };
}

function delay(milliseconds, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException("Aborted", "AbortError"));
    const timeout = setTimeout(resolve, milliseconds);
    signal?.addEventListener("abort", () => {
      clearTimeout(timeout);
      reject(new DOMException("Aborted", "AbortError"));
    }, { once: true });
  });
}

export function createCloudBaseHunyuanProvider({
  envId = process.env.CLOUDBASE_ENV_ID || process.env.CBR_ENV_ID,
  accessKey = process.env.CLOUDBASE_APIKEY || process.env.CLOUDBASE_API_KEY,
  providerGroup = process.env.PAPERLENS_HUNYUAN_PROVIDER || "hunyuan-v3",
  translationModel = process.env.PAPERLENS_HUNYUAN_TRANSLATION_MODEL || "hy3",
  chatModel = process.env.PAPERLENS_HUNYUAN_CHAT_MODEL || "hy3",
  appFactory = (config) => tcb.init(config),
} = {}) {
  const configured = Boolean(envId && accessKey);
  let model;

  function getModel() {
    if (!configured) {
      throw new ProviderError("尚未配置 CloudBase 环境和 API Key", {
        code: "provider_not_configured",
        status: 503,
        provider: "cloudbase-hunyuan",
      });
    }
    if (!model) {
      const app = appFactory({ env: envId, accessKey, timeout: 180_000 });
      model = app.ai().createModel(providerGroup);
    }
    return model;
  }

  async function complete(body, signal) {
    let lastError;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        return await getModel().generateText({ ...body, abortSignal: signal });
      } catch (error) {
        const normalized = normalizeProviderError(error, "cloudbase-hunyuan");
        lastError = normalized;
        if (!normalized.retryable || attempt === 1 || signal?.aborted) throw normalized;
        await delay(400 * (attempt + 1), signal);
      }
    }
    throw lastError;
  }

  async function invoke(payload, { prompt, signal, model: requestedModel } = {}) {
    if (Array.isArray(payload.images) && payload.images.length) {
      throw new ProviderError("CloudBase Hy3 暂不支持 PaperLens 视觉页输入", {
        code: "capability_unavailable",
        status: 422,
        provider: "cloudbase-hunyuan",
      });
    }
    const selectedModel = requestedModel || (payload.mode === "translate" || payload.mode === "terms" ? translationModel : chatModel);
    const result = await complete({
      model: selectedModel,
      messages: [
        { role: "system", content: "你是 PaperLens 的中文学术阅读助手。严格遵守用户要求；需要 JSON 时只输出可解析 JSON，不要添加代码围栏。" },
        { role: "user", content: prompt },
      ],
    }, signal);
    const answer = result.text?.trim();
    if (!answer) {
      throw new ProviderError("CloudBase Hy3 没有返回文本内容", {
        code: "empty_response",
        status: 502,
        retryable: true,
        provider: "cloudbase-hunyuan",
      });
    }
    return {
      answer,
      provider: "cloudbase-hunyuan",
      model: selectedModel,
      usage: normalizeUsage(result.usage),
      repositoryDecision: "not-applicable",
    };
  }

  async function testConnection({ signal } = {}) {
    const result = await complete({
      model: chatModel,
      messages: [{ role: "user", content: "只回复 OK" }],
    }, signal);
    return { ok: Boolean(result.text?.trim()), model: chatModel };
  }

  return {
    id: "cloudbase-hunyuan",
    label: "腾讯混元 · CloudBase",
    configured,
    capabilities: { text: true, images: false, structuredOutput: true, repositoryVerification: false },
    models: { translation: translationModel, chat: chatModel },
    allowedModels: CLOUDBASE_HUNYUAN_MODELS,
    invoke,
    testConnection,
  };
}
