import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CONFIG } from "../constants.js";

let messageListener;
let sendMessageCalls;
let extractionResponsesByTab;
let extractionErrorByTab;
let offscreenExtractionResponse;
let cacheGetResult;
let cacheSetCalls;
let apiCallArgs;
let apiCallImplementation;
let settingsResult;
let youtubeVideoId;
let youtubeContentResult;

vi.mock("../api-client.js", () => ({
  default: class APIClient {
    async getSettings() {
      return settingsResult;
    }

    async callAPI(content, options) {
      apiCallArgs.push([content, options]);
      return apiCallImplementation(content, options);
    }
  },
}));

vi.mock("../cache.js", () => ({
  default: class SummaryCache {
    constructor() {
      this.get = vi.fn(async () =>
        typeof cacheGetResult === "function"
          ? cacheGetResult()
          : cacheGetResult,
      );
      this.set = vi.fn(async (...args) => {
        cacheSetCalls.push(args);
      });
      this.cleanup = vi.fn(async () => {});
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
          const result = {};
          if (Array.isArray(keys)) {
            keys.forEach((key) => {
              if (Object.prototype.hasOwnProperty.call(store, key)) {
                result[key] = store[key];
              }
            });
          }
          cb(result);
        },
        set: (values, cb) => {
          Object.assign(store, values);
          cb?.();
        },
      },
    },
    runtime: {
      lastError: null,
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
          cb?.(offscreenExtractionResponse);
          return;
        }

        sendMessageCalls.push(message);
        cb?.();
      }),
    },
    offscreen: {
      createDocument: vi.fn(async () => {}),
      closeDocument: vi.fn(async () => {}),
    },
    tabs: {
      create: vi.fn(),
      sendMessage: vi.fn((tabId, message, cb) => {
        if (message.type !== "extractContent") {
          cb?.();
          return;
        }

        const errorMessage = extractionErrorByTab[tabId];
        if (errorMessage) {
          global.chrome.runtime.lastError = { message: errorMessage };
          cb?.();
          global.chrome.runtime.lastError = null;
          return;
        }

        cb?.(extractionResponsesByTab[tabId]);
      }),
    },
  };
};

const sendStartSummary = async (requestId, tabId = 1) => {
  const sendResponse = vi.fn();
  messageListener(
    { type: "startSummary", requestId, tabId },
    null,
    sendResponse,
  );
  await Promise.resolve();
  return sendResponse;
};

const flushPipeline = async () => {
  await Promise.resolve();
  await Promise.resolve();
  await vi.runAllTimersAsync();
  await Promise.resolve();
};

describe("background summarize pipeline", () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.useFakeTimers();
    messageListener = null;
    sendMessageCalls = [];
    extractionResponsesByTab = {
      1: {
        success: true,
        htmlContent: "<html></html>",
        url: "https://example.com",
        title: "Original title",
      },
    };
    extractionErrorByTab = {};
    offscreenExtractionResponse = {
      success: true,
      content: "Article content",
      title: "Extracted title",
    };
    cacheGetResult = null;
    cacheSetCalls = [];
    apiCallArgs = [];
    apiCallImplementation = async () => "Summary result";
    settingsResult = {
      provider: "openai",
      model: "gpt-5.4-mini",
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

  it("summarizes extracted article content and caches it per request", async () => {
    await sendStartSummary("request-1");
    await flushPipeline();

    expect(apiCallArgs).toHaveLength(1);
    expect(apiCallArgs[0][0]).toBe("Article content");
    expect(apiCallArgs[0][1]).toMatchObject({
      settings: settingsResult,
      promptContext: {},
    });
    expect(cacheSetCalls).toHaveLength(1);
    expect(sendMessageCalls[0]).toMatchObject({
      type: "summarizationResult",
      requestId: "request-1",
      summary: "Summary result",
      title: "Extracted title",
      fromCache: false,
    });
  });

  it("uses cached summaries without invoking extraction or the API", async () => {
    cacheGetResult = { summary: "Cached summary" };

    await sendStartSummary("request-cache");
    await flushPipeline();

    expect(apiCallArgs).toHaveLength(0);
    expect(cacheSetCalls).toHaveLength(0);

    const offscreenCalls = chrome.runtime.sendMessage.mock.calls.filter(
      ([message]) => message.type === "extractContent",
    );
    expect(offscreenCalls).toHaveLength(0);
    expect(sendMessageCalls[0]).toMatchObject({
      type: "summarizationResult",
      requestId: "request-cache",
      summary: "Cached summary",
      fromCache: true,
    });
  });

  it("summarizes YouTube transcripts with video prompt context", async () => {
    extractionResponsesByTab[1] = {
      success: true,
      htmlContent: "<html></html>",
      url: "https://www.youtube.com/watch?v=abc123def45",
      title: "Original title",
    };
    youtubeVideoId = "abc123def45";
    youtubeContentResult = { text: "Transcript text", title: "YouTube title" };

    await sendStartSummary("request-video");
    await flushPipeline();

    expect(apiCallArgs).toHaveLength(1);
    expect(apiCallArgs[0][0]).toBe("Transcript text");
    expect(apiCallArgs[0][1]).toMatchObject({
      promptContext: {
        sourceType: "video",
        title: "YouTube title",
      },
    });
    expect(sendMessageCalls[0]).toMatchObject({
      type: "summarizationResult",
      requestId: "request-video",
      summary: "Summary result",
      title: "YouTube title",
      fromCache: false,
    });
  });

  it("reports transcript errors without calling the API", async () => {
    extractionResponsesByTab[1] = {
      success: true,
      htmlContent: "<html></html>",
      url: "https://www.youtube.com/watch?v=abc123def45",
      title: "Original title",
    };
    youtubeVideoId = "abc123def45";
    youtubeContentResult = { text: null };

    await sendStartSummary("request-video-error");
    await flushPipeline();

    expect(apiCallArgs).toHaveLength(0);
    expect(sendMessageCalls[0]).toMatchObject({
      type: "summarizationError",
      requestId: "request-video-error",
      error: CONFIG.ERRORS.YOUTUBE_TRANSCRIPT_UNAVAILABLE,
    });
  });

  it("cancels in-flight requests when a new request starts for the same tab", async () => {
    extractionResponsesByTab[1] = {
      success: true,
      htmlContent: "<html></html>",
      url: "https://example.com/a",
      title: "Article A",
    };
    offscreenExtractionResponse = {
      success: true,
      content: "Article A content",
      title: "Article A",
    };

    apiCallImplementation = (content, { signal }) =>
      new Promise((resolve, reject) => {
        if (content === "Article A content") {
          signal.addEventListener(
            "abort",
            () => reject(new Error(CONFIG.ERRORS.REQUEST_CANCELLED)),
            { once: true },
          );
          return;
        }

        resolve("Summary B");
      });

    await sendStartSummary("request-a");
    await Promise.resolve();

    extractionResponsesByTab[1] = {
      success: true,
      htmlContent: "<html></html>",
      url: "https://example.com/b",
      title: "Article B",
    };
    offscreenExtractionResponse = {
      success: true,
      content: "Article B content",
      title: "Article B",
    };

    await sendStartSummary("request-b");
    await flushPipeline();

    expect(sendMessageCalls).toContainEqual(
      expect.objectContaining({
        type: "summarizationResult",
        requestId: "request-b",
        summary: "Summary B",
      }),
    );
    expect(sendMessageCalls).not.toContainEqual(
      expect.objectContaining({
        requestId: "request-a",
      }),
    );
  });
});
