import { describe, expect, it } from "vitest";
import {
  getProviderApiKeyLink,
  getProviderUiData,
} from "../modules/provider-ui.js";

describe("provider UI helpers", () => {
  it("returns provider config and placeholder for known providers", () => {
    const { providerConfig, apiKeyPlaceholder } = getProviderUiData("openai");

    expect(providerConfig).toBeTruthy();
    expect(apiKeyPlaceholder).toBe(`${providerConfig.keyPrefix}...`);
  });

  it("exposes API key links when available", () => {
    const link = getProviderApiKeyLink("openai");

    expect(link).toBeTruthy();
    expect(link.text).toContain("OpenAI");
    expect(link.url).toContain("openai.com");
  });

  it("handles unknown providers safely", () => {
    const { providerConfig, description, links, apiKeyPlaceholder } =
      getProviderUiData("unknown-provider");

    expect(providerConfig).toBeUndefined();
    expect(description).toBe("");
    expect(links).toEqual([]);
    expect(apiKeyPlaceholder).toBe("");
  });
});
