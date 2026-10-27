import { describe, expect, it } from "vitest";
import { getSummaryPrompt } from "../modules/prompts.js";

describe("summary prompt", () => {
  it("includes bullet instruction when requested", () => {
    const prompt = getSummaryPrompt("Some content", "STANDARD", "bullets");
    expect(prompt).toContain("bullet points");
  });

  it("includes paragraph instruction by default", () => {
    const prompt = getSummaryPrompt("Some content", "STANDARD", "paragraph");
    expect(prompt).toContain("well-structured paragraphs");
  });

  it("asks for plain text in both formats", () => {
    for (const format of ["bullets", "paragraph"]) {
      const prompt = getSummaryPrompt("Some content", "STANDARD", format);
      expect(prompt).toContain("no Markdown formatting");
    }
  });

  it("uses transcript wording for video sources", () => {
    const prompt = getSummaryPrompt(
      "Transcript content",
      "STANDARD",
      "paragraph",
      {
        sourceType: "video",
        title: "Example Video",
      },
    );
    expect(prompt).toContain("video transcript");
    expect(prompt).toContain("Transcript:");
    expect(prompt).toContain("Title: Example Video");
  });
});
