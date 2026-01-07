import { CONFIG } from "./constants.js";
import APIClient from "./api-client.js";
import SummaryCache from "./cache.js";
import {
  extractYouTubeVideoId,
  resolveYouTubeContent,
} from "./modules/youtube-transcript.js";

// Initialize modules
const apiClient = new APIClient();
const cache = new SummaryCache();
let offscreenDocument = null;

// Clean up cache on startup
cache.cleanup();

// Migrate existing users to new settings format
migrateUserSettings();

// Migration function for existing users
async function migrateUserSettings() {
  return new Promise((resolve) => {
    chrome.storage.local.get(
      ["apiKey", "provider", "model", "migrated"],
      (result) => {
        // Skip if already migrated or this is a fresh install
        if (result.migrated || (!result.apiKey && !result.provider)) {
          resolve();
          return;
        }

        // If user has an apiKey but no provider/model settings, migrate them
        const migrationData = {
          migrated: true,
        };

        // If they have an API key but no provider set, assume OpenAI (legacy behavior)
        if (result.apiKey && !result.provider) {
          migrationData.provider = CONFIG.DEFAULTS.provider; // 'openai'
          migrationData.model = CONFIG.DEFAULTS.model; // default model fallback
          migrationData.summaryLength = CONFIG.DEFAULTS.summaryLength;
          migrationData.summaryFormat = CONFIG.DEFAULTS.summaryFormat;
        }

        // Save migration data
        chrome.storage.local.set(migrationData, () => {
          resolve();
        });
      },
    );
  });
}

// After extension installation, run setup
chrome.runtime.onInstalled.addListener(function (details) {
  if (details.reason === "install") {
    chrome.tabs.create({ url: "setup.html" });
  } else if (details.reason === "update") {
    // Don't show setup for existing users, migration handles everything
  }
});

// Handle keyboard command
chrome.commands.onCommand.addListener(function (command) {
  if (command === "_execute_action") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, { type: "extractContent" });
      }
    });
  }
});

// Create offscreen document for content extraction
async function createOffscreenDocument() {
  if (offscreenDocument) {
    return;
  }

  try {
    await chrome.offscreen.createDocument({
      url: "offscreen.html",
      reasons: ["DOM_PARSER"],
      justification:
        "Parse HTML content using Mozilla Readability for article extraction",
    });
    offscreenDocument = true;
  } catch (error) {
    console.error("Failed to create offscreen document:", error);
  }
}

// Close offscreen document
async function closeOffscreenDocument() {
  if (!offscreenDocument) {
    return;
  }

  try {
    await chrome.offscreen.closeDocument();
    offscreenDocument = false;
  } catch (error) {
    console.error("Failed to close offscreen document:", error);
  }
}

const sendSummaryResult = ({ summary, title, fromCache }) => {
  chrome.runtime.sendMessage({
    type: "summarizationResult",
    summary,
    title,
    fromCache,
  });
};

const sendSummaryError = (message) => {
  chrome.runtime.sendMessage({
    type: "summarizationError",
    error: message,
  });
};

const scheduleOffscreenClose = (delayMs = 1000) => {
  setTimeout(() => closeOffscreenDocument(), delayMs);
};

const summarizeWithPipeline = async ({
  url,
  title,
  settings,
  resolveContent,
  onFinally,
  logLabel = "Summarization error",
}) => {
  try {
    const cachedEntry = await cache.get(url, settings);
    if (cachedEntry?.summary) {
      sendSummaryResult({
        summary: cachedEntry.summary,
        fromCache: true,
      });
      return { fromCache: true };
    }

    const resolved = await resolveContent();
    if (!resolved?.content) {
      const errorMessage =
        resolved?.error || CONFIG.ERRORS.CONTENT_EXTRACTION_FAILED;
      const errorLabel = resolved?.errorLabel || logLabel;
      console.error(`${errorLabel}:`, errorMessage);
      sendSummaryError(errorMessage);
      return { error: true };
    }

    const summary = await apiClient.callAPI(
      resolved.content,
      resolved.promptContext || {},
    );
    await cache.set(url, settings, summary);

    sendSummaryResult({
      summary,
      title: resolved.title || title,
      fromCache: false,
    });

    return { summary };
  } catch (error) {
    console.error(`${logLabel}:`, error);
    sendSummaryError(error.message || CONFIG.ERRORS.API_CALL_FAILED);
    return { error: true };
  } finally {
    if (onFinally) {
      onFinally();
    }
  }
};

const resolveArticleContent = async ({ htmlContent, url, title }) => {
  try {
    await createOffscreenDocument();

    const extractionResult = await new Promise((resolve) => {
      chrome.runtime.sendMessage(
        { type: "extractContent", htmlContent, url },
        (result) => resolve(result),
      );
    });

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
  }
};

const resolveYouTubeSummaryContent = async ({
  htmlContent,
  url,
  title,
  settings,
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
      fetchImpl: fetch,
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

// Main message handler
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === "extractedHTML") {
    handleContentExtraction(request.htmlContent, request.url, request.title);
  } else if (request.type === "cancelSummary") {
    apiClient.cancelRequest();
    closeOffscreenDocument();
  }
});

// Handle content extraction and summarization
async function handleContentExtraction(htmlContent, url, title) {
  let settings;
  try {
    settings = await apiClient.getSettings();
  } catch (error) {
    console.error("Failed to load settings:", error);
    sendSummaryError(error.message || CONFIG.ERRORS.CONTENT_EXTRACTION_FAILED);
    return;
  }

  const videoId = extractYouTubeVideoId(url);
  if (videoId) {
    await summarizeWithPipeline({
      url,
      title,
      settings,
      resolveContent: () =>
        resolveYouTubeSummaryContent({ htmlContent, url, title, settings }),
      logLabel: "YouTube summarization error",
    });
    return;
  }

  await summarizeWithPipeline({
    url,
    title,
    settings,
    resolveContent: () => resolveArticleContent({ htmlContent, url, title }),
    onFinally: scheduleOffscreenClose,
    logLabel: "Summarization error",
  });
}

// Handle extension lifecycle
chrome.runtime.onSuspend.addListener(() => {
  apiClient.cancelRequest();
  closeOffscreenDocument();
});

// Error handler for unhandled errors
self.addEventListener("error", (event) => {
  console.error("Unhandled error in background script:", event.error);
});

self.addEventListener("unhandledrejection", (event) => {
  console.error(
    "Unhandled promise rejection in background script:",
    event.reason,
  );
});
