import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  extractYouTubeVideoId,
  resolveYouTubeContent,
} from "../modules/youtube-transcript.js";

const fixtureHtml = readFileSync(
  path.join(process.cwd(), "tests/fixtures/youtube-description.html"),
  "utf8",
);

describe("youtube transcript helpers", () => {
  it("extracts video ids from common YouTube URLs", () => {
    expect(
      extractYouTubeVideoId("https://www.youtube.com/watch?v=abc123def45"),
    ).toBe("abc123def45");
    expect(extractYouTubeVideoId("https://youtu.be/abc123def45")).toBe(
      "abc123def45",
    );
    expect(
      extractYouTubeVideoId("https://www.youtube.com/shorts/abc123def45"),
    ).toBe("abc123def45");
  });

  it("falls back to the page description when no transcript is available", async () => {
    const result = await resolveYouTubeContent({
      url: "https://www.youtube.com/watch?v=abc123def45",
      html: fixtureHtml,
      mode: "auto",
      fetchImpl: async () => {
        throw new Error("network unavailable");
      },
      timeoutMs: 50,
    });

    expect(result).toMatchObject({
      text: "This is the fallback YouTube description used when transcripts are unavailable.",
      source: "description",
      title: "Fixture Video Title",
    });
  });
});
