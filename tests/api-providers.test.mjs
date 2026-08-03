import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";

import { createCloudBaseHunyuanProvider } from "../bridge/providers/cloudbase-hunyuan.mjs";
import { createMiMoProvider } from "../bridge/providers/mimo.mjs";
import { createOpenAIProvider } from "../bridge/providers/openai.mjs";

async function readBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

async function withMockServer(handler, run) {
  const server = createServer(handler);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  try {
    await run(`http://127.0.0.1:${address.port}/v1`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test("OpenAI adapter sends Responses API image input, strict schema, retries once, and normalizes usage", async () => {
  let attempts = 0;
  let received;
  await withMockServer(async (request, response) => {
    if (request.url === "/v1/responses") {
      attempts += 1;
      received = await readBody(request);
      if (attempts === 1) {
        response.writeHead(429, { "content-type": "application/json" });
        response.end(JSON.stringify({ error: { message: "rate limited", type: "rate_limit_error", code: "rate_limit" } }));
        return;
      }
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({
        id: "resp_mock",
        object: "response",
        created_at: 1,
        status: "completed",
        model: "gpt-5.6-terra",
        output: [{ id: "msg_mock", type: "message", status: "completed", role: "assistant", content: [{ type: "output_text", text: "{\"segments\":[{\"id\":\"s1\",\"translation\":\"译文\",\"formulaExplanation\":\"解释\"}]}", annotations: [] }] }],
        usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15, input_tokens_details: { cached_tokens: 3 }, output_tokens_details: { reasoning_tokens: 2 } },
      }));
      return;
    }
    response.writeHead(404).end();
  }, async (baseURL) => {
    const provider = createOpenAIProvider({ apiKey: "test-key", baseURL });
    const result = await provider.invoke({ mode: "translate", images: [{ dataUrl: "data:image/png;base64,aGVsbG8=" }] }, { prompt: "translate", model: "gpt-5.6-terra", effort: "low" });
    assert.equal(attempts, 2);
    assert.equal(result.answer.startsWith("{\"segments\""), true);
    assert.deepEqual(result.usage, { inputTokens: 10, outputTokens: 5, totalTokens: 15, cachedTokens: 3, reasoningTokens: 2 });
    assert.equal(received.input[0].content[1].type, "input_image");
    assert.equal(received.text.format.type, "json_schema");
    assert.equal(received.text.format.strict, true);
  });
});

test("MiMo adapter uses Chat Completions JSON mode and base64 image content", async () => {
  let received;
  await withMockServer(async (request, response) => {
    if (request.url === "/v1/chat/completions") {
      received = await readBody(request);
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({
        id: "chat_mock",
        object: "chat.completion",
        created: 1,
        model: "mimo-v2.5",
        choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content: "{\"segments\":[{\"id\":\"s1\",\"translation\":\"译文\",\"formulaExplanation\":\"解释\"}]}", reasoning_content: "" } }],
        usage: { prompt_tokens: 12, completion_tokens: 6, total_tokens: 18, prompt_tokens_details: { cached_tokens: 2 }, completion_tokens_details: { reasoning_tokens: 1 } },
      }));
      return;
    }
    response.writeHead(404).end();
  }, async (baseURL) => {
    const provider = createMiMoProvider({ apiKey: "test-key", baseURL });
    const result = await provider.invoke({ mode: "translate", images: [{ dataUrl: "data:image/jpeg;base64,aGVsbG8=" }] }, { prompt: "translate", model: "mimo-v2.5" });
    assert.equal(result.model, "mimo-v2.5");
    assert.deepEqual(result.usage, { inputTokens: 12, outputTokens: 6, totalTokens: 18, cachedTokens: 2, reasoningTokens: 1 });
    assert.equal(received.response_format.type, "json_object");
    assert.equal(received.messages[1].content[0].type, "image_url");
    assert.match(received.messages[1].content[0].image_url.url, /^data:image\/jpeg;base64,/);
  });
});

test("CloudBase Hy3 adapter uses the server SDK, normalizes usage, and rejects visual pages", async () => {
  let initConfig;
  let received;
  const provider = createCloudBaseHunyuanProvider({
    envId: "env-test",
    accessKey: "test-key",
    appFactory: (config) => {
      initConfig = config;
      return {
        ai: () => ({
          createModel: (group) => {
            assert.equal(group, "hunyuan-v3");
            return {
              generateText: async (body) => {
                received = body;
                return {
                  text: '{"segments":[{"id":"s1","translation":"译文","formulaExplanation":""}]}',
                  usage: { prompt_tokens: 20, completion_tokens: 8, total_tokens: 28 },
                };
              },
            };
          },
        }),
      };
    },
  });
  const result = await provider.invoke({ mode: "translate", images: [] }, { prompt: "translate", model: "hy3" });
  assert.deepEqual(initConfig, { env: "env-test", accessKey: "test-key", timeout: 180_000 });
  assert.equal(received.model, "hy3");
  assert.equal(received.messages[1].content, "translate");
  assert.equal(result.provider, "cloudbase-hunyuan");
  assert.deepEqual(result.usage, { inputTokens: 20, outputTokens: 8, totalTokens: 28, cachedTokens: 0, reasoningTokens: 0 });
  await assert.rejects(
    provider.invoke({ mode: "translate", images: [{ dataUrl: "data:image/png;base64,aGVsbG8=" }] }, { prompt: "translate", model: "hy3" }),
    (error) => error.code === "capability_unavailable",
  );
});

test("term extraction uses structured JSON output on both API providers", async () => {
  let openAIRequest;
  await withMockServer(async (request, response) => {
    openAIRequest = await readBody(request);
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({
      id: "resp_terms",
      object: "response",
      created_at: 1,
      status: "completed",
      model: "gpt-5.6-terra",
      output: [{ id: "msg_terms", type: "message", status: "completed", role: "assistant", content: [{ type: "output_text", text: "{\"terms\":[{\"term\":\"flow matching\",\"translation\":\"流匹配\"}]}", annotations: [] }] }],
    }));
  }, async (baseURL) => {
    const provider = createOpenAIProvider({ apiKey: "test-key", baseURL });
    await provider.invoke({ mode: "terms" }, { prompt: "terms", model: "gpt-5.6-terra", effort: "low" });
  });
  assert.equal(openAIRequest.text.format.name, "paperlens_terms");
  assert.deepEqual(openAIRequest.text.format.schema.required, ["terms"]);

  let mimoRequest;
  await withMockServer(async (request, response) => {
    mimoRequest = await readBody(request);
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({
      id: "chat_terms",
      object: "chat.completion",
      created: 1,
      model: "mimo-v2.5",
      choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content: "{\"terms\":[]}" } }],
    }));
  }, async (baseURL) => {
    const provider = createMiMoProvider({ apiKey: "test-key", baseURL });
    await provider.invoke({ mode: "terms" }, { prompt: "terms", model: "mimo-v2.5" });
  });
  assert.equal(mimoRequest.response_format.type, "json_object");
});
