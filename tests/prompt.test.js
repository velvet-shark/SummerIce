import { describe, expect, it } from "vitest";
import { getSummaryPrompt } from "../constants.js";

describe("summary prompt", () => {
  it("includes bullet instruction when requested", () => {
    const prompt = getSummaryPrompt("Some content", "STANDARD", "bullets");
    expect(prompt).toContain("bullet points");
  });

  it("includes paragraph instruction by default", () => {
    const prompt = getSummaryPrompt("Some content", "STANDARD", "paragraph");
    expect(prompt).toContain("well-structured paragraphs");
  });
});
