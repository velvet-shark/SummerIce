import { CONFIG } from "./constants.js";
import APIClient from "./api-client.js";
import SummaryCache from "./cache.js";
import {
  extractYouTubeVideoId,
  resolveYouTubeContent,
} from "./modules/youtube-transcript.js";

const apiClient = new APIClient();
const cache = new SummaryCache();

let offscreenDocument = false;
let creatingOffscreenDocument = null;
let activeArticleExtractions = 0;

const activeRequests = new Map();
const requestIdsByTab = new Map();

cache.cleanup().catch((error) => {
  console.error("Cache cleanup error:", error);
});

migrateUserSettings().catch((error) => {
  console.error("Failed to migrate user settings:", error);
});

async function migrateUserSettings() {
  const result = await new Promise((resolve) => {
    chrome.storage.local.get(
      ["apiKey", "provider", "model", "migrated"],
      (stored) => {
        resolve(stored || {});
      },
    );
  });

  if (chrome.runtime?.lastError) {
    throw new Error(chrome.runtime.lastError.message);
  }

  if (result.migrated || (!result.apiKey && !result.provider)) {
    return;
  }

  const migrationData = {
    migrated: true,
  };

  if (result.apiKey && !result.provider) {
    migrationData.provider = CONFIG.DEFAULTS.provider;
    migrationData.model = CONFIG.DEFAULTS.model;
    migrationData.summaryLength = CONFIG.DEFAULTS.summaryLength;
    migrationData.summaryFormat = CONFIG.DEFAULTS.summaryFormat;
  }

  await new Promise((resolve, reject) => {
    chrome.storage.local.set(migrationData, () => {
      if (chrome.runtime?.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve();
    });
  });
}

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") {
    chrome.tabs.create({ url: "setup.html" });
  }
});

async function hasExistingOffscreenDocument() {
  if (typeof chrome.runtime.getContexts !== "function") {
    return offscreenDocument;
  }

  const contexts = await chrome.runtime.getContexts({
    contextTypes: ["OFFSCREEN_DOCUMENT"],
    documentUrls: [chrome.runtime.getURL("offscreen.html")],
  });

  return contexts.length > 0;
}

async function createOffscreenDocument() {
  if (offscreenDocument) {
    return true;
  }

  if (creatingOffscreenDocument) {
    return creatingOffscreenDocument;
  }

  creatingOffscreenDocument = (async () => {
    try {
      if (await hasExistingOffscreenDocument()) {
        offscreenDocument = true;
        return true;
      }

      await chrome.offscreen.createDocument({
        url: "offscreen.html",
        reasons: ["DOM_PARSER"],
        justification:
          "Parse HTML content using Mozilla Readability for article extraction",
      });
      offscreenDocument = true;
      return true;
    } catch (error) {
      const message = error?.message || "";
      if (
        message.includes("Only a single offscreen document") ||
        message.includes("already exists")
      ) {
        offscreenDocument = true;
        return true;
      }

      console.error("Failed to create offscreen document:", error);
      return false;
    } finally {
      creatingOffscreenDocument = null;
    }
  })();

  return creatingOffscreenDocument;
}

async function closeOffscreenDocument() {
  creatingOffscreenDocument = null;
  if (!offscreenDocument || activeArticleExtractions > 0) {
    return;
  }

  await chrome.offscreen.closeDocument();
  offscreenDocument = false;
}

const scheduleOffscreenClose = (delayMs = 1000) => {
  setTimeout(() => {
    closeOffscreenDocument().catch((error) => {
      console.error("Failed to close offscreen document:", error);
    });
  }, delayMs);
};

const sendRequestMessage = (message) => {
  chrome.runtime.sendMessage(message);
};

const sendSummaryResult = ({ requestId, summary, title, fromCache }) => {
  sendRequestMessage({
    type: "summarizationResult",
    requestId,
    summary,
    title,
    fromCache,
  });
};

const sendSummaryError = (requestId, message) => {
  sendRequestMessage({
    type: "summarizationError",
    requestId,
    error: message,
  });
};

const isRequestActive = (requestId) => activeRequests.has(requestId);

const cleanupRequest = (requestId) => {
  const request = activeRequests.get(requestId);
  if (!request) {
    return;
  }

  activeRequests.delete(requestId);
  if (requestIdsByTab.get(request.tabId) === requestId) {
    requestIdsByTab.delete(request.tabId);
  }
};

