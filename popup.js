import { CONFIG } from './constants.js';

window.onload = function () {
  initializePopup();
};

function initializePopup() {
  // Get the current active tab
  chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
    if (tabs[0]) {
      // Check if we can access the tab
      chrome.tabs.sendMessage(tabs[0].id, { type: "ping" }, function (response) {
        if (chrome.runtime.lastError) {
          // Can't access this tab
          displayError(CONFIG.ERRORS.UNSUPPORTED_PAGE);
        } else {
          // Tab accessible, proceed with content extraction
          showLoading();
          chrome.tabs.sendMessage(tabs[0].id, { type: "extractContent" });
        }
      });
    } else {
      displayError("No active tab found.");
    }
  });

  // Set up event listeners
  setupEventListeners();
}

function setupEventListeners() {
  // Settings link
  document.getElementById("settingsLink").addEventListener("click", function (event) {
    event.preventDefault();
    chrome.runtime.openOptionsPage();
  });

  // Message listener for results
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === "summarizationResult") {
      displaySummary(request.summary, request.fromCache);
    } else if (request.type === "summarizationError") {
      displayError(request.error);
    }
  });
}

function showLoading() {
  const summaryArea = document.getElementById("summary-area");
  const spinner = document.getElementById("spinner");
  const timeoutMessage = document.getElementById("timeout-message");

  summaryArea.style.display = "none";
  spinner.style.display = "block";
  timeoutMessage.style.display = "none";

  // Auto-timeout with better messaging
  setTimeout(() => {
    if (spinner.style.display !== "none") {
      spinner.style.display = "none";
      timeoutMessage.style.display = "block";
    }
  }, CONFIG.TIMEOUT_MS);
}

function displaySummary(summary, fromCache = false) {
  const summaryArea = document.getElementById("summary-area");
  const spinner = document.getElementById("spinner");
  const timeoutMessage = document.getElementById("timeout-message");

  if (summary) {
    const cacheIndicator = fromCache ? '<div class="cache-indicator">📄 From cache</div>' : '';

    summaryArea.style.display = "block";
    summaryArea.innerHTML = `
      ${cacheIndicator}
      <div class="summary-content">
        ${summary.replace(/\n/g, '<br>')}
      </div>
    `;
    summaryArea.style.color = ""; // Reset color
    spinner.style.display = "none";
    timeoutMessage.style.display = "none";
  }
}

function displayError(message) {
  const summaryArea = document.getElementById("summary-area");
  const spinner = document.getElementById("spinner");
  const timeoutMessage = document.getElementById("timeout-message");

  summaryArea.style.display = "block";
  summaryArea.innerHTML = `<div class="error-message">${message}</div>`;
  summaryArea.style.color = "#e74c3c";
  spinner.style.display = "none";
  timeoutMessage.style.display = "none";
}

