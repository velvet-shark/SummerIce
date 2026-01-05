import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  fetchYouTubeTranscript,
  getYouTubeVideoId,
  isYouTubeUrl
} from "../modules/youtube.js";

describe("YouTube helpers", () => {
  it("detects YouTube URLs", () => {
    expect(isYouTubeUrl("https://www.youtube.com/watch?v=abc")).toBe(true);
    expect(isYouTubeUrl("https://m.youtube.com/watch?v=abc")).toBe(true);
    expect(isYouTubeUrl("https://youtu.be/abc")).toBe(true);
    expect(isYouTubeUrl("https://vimeo.com/123")).toBe(false);
  });

  it("extracts video IDs from common URL formats", () => {
    expect(getYouTubeVideoId("https://www.youtube.com/watch?v=abc123")).toBe("abc123");
    expect(getYouTubeVideoId("https://youtu.be/xyz789")).toBe("xyz789");
    expect(getYouTubeVideoId("https://www.youtube.com/shorts/shortsId")).toBe("shortsId");
    expect(getYouTubeVideoId("https://www.youtube.com/embed/embedId")).toBe("embedId");
  });
});

describe("fetchYouTubeTranscript", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = vi.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("returns transcript text from caption tracks", async () => {
    const playerResponse = {
      videoDetails: { videoId: "abc123", title: "Test Video" },
      captions: {
        playerCaptionsTracklistRenderer: {
          captionTracks: [
            {
              baseUrl: "https://example.com/captions",
              languageCode: "en",
              kind: "standard"
            }
          ]
        }
      }
    };

    const html = `var ytInitialPlayerResponse = ${JSON.stringify(playerResponse)};`;

    const json3 = {
      events: [{ segs: [{ utf8: "Hello " }, { utf8: "world" }] }]
    };

    global.fetch.mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify(json3)
    });

    const result = await fetchYouTubeTranscript({
      html,
      url: "https://www.youtube.com/watch?v=abc123",
      preferredLanguage: "en"
    });

    expect(result.success).toBe(true);
    expect(result.content).toContain("Hello world");
    expect(result.title).toBe("Test Video");
    expect(result.source).toBe("youtube-manual");
  });
});