const cancelRequest = (requestId) => {
  const request = activeRequests.get(requestId);
  if (!request) {
    return;
  }

  request.controller.abort();
  cleanupRequest(requestId);
};

const cancelRequestForTab = (tabId) => {
  const requestId = requestIdsByTab.get(tabId);
  if (!requestId) {
    return;
  }

  cancelRequest(requestId);
};

const requestTabExtraction = (tabId) =>
  new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, { type: "extractContent" }, (result) => {
      if (chrome.runtime?.lastError) {
        reject(new Error(CONFIG.ERRORS.UNSUPPORTED_PAGE));
        return;
      }
      resolve(result);
    });
  });

const createAbortableFetch = (signal) => {
  if (!signal) {
    return fetch;
  }

  return async (resource, options = {}) => {
    const requestController = new AbortController();
    const upstreamSignals = [signal, options.signal].filter(Boolean);
    const abortRequest = () => requestController.abort();

    upstreamSignals.forEach((upstreamSignal) => {
      upstreamSignal.addEventListener("abort", abortRequest, { once: true });
    });

    if (upstreamSignals.some((upstreamSignal) => upstreamSignal.aborted)) {
      requestController.abort();
    }

    try {
      return await fetch(resource, {
        ...options,
        signal: requestController.signal,
      });
    } finally {
      upstreamSignals.forEach((upstreamSignal) => {
        upstreamSignal.removeEventListener("abort", abortRequest);
      });
    }
  };
};

const summarizeWithPipeline = async ({
  requestId,
  extractedContent,
  settings,
  signal,
  resolveContent,
  logLabel = "Summarization error",
}) => {
  const { url, title } = extractedContent;

  try {
    const cachedEntry = await cache.get(url, settings);
    if (cachedEntry?.summary) {
      if (isRequestActive(requestId)) {
        sendSummaryResult({
          requestId,
          summary: cachedEntry.summary,
          title,
          fromCache: true,
        });
      }
      return;
    }

    const resolved = await resolveContent();
    if (!resolved?.content) {
      if (isRequestActive(requestId)) {
        const errorMessage =
          resolved?.error || CONFIG.ERRORS.CONTENT_EXTRACTION_FAILED;
        console.error(`${resolved?.errorLabel || logLabel}:`, errorMessage);
        sendSummaryError(requestId, errorMessage);
      }
      return;
    }

    const summary = await apiClient.callAPI(resolved.content, {
      promptContext: resolved.promptContext || {},
      settings,
      signal,
    });

    if (!isRequestActive(requestId)) {
      return;
    }

    try {
      await cache.set(url, settings, summary);
    } catch (error) {
      console.error("Cache set error:", error);
    }

    sendSummaryResult({
      requestId,
      summary,
      title: resolved.title || title,
      fromCache: false,
    });
  } catch (error) {
    if (signal.aborted || !isRequestActive(requestId)) {
      return;
    }

    console.error(`${logLabel}:`, error);
    sendSummaryError(requestId, error.message || CONFIG.ERRORS.API_CALL_FAILED);
  }
};

const resolveArticleContent = async ({ htmlContent, url, title }) => {
  activeArticleExtractions += 1;

  try {
    const offscreenReady = await createOffscreenDocument();
    if (!offscreenReady) {
      return {
        error: CONFIG.ERRORS.CONTENT_EXTRACTION_FAILED,
        errorLabel: "Content extraction error",
      };
    }

    const extractionResult = await new Promise((resolve) => {
      chrome.runtime.sendMessage(
        { type: "extractContent", htmlContent, url },
        (result) => {
          if (chrome.runtime?.lastError) {
            resolve({
              success: false,
              error:
                chrome.runtime.lastError.message ||
                CONFIG.ERRORS.CONTENT_EXTRACTION_FAILED,
            });
            return;
          }

          resolve(result);
        },
      );
    });

    if (chrome.runtime?.lastError) {
      return {
        error: chrome.runtime.lastError.message,
        errorLabel: "Content extraction error",
      };
    }

    if (!extractionResult || !extractionResult.success) {
      return {
        error:
          extractionResult?.error || CONFIG.ERRORS.CONTENT_EXTRACTION_FAILED,
        errorLabel: "Content extraction error",
      };
    }

    return {
      content: extractionResult.content,
      title: extractionResult.title || title,
    };
  } catch (error) {
    return {
      error: error.message || CONFIG.ERRORS.CONTENT_EXTRACTION_FAILED,
      errorLabel: "Content extraction error",
    };
  } finally {
    activeArticleExtractions = Math.max(0, activeArticleExtractions - 1);
    scheduleOffscreenClose();
  }
};

