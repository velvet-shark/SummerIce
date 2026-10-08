import { describe, expect, it } from "vitest";
import { getProviderConfig } from "../constants.js";

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
  });

  it("sends output_config effort to Anthropic models", () => {
    const body = build("anthropic", "claude-haiku-5-5");

    expect(body.output_config).toEqual({ effort: "low" });
    expect(body).not.toHaveProperty("temperature");
  });

  it("sets a thinking level only for Gemini models that configure one", () => {
    expect(
      build("gemini", "gemini-3.8-flash").generationConfig.thinkingConfig,
    ).toEqual({ thinkingLevel: "low" });
    expect(
      build("gemini", "gemini-3.1-flash-lite").generationConfig,
    ).not.toHaveProperty("thinkingConfig");
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
