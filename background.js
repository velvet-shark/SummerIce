import { CONFIG } from './constants.js';
import APIClient from './api-client.js';
import SummaryCache from './cache.js';


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
    chrome.storage.local.get(['apiKey', 'provider', 'model', 'migrated'], (result) => {
      // Skip if already migrated or this is a fresh install
      if (result.migrated || (!result.apiKey && !result.provider)) {
        resolve();
        return;
      }

      
      // If user has an apiKey but no provider/model settings, migrate them
      const migrationData = {
        migrated: true
      };

      // If they have an API key but no provider set, assume OpenAI (legacy behavior)
      if (result.apiKey && !result.provider) {
        migrationData.provider = CONFIG.DEFAULTS.provider; // 'openai'
        migrationData.model = CONFIG.DEFAULTS.model; // 'gpt-4o-mini'
        migrationData.summaryLength = CONFIG.DEFAULTS.summaryLength;
        migrationData.summaryFormat = CONFIG.DEFAULTS.summaryFormat;
        
      }

      // Save migration data
      chrome.storage.local.set(migrationData, () => {
        resolve();
      });
    });
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
      url: 'offscreen.html',
      reasons: ['DOM_PARSER'],
      justification: 'Parse HTML content using Mozilla Readability for article extraction'
    });
    offscreenDocument = true;
  } catch (error) {
    console.error('Failed to create offscreen document:', error);
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
    console.error('Failed to close offscreen document:', error);
  }
}

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
  try {
    // Get current settings
    const settings = await apiClient.getSettings();
    
    // Check cache first
    const cachedSummary = await cache.get(url, settings);
    if (cachedSummary) {
      chrome.runtime.sendMessage({ 
        type: "summarizationResult", 
        summary: cachedSummary,
        fromCache: true 
      });
      return;
    }

    // Create offscreen document for extraction
    await createOffscreenDocument();

    // Extract content using offscreen document
    const extractionResult = await new Promise((resolve) => {
      chrome.runtime.sendMessage(
        { type: "extractContent", htmlContent, url },
        (result) => resolve(result)
      );
    });

    try {
      if (!extractionResult || !extractionResult.success) {
        throw new Error(extractionResult?.error || CONFIG.ERRORS.CONTENT_EXTRACTION_FAILED);
      }

      const extractedContent = extractionResult.content;

      // Generate summary using API
      const summary = await apiClient.callAPI(extractedContent);
      
      // Cache the result
      await cache.set(url, settings, summary);

      // Send result to popup
      chrome.runtime.sendMessage({ 
        type: "summarizationResult", 
        summary: summary,
        title: title,
        fromCache: false 
      });

    } catch (error) {
      console.error("Summarization error:", error);
      chrome.runtime.sendMessage({ 
        type: "summarizationError", 
        error: error.message || CONFIG.ERRORS.API_CALL_FAILED 
      });
    } finally {
      // Clean up offscreen document
      setTimeout(() => closeOffscreenDocument(), 1000);
    }

  } catch (error) {
    console.error("Content extraction error:", error);
    chrome.runtime.sendMessage({ 
      type: "summarizationError", 
      error: error.message || CONFIG.ERRORS.CONTENT_EXTRACTION_FAILED 
    });
    closeOffscreenDocument();
  }
}

// Handle extension lifecycle
chrome.runtime.onSuspend.addListener(() => {
  apiClient.cancelRequest();
  closeOffscreenDocument();
});

// Error handler for unhandled errors
self.addEventListener('error', (event) => {
  console.error('Unhandled error in background script:', event.error);
});

self.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled promise rejection in background script:', event.reason);
});
