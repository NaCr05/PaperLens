import OpenAI from "openai";
import { ProviderError, normalizeProviderError } from "../provider-errors.mjs";

export const OPENAI_MODELS = ["gpt-5.6-terra", "gpt-5.6-luna", "gpt-5.6-sol"];
export const OPENAI_REASONING_EFFORTS = ["none", "low", "medium", "high"];

const TRANSLATION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    segments: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: { type: "string" },
          translation: { type: "string" },
          formulaExplanation: { type: "string" },
        },
        required: ["id", "translation", "formulaExplanation"],
      },
    },
  },
  required: ["segments"],
};

function normalizeImages(images) {
  if (!Array.isArray(images)) return [];
  let totalBytes = 0;
  return images.slice(0, 4).map((image, index) => {
    const dataUrl = typeof image?.dataUrl === "string" ? image.dataUrl.trim() : "";
    const match = dataUrl.match(/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=\r\n]+)$/);
    if (!match) throw new ProviderError(`第 ${index + 1} 张图片格式不受支持`, { code: "invalid_image", status: 400, provider: "openai" });
    const bytes = Buffer.byteLength(match[2], "base64");
    if (!bytes || bytes > 10 * 1024 * 1024) throw new ProviderError(`第 ${index + 1} 张图片超过 10 MB`, { code: "image_too_large", status: 400, provider: "openai" });
    totalBytes += bytes;
    if (totalBytes > 24 * 1024 * 1024) throw new ProviderError("图片总大小不能超过 24 MB", { code: "images_too_large", status: 400, provider: "openai" });
    return dataUrl;
  });
}

function delay(milliseconds, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const timeout = setTimeout(resolve, milliseconds);
    signal?.addEventListener("abort", () => {
      clearTimeout(timeout);
      reject(new DOMException("Aborted", "AbortError"));
    }, { once: true });
  });
}

function normalizeUsage(usage) {
  if (!usage) return undefined;
  return {
    inputTokens: usage.input_tokens || 0,
    outputTokens: usage.output_tokens || 0,
    totalTokens: usage.total_tokens || 0,
    cachedTokens: usage.input_tokens_details?.cached_tokens || 0,
    reasoningTokens: usage.output_tokens_details?.reasoning_tokens || 0,
  };
}

export function createOpenAIProvider({
  apiKey = process.env.OPENAI_API_KEY,
  baseURL = process.env.PAPERLENS_OPENAI_BASE_URL,
  translationModel = process.env.PAPERLENS_OPENAI_TRANSLATION_MODEL || "gpt-5.6-terra",
  chatModel = process.env.PAPERLENS_OPENAI_CHAT_MODEL || "gpt-5.6-terra",
  reasoningEffort = process.env.PAPERLENS_OPENAI_REASONING_EFFORT || "low",
  clientFactory = (options) => new OpenAI(options),
} = {}) {
  const configured = Boolean(apiKey);
  let client;

  function getClient() {
    if (!configured) {
      throw new ProviderError("尚未配置 OPENAI_API_KEY", { code: "provider_not_configured", status: 503, provider: "openai" });
    }
    client ||= clientFactory({ apiKey, ...(baseURL ? { baseURL } : {}) });
    return client;
  }

  async function invoke(payload, { prompt, signal, model, effort } = {}) {
    const selectedModel = model || (payload.mode === "translate" ? translationModel : chatModel);
    const selectedEffort = OPENAI_REASONING_EFFORTS.includes(effort) ? effort : reasoningEffort;
    const content = [{ type: "input_text", text: prompt }];
    for (const imageUrl of normalizeImages(payload.images)) {
      content.push({ type: "input_image", image_url: imageUrl, detail: "high" });
    }
    const body = {
      model: selectedModel,
      input: [{ role: "user", content }],
      reasoning: { effort: selectedEffort },
      ...(payload.mode === "translate" ? {
        text: { format: { type: "json_schema", name: "paperlens_translation", strict: true, schema: TRANSLATION_SCHEMA } },
      } : {}),
    };

    let lastError;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const response = await getClient().responses.create(body, { signal, timeout: 180_000 });
        const answer = response.output_text?.trim();
        if (!answer) throw new ProviderError("OpenAI API 没有返回文本内容", { code: "empty_response", status: 502, retryable: true, provider: "openai" });
        return {
          answer,
          provider: "openai",
          model: response.model || selectedModel,
          usage: normalizeUsage(response.usage),
          repositoryDecision: "not-applicable",
        };
      } catch (error) {
        const normalized = normalizeProviderError(error, "openai");
        lastError = normalized;
        if (!normalized.retryable || attempt === 1 || signal?.aborted) throw normalized;
        await delay(400 * (attempt + 1), signal);
      }
    }
    throw lastError;
  }

  async function testConnection({ signal } = {}) {
    try {
      const models = await getClient().models.list({ limit: 1 }, { signal, timeout: 20_000 });
      return { ok: true, modelCount: Array.isArray(models.data) ? models.data.length : undefined };
    } catch (error) {
      throw normalizeProviderError(error, "openai");
    }
  }

  return {
    id: "openai",
    label: "OpenAI API",
    configured,
    capabilities: { text: true, images: true, structuredOutput: true, repositoryVerification: false },
    models: { translation: translationModel, chat: chatModel },
    allowedModels: OPENAI_MODELS,
    reasoningEffort,
    invoke,
    testConnection,
  };
}

