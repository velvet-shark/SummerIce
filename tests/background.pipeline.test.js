import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CONFIG } from "../constants.js";

let messageListener;
let sendMessageCalls;
let extractionResponse;
let cacheGetResult;
let cacheSetCalls;
let apiCallArgs;
let apiCallResult;
let settingsResult;
let youtubeVideoId;
let youtubeContentResult;

vi.mock("../api-client.js", () => ({
  default: class APIClient {
    async getSettings() {
      return settingsResult;
    }

    async callAPI(content, promptContext) {
      apiCallArgs.push([content, promptContext]);
      return apiCallResult;
    }

    cancelRequest() {}
  },
}));

vi.mock("../cache.js", () => ({
  default: class SummaryCache {
    constructor() {
      this.get = vi.fn(async () => cacheGetResult);
      this.set = vi.fn(async (...args) => {
        cacheSetCalls.push(args);
      });
      this.cleanup = vi.fn();
    }
  },
}));

vi.mock("../modules/youtube-transcript.js", () => ({
  extractYouTubeVideoId: vi.fn(() => youtubeVideoId),
  resolveYouTubeContent: vi.fn(async () => youtubeContentResult),
}));

const setupChromeMock = () => {
  const store = {};

  global.chrome = {
    storage: {
      local: {
        get: (keys, cb) => {
          if (Array.isArray(keys)) {
            const result = {};
            keys.forEach((key) => {
              if (Object.prototype.hasOwnProperty.call(store, key)) {
                result[key] = store[key];
              }
            });
            cb(result);
            return;
          }
          cb({ ...store });
        },
        set: (values, cb) => {
          Object.assign(store, values);
          if (cb) cb();
        },
      },
    },
    runtime: {
      onMessage: {
        addListener: vi.fn((listener) => {
          messageListener = listener;
        }),
      },
      onInstalled: {
        addListener: vi.fn(),
      },
      onSuspend: {
        addListener: vi.fn(),
      },
      sendMessage: vi.fn((message, cb) => {
        if (message.type === "extractContent") {
          if (cb) cb(extractionResponse);
          return;
        }
        sendMessageCalls.push(message);
        if (cb) cb();
      }),
    },
    offscreen: {
      createDocument: vi.fn(async () => {}),
      closeDocument: vi.fn(async () => {}),
    },
    commands: {
      onCommand: {
        addListener: vi.fn(),
      },
    },
    tabs: {
      create: vi.fn(),
      query: vi.fn(),
      sendMessage: vi.fn(),
    },
  };
};

const flushPipeline = async () => {
  await Promise.resolve();
  await vi.runAllTimersAsync();
};

describe("background summarize pipeline", () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.useFakeTimers();
    messageListener = null;
    sendMessageCalls = [];
    extractionResponse = null;
    cacheGetResult = null;
    cacheSetCalls = [];
    apiCallArgs = [];
    apiCallResult = "Summary result";
    settingsResult = {
      provider: "openai",
      model: "gpt-5-mini",
      apiKey: "sk-test",
      summaryLength: "STANDARD",
      summaryFormat: "paragraph",
      youtubeTranscriptMode: "auto",
    };
    youtubeVideoId = null;
    youtubeContentResult = null;

    setupChromeMock();
    await import("../background.js");
  });

  afterEach(() => {
    vi.useRealTimers();
    delete global.chrome;
  });

  it("summarizes extracted article content and caches it", async () => {
    extractionResponse = {
      success: true,
      content: "Article content",
      title: "Extracted title",
    };

    messageListener(
      {
        type: "extractedHTML",
        htmlContent: "<html></html>",
        url: "https://example.com",
        title: "Original title",
      },
      null,
      () => {},
    );

    await flushPipeline();

    expect(apiCallArgs).toHaveLength(1);
    expect(apiCallArgs[0][0]).toBe("Article content");
    expect(cacheSetCalls).toHaveLength(1);
    expect(sendMessageCalls[0]).toMatchObject({
      type: "summarizationResult",
      summary: "Summary result",
      title: "Extracted title",
      fromCache: false,
    });
  });

  it("uses cached summary without extracting", async () => {
    cacheGetResult = { summary: "Cached summary" };

    messageListener(
      {
        type: "extractedHTML",
        htmlContent: "<html></html>",
        url: "https://example.com",
        title: "Original title",
      },
      null,
      () => {},
    );

    await flushPipeline();

    expect(apiCallArgs).toHaveLength(0);
    expect(sendMessageCalls[0]).toMatchObject({
      type: "summarizationResult",
      summary: "Cached summary",
      fromCache: true,
    });

    const extractionCalls = chrome.runtime.sendMessage.mock.calls.filter(
      ([message]) => message.type === "extractContent",
    );
    expect(extractionCalls).toHaveLength(0);
  });

  it("summarizes YouTube transcripts with video prompt context", async () => {
    youtubeVideoId = "abc123def45";
    youtubeContentResult = { text: "Transcript text", title: "YouTube title" };

    messageListener(
      {
        type: "extractedHTML",
        htmlContent: "<html></html>",
        url: "https://www.youtube.com/watch?v=abc123def45",
        title: "Original title",
      },
      null,
      () => {},
    );

    await flushPipeline();

    expect(apiCallArgs).toHaveLength(1);
    expect(apiCallArgs[0][0]).toBe("Transcript text");
    expect(apiCallArgs[0][1]).toEqual({
      sourceType: "video",
      title: "YouTube title",
    });
    expect(sendMessageCalls[0]).toMatchObject({
      type: "summarizationResult",
      summary: "Summary result",
      title: "YouTube title",
      fromCache: false,
    });
  });

  it("reports transcript errors without calling the API", async () => {
    youtubeVideoId = "abc123def45";
    youtubeContentResult = { text: null };

    messageListener(
      {
        type: "extractedHTML",
        htmlContent: "<html></html>",
        url: "https://www.youtube.com/watch?v=abc123def45",
        title: "Original title",
      },
      null,
      () => {},
    );

    await flushPipeline();

    expect(apiCallArgs).toHaveLength(0);
    expect(sendMessageCalls[0]).toMatchObject({
      type: "summarizationError",
      error: CONFIG.ERRORS.YOUTUBE_TRANSCRIPT_UNAVAILABLE,
    });
  });
});
