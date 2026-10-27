import { describe, expect, it } from "vitest";
import { getProviderConfig, validateProviderApiKey } from "../constants.js";

const build = (providerId, model) => {
  const providerConfig = getProviderConfig(providerId);
  return providerConfig.buildRequest({
    prompt: "Summarize this.",
    model,
    maxTokens: 1024,
    providerConfig,
  });
};

describe("provider request builders", () => {
  it("sends reasoning effort and no temperature to OpenAI reasoning models", () => {
    const body = build("openai", "gpt-6-luna");

    expect(body.reasoning_effort).toBe("none");
    expect(body).not.toHaveProperty("temperature");
    expect(build("openai", "gpt-6.1-sol").reasoning_effort).toBe("low");
  });

  it("sends output_config effort to Anthropic models", () => {
    const body = build("anthropic", "claude-haiku-5-5");

    expect(body.output_config).toEqual({ effort: "low" });
    expect(body).not.toHaveProperty("temperature");
  });

  it("sets a thinking level only for Gemini models that configure one", () => {
    const providerConfig = getProviderConfig("gemini");
    const withThinking = {
      ...providerConfig,
      models: {
        ...providerConfig.models,
        "gemini-thinking-test": { maxTokens: 8192, reasoningEffort: "low" },
      },
    };

    expect(
      providerConfig.buildRequest({
        prompt: "Summarize this.",
        model: "gemini-thinking-test",
        maxTokens: 1024,
        providerConfig: withThinking,
      }).generationConfig.thinkingConfig,
    ).toEqual({ thinkingLevel: "low" });
    expect(
      build("gemini", "gemini-3.5-flash-lite").generationConfig,
    ).not.toHaveProperty("thinkingConfig");
  });
});

describe("gemini api keys", () => {
  it("accepts auth keys and older standard keys", () => {
    expect(validateProviderApiKey("gemini", "AQ.Ab8test-key").ok).toBe(true);
    expect(validateProviderApiKey("gemini", "AIzaSyTestKey").ok).toBe(true);
    expect(validateProviderApiKey("gemini", "sk-not-a-gemini-key").ok).toBe(
      false,
    );
  });

  it("sends the key in a header, not in the URL", () => {
    const providerConfig = getProviderConfig("gemini");
    const apiKey = "AQ.Ab8test-key";

    expect(providerConfig.getHeaders({ apiKey })).toEqual({
      "x-goog-api-key": apiKey,
    });
    expect(
      providerConfig.getApiUrl({
        providerConfig,
        model: "gemini-3.5-flash-lite",
        apiKey,
      }),
    ).not.toContain(apiKey);
  });
});

describe("anthropic response parsing", () => {
  const { parseResponse } = getProviderConfig("anthropic");

  it("skips thinking blocks and returns the text block", () => {
    const data = {
      content: [
        { type: "thinking", thinking: "", signature: "sig" },
        { type: "text", text: "Summary result" },
      ],
    };

    expect(parseResponse(data)).toBe("Summary result");
  });

  it("returns null when no text block is present", () => {
    const data = {
      content: [{ type: "thinking", thinking: "", signature: "sig" }],
    };

    expect(parseResponse(data)).toBeNull();
  });
});
