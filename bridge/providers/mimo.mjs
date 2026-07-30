import OpenAI from "openai";
import { ProviderError, normalizeProviderError } from "../provider-errors.mjs";

export const MIMO_MODELS = ["mimo-v2.5", "mimo-v2.5-pro"];

function normalizeImages(images) {
  if (!Array.isArray(images)) return [];
  let totalBytes = 0;
  return images.slice(0, 4).map((image, index) => {
    const dataUrl = typeof image?.dataUrl === "string" ? image.dataUrl.trim() : "";
    const match = dataUrl.match(/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=\r\n]+)$/);
    if (!match) throw new ProviderError(`第 ${index + 1} 张图片格式不受支持`, { code: "invalid_image", status: 400, provider: "mimo" });
    const bytes = Buffer.byteLength(match[2], "base64");
    if (!bytes || bytes > 10 * 1024 * 1024) throw new ProviderError(`第 ${index + 1} 张图片超过 10 MB`, { code: "image_too_large", status: 400, provider: "mimo" });
    totalBytes += bytes;
    if (totalBytes > 24 * 1024 * 1024) throw new ProviderError("图片总大小不能超过 24 MB", { code: "images_too_large", status: 400, provider: "mimo" });
    return dataUrl;
  });
}

function normalizeUsage(usage) {
  if (!usage) return undefined;
  return {
    inputTokens: usage.prompt_tokens || 0,
    outputTokens: usage.completion_tokens || 0,
    totalTokens: usage.total_tokens || 0,
    cachedTokens: usage.prompt_tokens_details?.cached_tokens || 0,
    reasoningTokens: usage.completion_tokens_details?.reasoning_tokens || 0,
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

export function createMiMoProvider({
  apiKey = process.env.MIMO_API_KEY,
  baseURL = process.env.MIMO_BASE_URL || "https://api.xiaomimimo.com/v1",
  translationModel = process.env.PAPERLENS_MIMO_TRANSLATION_MODEL || "mimo-v2.5",
  chatModel = process.env.PAPERLENS_MIMO_CHAT_MODEL || "mimo-v2.5",
  clientFactory = (options) => new OpenAI(options),
} = {}) {
  const configured = Boolean(apiKey);
  let client;

  function getClient() {
    if (!configured) throw new ProviderError("尚未配置 MIMO_API_KEY", { code: "provider_not_configured", status: 503, provider: "mimo" });
    client ||= clientFactory({ apiKey, baseURL });
    return client;
  }

  async function complete(body, signal) {
    let lastError;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        return await getClient().chat.completions.create(body, { signal, timeout: 180_000 });
      } catch (error) {
        const normalized = normalizeProviderError(error, "mimo");
        lastError = normalized;
        if (!normalized.retryable || attempt === 1 || signal?.aborted) throw normalized;
        await delay(400 * (attempt + 1), signal);
      }
    }
    throw lastError;
  }

  async function invoke(payload, { prompt, signal, model } = {}) {
    const selectedModel = model || (payload.mode === "translate" || payload.mode === "terms" ? translationModel : chatModel);
    const content = [{ type: "text", text: prompt }];
    for (const imageUrl of normalizeImages(payload.images)) content.unshift({ type: "image_url", image_url: { url: imageUrl } });
    const completion = await complete({
      model: selectedModel,
      messages: [
        { role: "system", content: `你是 MiMo（中文名称也是 MiMo），是小米公司研发的 AI 智能助手。今天的日期：${new Date().toISOString().slice(0, 10)}。你的知识截止日期是 2024 年 12 月。` },
        { role: "user", content },
      ],
      max_completion_tokens: payload.mode === "translate" ? 16_384 : 8_192,
      temperature: 1,
      top_p: 0.95,
      ...(payload.mode === "translate" || payload.mode === "terms" ? { response_format: { type: "json_object" } } : {}),
    }, signal);
    const answer = completion.choices?.[0]?.message?.content?.trim();
    if (!answer) throw new ProviderError("MiMo API 没有返回文本内容", { code: "empty_response", status: 502, retryable: true, provider: "mimo" });
    return {
      answer,
      provider: "mimo",
      model: completion.model || selectedModel,
      usage: normalizeUsage(completion.usage),
      repositoryDecision: "not-applicable",
    };
  }

  async function testConnection({ signal } = {}) {
    const completion = await complete({
      model: chatModel,
      messages: [{ role: "user", content: "只回复 OK" }],
      max_completion_tokens: 256,
      temperature: 0,
    }, signal);
    return { ok: Boolean(completion.choices?.[0]?.message?.content), model: completion.model || chatModel };
  }

  return {
    id: "mimo",
    label: "Xiaomi MiMo API",
    configured,
    capabilities: { text: true, images: true, structuredOutput: true, repositoryVerification: false },
    models: { translation: translationModel, chat: chatModel },
    allowedModels: MIMO_MODELS,
    invoke,
    testConnection,
  };
}
