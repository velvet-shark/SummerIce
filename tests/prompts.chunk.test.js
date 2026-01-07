import { describe, expect, it } from "vitest";
import { buildChunkPrompt, buildSynthesisPrompt } from "../modules/prompts.js";

describe("prompt chunk helpers", () => {
  it("builds chunk prompts with section metadata", () => {
    const prompt = buildChunkPrompt("Chunk text", 2, 4, 120, "bullets", {
      sourceType: "video",
      title: "Sample Video",
    });

    expect(prompt).toContain("section 2 of 4");
    expect(prompt).toContain("video transcript");
    expect(prompt).toContain("Title: Sample Video");
    expect(prompt).toContain("Chunk text");
  });

  it("builds synthesis prompts with format instructions", () => {
    const prompt = buildSynthesisPrompt(
      "Summary one\n\nSummary two",
      "BRIEF",
      "paragraph",
      { sourceType: "article" },
    );

    expect(prompt).toContain("Section summaries");
    expect(prompt).toContain("well-structured paragraphs");
    expect(prompt).toContain("Summary one");
  });
});
