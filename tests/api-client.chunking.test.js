import { describe, expect, it } from "vitest";
import APIClient from "../api-client.js";
describe("APIClient chunking", () => {
  it("splits content into multiple chunks within size limits", () => {
    const client = new APIClient();
    const sentence = "This is a sentence about summarization.";
    const content = Array.from({ length: 200 })
      .map(() => sentence)
      .join(" ");
    const chunks = client.splitContentIntoChunks(content, 400, 40);

    expect(chunks.length).toBeGreaterThan(1);
    const leadingChunks = chunks.slice(0, -1);
    expect(leadingChunks.every((chunk) => chunk.length <= 400)).toBe(true);
  });

  it("summarizes with chunking and synthesis when content is long", async () => {
    const client = new APIClient();
    const content = Array.from({ length: 600 })
      .map((_, index) => `Sentence ${index}.`)
      .join(" ");

    const providerConfig = {
      models: {
        "test-model": { maxTokens: 2048 },
      },
    };

    const settings = {
      model: "test-model",
      summaryLength: "STANDARD",
      summaryFormat: "paragraph",
    };

    const calls = [];
    client.requestSummary = async (
      prompt,
      callSettings,
      callProvider,
      maxTokens,
    ) => {
      calls.push({ prompt, maxTokens });
      return `summary-${calls.length}`;
    };

    const result = await client.summarizeWithChunking(
      content,
      settings,
      providerConfig,
    );

    expect(calls.length).toBeGreaterThan(1);
    expect(calls[calls.length - 1].prompt).toContain("Section summaries");
    expect(result).toBe(`summary-${calls.length}`);
  });

  it("flags content exceeding model budget", () => {
    const client = new APIClient();
    const maxTokens = 2000;
    const maxChars = client.estimateMaxContentChars(maxTokens);
    const content = "x".repeat(maxChars + 10);

    expect(client.shouldChunkContent(content, maxTokens)).toBe(true);
  });
});
