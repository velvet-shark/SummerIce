import { getProviderConfig } from "./constants.js";
import APIClient from "./api-client.js";
import {
  loadSettings,
  normalizeSettings,
  saveSettings,
} from "./modules/settings-store.js";
import {
  getProviderApiKeyLink,
  getProviderUiData,
} from "./modules/provider-ui.js";

const apiClient = new APIClient();

document.addEventListener("DOMContentLoaded", function () {
  initializeSettings();
  setupEventListeners();
  displayVersion();
});

function displayVersion() {
  const manifest = chrome.runtime.getManifest();
  document.getElementById("version").textContent =
    `Version ${manifest.version}`;
}

async function initializeSettings() {
  let settings = null;
  try {
    settings = await loadSettings();
  } catch (error) {
    console.error("Failed to load settings:", error);
    settings = normalizeSettings({});
    showMessage("Failed to load saved settings. Using defaults.", "red");
  }
  const {
    provider,
    model,
    apiKey,
    summaryLength,
    summaryFormat,
    youtubeTranscriptMode,
  } = settings;

  // Set provider
  document.getElementById("provider").value = provider;

  // Update model options and set current model
  updateModelOptions(provider, model);

  // Set API key
  if (apiKey) {
    document.getElementById("apiKey").value = apiKey;
  }

  // Set summary preferences
  document.getElementById("summaryLength").value = summaryLength;
  document.getElementById("summaryFormat").value = summaryFormat;
  document.getElementById("youtubeTranscriptMode").value =
    youtubeTranscriptMode;

  // Update API key help
  updateApiKeyHelp(provider);
}

function setupEventListeners() {
  // Provider change event
  document.getElementById("provider").addEventListener("change", function () {
    const provider = this.value;
    updateModelOptions(provider);
    updateApiKeyHelp(provider);
    document.getElementById("apiKey").value = ""; // Clear API key when changing provider
  });

  // Form submit event
  document
    .getElementById("settingsForm")
    .addEventListener("submit", function (event) {
      event.preventDefault();
      persistSettings();
    });

  // Test API key
  document.getElementById("testApiKey").addEventListener("click", function () {
    testApiKey();
  });
}

function updateModelOptions(provider, selectedModel = null) {
  const modelSelect = document.getElementById("model");
  const providerConfig = getProviderConfig(provider);

  // Clear existing options
  modelSelect.innerHTML = "";

  if (providerConfig && providerConfig.models) {
    Object.entries(providerConfig.models).forEach(([modelId, modelInfo]) => {
      const option = document.createElement("option");
      option.value = modelId;
      option.textContent = modelInfo.name;
      modelSelect.appendChild(option);
    });

    // Set selected model or default
    if (selectedModel && providerConfig.models[selectedModel]) {
      modelSelect.value = selectedModel;
    } else {
      // Set first model as default
      const firstModel = Object.keys(providerConfig.models)[0];
      if (firstModel) {
        modelSelect.value = firstModel;
      }
    }
  }
}

function updateApiKeyHelp(provider) {
  const apiKeyLinks = document.getElementById("apiKeyLinks");
  const apiKeyInput = document.getElementById("apiKey");

  // Clear existing links
  apiKeyLinks.innerHTML = "";

  // Update placeholder
  const { apiKeyPlaceholder } = getProviderUiData(provider);
  if (apiKeyPlaceholder) {
    apiKeyInput.placeholder = apiKeyPlaceholder;
  }

  const apiKeyLink = getProviderApiKeyLink(provider);
  if (apiKeyLink) {
    const li = document.createElement("li");
    const a = document.createElement("a");
    a.href = apiKeyLink.url;
    a.target = "_blank";
    a.textContent = apiKeyLink.text;
    li.appendChild(a);
    apiKeyLinks.appendChild(li);
  }
}

async function persistSettings() {
  const provider = document.getElementById("provider").value;
  const model = document.getElementById("model").value;
  const apiKey = document.getElementById("apiKey").value;
  const summaryLength = document.getElementById("summaryLength").value;
  const summaryFormat = document.getElementById("summaryFormat").value;
  const youtubeTranscriptMode = document.getElementById(
    "youtubeTranscriptMode",
  ).value;

  const settings = {
    provider,
    model,
    apiKey,
    summaryLength,
    summaryFormat,
    youtubeTranscriptMode,
  };

  try {
    await saveSettings(settings);
    showMessage("Settings saved successfully!", "green");
  } catch (error) {
    console.error("Settings save failed:", error);
    showMessage("Failed to save settings. Please try again.", "red");
  }
}

async function testApiKey() {
  const provider = document.getElementById("provider").value;
  const model = document.getElementById("model").value;
  const apiKey = document.getElementById("apiKey").value;
  const testButton = document.getElementById("testApiKey");

  if (!apiKey) {
    showMessage("Please enter an API key first", "red");
    return;
  }

  testButton.disabled = true;
  testButton.textContent = "Testing...";

  try {
    const result = await apiClient.testAPIKey(provider, apiKey, model);

    if (result.ok) {
      showMessage("API key is valid!", "green");
    } else {
      showMessage(
        result.errorMessage ||
          "API key test failed. Please check your key and try again.",
        "red",
      );
    }
  } catch (error) {
    console.error("API key test error:", error);
    showMessage("Error testing API key: " + error.message, "red");
  } finally {
    testButton.disabled = false;
    testButton.textContent = "Test";
  }
}

function showMessage(text, type) {
  const messageElement = document.getElementById("message");

  // Clear existing classes
  messageElement.className = "message-display";

  // Add appropriate class and show
  messageElement.classList.add(type === "green" ? "success" : "error");
  messageElement.textContent = text;
  messageElement.style.display = "block";

  // Auto-hide after 5 seconds
  setTimeout(() => {
    messageElement.style.display = "none";
  }, 5000);
}
