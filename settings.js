import { CONFIG, getProviderConfig } from "./constants.js";
import APIClient from "./api-client.js";

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

function initializeSettings() {
  // Load current settings
  chrome.storage.local.get(
    [
      "provider",
      "model",
      "apiKey",
      "summaryLength",
      "summaryFormat",
      "youtubeTranscriptMode",
    ],
    function (result) {
      const provider = result.provider || CONFIG.DEFAULTS.provider;
      const model = result.model || CONFIG.DEFAULTS.model;

      // Set provider
      document.getElementById("provider").value = provider;

      // Update model options and set current model
      updateModelOptions(provider, model);

      // Set API key
      if (result.apiKey) {
        document.getElementById("apiKey").value = result.apiKey;
      }

      // Set summary preferences
      document.getElementById("summaryLength").value =
        result.summaryLength || CONFIG.DEFAULTS.summaryLength;
      document.getElementById("summaryFormat").value =
        result.summaryFormat || CONFIG.DEFAULTS.summaryFormat;
      document.getElementById("youtubeTranscriptMode").value =
        result.youtubeTranscriptMode || CONFIG.DEFAULTS.youtubeTranscriptMode;

      // Update API key help
      updateApiKeyHelp(provider);
    },
  );
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
      saveSettings();
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
  const providerConfig = getProviderConfig(provider);
  if (providerConfig) {
    apiKeyInput.placeholder = `${providerConfig.keyPrefix}...`;
  }

  // Add provider-specific links
  const links = {
    openai: {
      text: "OpenAI API Keys",
      url: "https://platform.openai.com/api-keys",
    },
    anthropic: {
      text: "Anthropic Console",
      url: "https://console.anthropic.com/",
    },
    gemini: {
      text: "Google AI Studio",
      url: "https://aistudio.google.com/app/apikey",
    },
    grok: {
      text: "xAI Console",
      url: "https://console.x.ai/",
    },
  };

  if (links[provider]) {
    const li = document.createElement("li");
    const a = document.createElement("a");
    a.href = links[provider].url;
    a.target = "_blank";
    a.textContent = links[provider].text;
    li.appendChild(a);
    apiKeyLinks.appendChild(li);
  }
}

function saveSettings() {
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

  chrome.storage.local.set(settings, function () {
    showMessage("Settings saved successfully!", "green");
  });
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
