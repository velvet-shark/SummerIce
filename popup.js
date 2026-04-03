import { CONFIG } from "./constants.js";

let currentRequestId = null;
let timeoutId = null;
let messageListenerAttached = false;
let unloadListenerAttached = false;

const createRequestId = () => {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  return `request-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
};

const clearLoadingTimeout = () => {
  if (timeoutId) {
    clearTimeout(timeoutId);
    timeoutId = null;
  }
};

const cancelActiveRequest = () => {
  if (!currentRequestId) {
    return;
  }

  chrome.runtime.sendMessage({
    type: "cancelSummary",
    requestId: currentRequestId,
  });
};

const renderSummaryBody = (summaryArea, summary) => {
  const content = document.createElement("div");
  content.className = "summary-content";
  content.textContent = summary;
  summaryArea.appendChild(content);
};

function displaySummary(summary, fromCache = false) {
  const summaryArea = document.getElementById("summary-area");
  const spinner = document.getElementById("spinner");
  const timeoutMessage = document.getElementById("timeout-message");

  clearLoadingTimeout();

  summaryArea.replaceChildren();
  summaryArea.style.display = "block";

  if (fromCache) {
    const cacheIndicator = document.createElement("div");
    cacheIndicator.className = "cache-indicator";
    cacheIndicator.textContent = "From cache";
    summaryArea.appendChild(cacheIndicator);
  }

  renderSummaryBody(summaryArea, summary || "");
  summaryArea.style.color = "";
  spinner.style.display = "none";
  timeoutMessage.style.display = "none";
}

function displayError(message) {
  const summaryArea = document.getElementById("summary-area");
  const spinner = document.getElementById("spinner");
  const timeoutMessage = document.getElementById("timeout-message");
  const errorMessage = document.createElement("div");

  clearLoadingTimeout();

  errorMessage.className = "error-message";
  errorMessage.textContent = message;
  summaryArea.replaceChildren(errorMessage);
  summaryArea.style.display = "block";
  summaryArea.style.color = "#e74c3c";
  spinner.style.display = "none";
  timeoutMessage.style.display = "none";
}

function showLoading() {
  const summaryArea = document.getElementById("summary-area");
  const spinner = document.getElementById("spinner");
  const timeoutMessage = document.getElementById("timeout-message");

  clearLoadingTimeout();
  summaryArea.replaceChildren();
  summaryArea.style.display = "none";
  spinner.style.display = "block";
  timeoutMessage.style.display = "none";

  timeoutId = setTimeout(() => {
    if (spinner.style.display !== "none") {
      spinner.style.display = "none";
      timeoutMessage.style.display = "block";
    }
  }, CONFIG.TIMEOUT_MS);
}

function handleRuntimeMessage(request) {
  if (!currentRequestId || request.requestId !== currentRequestId) {
    return;
  }

  if (request.type === "summarizationResult") {
    currentRequestId = null;
    displaySummary(request.summary, request.fromCache);
  } else if (request.type === "summarizationError") {
    currentRequestId = null;
    displayError(request.error);
  }
}

function setupEventListeners() {
  if (!messageListenerAttached) {
    chrome.runtime.onMessage.addListener(handleRuntimeMessage);
    messageListenerAttached = true;
  }

  if (!unloadListenerAttached) {
    window.addEventListener("beforeunload", cancelActiveRequest);
    unloadListenerAttached = true;
  }

  document.getElementById("settingsLink").addEventListener("click", (event) => {
    event.preventDefault();
    chrome.runtime.openOptionsPage();
  });
}

async function startSummary(tabId) {
  currentRequestId = createRequestId();

  showLoading();

  chrome.runtime.sendMessage(
    {
      type: "startSummary",
      requestId: currentRequestId,
      tabId,
    },
    (response) => {
      if (chrome.runtime?.lastError) {
        currentRequestId = null;
        displayError(CONFIG.ERRORS.UNSUPPORTED_PAGE);
        return;
      }

      if (!response?.started) {
        currentRequestId = null;
        displayError(CONFIG.ERRORS.API_CALL_FAILED);
      }
    },
  );
}

function initializePopup() {
  setupEventListeners();

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (chrome.runtime?.lastError) {
      displayError(chrome.runtime.lastError.message);
      return;
    }

    const activeTab = tabs?.[0];
    if (!activeTab?.id) {
      displayError("No active tab found.");
      return;
    }

    startSummary(activeTab.id);
  });
}

if (typeof window !== "undefined") {
  window.addEventListener("load", initializePopup, { once: true });
}

export {
  createRequestId,
  displayError,
  displaySummary,
  handleRuntimeMessage,
  initializePopup,
  showLoading,
};