const resolveYouTubeSummaryContent = async ({
  htmlContent,
  url,
  title,
  settings,
  signal,
}) => {
  try {
    const transcriptMode =
      settings.youtubeTranscriptMode === "no-auto"
        ? "no-auto"
        : CONFIG.DEFAULTS.youtubeTranscriptMode;
    const result = await resolveYouTubeContent({
      url,
      html: htmlContent,
      mode: transcriptMode,
      fetchImpl: createAbortableFetch(signal),
      timeoutMs: CONFIG.TIMEOUT_MS,
    });

    if (!result?.text) {
      return {
        error: CONFIG.ERRORS.YOUTUBE_TRANSCRIPT_UNAVAILABLE,
        errorLabel: "YouTube summarization error",
      };
    }

    const resolvedTitle = result.title || title;

    return {
      content: result.text,
      title: resolvedTitle,
      promptContext: {
        sourceType: "video",
        title: resolvedTitle || null,
      },
    };
  } catch (error) {
    return {
      error: error.message || CONFIG.ERRORS.API_CALL_FAILED,
      errorLabel: "YouTube summarization error",
    };
  }
};

const startSummaryRequest = async ({ requestId, tabId }) => {
  cancelRequestForTab(tabId);

  const controller = new AbortController();
  activeRequests.set(requestId, { tabId, controller });
  requestIdsByTab.set(tabId, requestId);

  try {
    const extractedContent = await requestTabExtraction(tabId);
    if (!extractedContent?.success) {
      if (isRequestActive(requestId)) {
        sendSummaryError(
          requestId,
          extractedContent?.error || CONFIG.ERRORS.CONTENT_EXTRACTION_FAILED,
        );
      }
      return;
    }

    const settings = await apiClient.getSettings();
    if (!isRequestActive(requestId)) {
      return;
    }

    const videoId = extractYouTubeVideoId(extractedContent.url);
    if (videoId) {
      await summarizeWithPipeline({
        requestId,
        extractedContent,
        settings,
        signal: controller.signal,
        resolveContent: () =>
          resolveYouTubeSummaryContent({
            htmlContent: extractedContent.htmlContent,
            url: extractedContent.url,
            title: extractedContent.title,
            settings,
            signal: controller.signal,
          }),
        logLabel: "YouTube summarization error",
      });
      return;
    }

    await summarizeWithPipeline({
      requestId,
      extractedContent,
      settings,
      signal: controller.signal,
      resolveContent: () =>
        resolveArticleContent({
          htmlContent: extractedContent.htmlContent,
          url: extractedContent.url,
          title: extractedContent.title,
        }),
      logLabel: "Summarization error",
    });
  } catch (error) {
    if (!controller.signal.aborted && isRequestActive(requestId)) {
      console.error("Summarization error:", error);
      sendSummaryError(
        requestId,
        error.message || CONFIG.ERRORS.CONTENT_EXTRACTION_FAILED,
      );
    }
  } finally {
    cleanupRequest(requestId);
  }
};

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === "startSummary") {
    startSummaryRequest({
      requestId: request.requestId,
      tabId: request.tabId,
    });
    sendResponse({ started: true });
    return true;
  }

  if (request.type === "cancelSummary") {
    cancelRequest(request.requestId);
    sendResponse({ cancelled: true });
    return false;
  }
});

chrome.runtime.onSuspend.addListener(() => {
  Array.from(activeRequests.keys()).forEach((requestId) =>
    cancelRequest(requestId),
  );
  closeOffscreenDocument().catch((error) => {
    console.error("Failed to close offscreen document:", error);
  });
});

self.addEventListener("error", (event) => {
  console.error("Unhandled error in background script:", event.error);
});

self.addEventListener("unhandledrejection", (event) => {
  console.error(
    "Unhandled promise rejection in background script:",
    event.reason,
  );
});
