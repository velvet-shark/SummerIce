import { CONFIG, getProviderConfig } from "./constants.js";
import APIClient from "./api-client.js";

const apiClient = new APIClient();

document.addEventListener("DOMContentLoaded", function () {
  initializeSetup();
  setupEventListeners();
});

function initializeSetup() {
  // Initialize with default provider
  const defaultProvider = CONFIG.DEFAULTS.provider;
  updateModelOptions(defaultProvider);
  updateProviderInfo(defaultProvider);
}

function setupEventListeners() {
  // Provider change event
  document.getElementById("provider").addEventListener("change", function () {
    const provider = this.value;
    updateModelOptions(provider);
    updateProviderInfo(provider);
    document.getElementById("apiKey").value = ""; // Clear API key when changing provider
  });

  // Form submit event
  document
    .getElementById("setupForm")
    .addEventListener("submit", function (event) {
      event.preventDefault();
      saveSetup();
    });
}

function updateModelOptions(provider) {
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
  }
}

function updateProviderInfo(provider) {
  const providerInfo = document.getElementById("providerInfo");
  const apiKeyLinks = document.getElementById("apiKeyLinks");
  const apiKeyInput = document.getElementById("apiKey");

  const providerConfig = getProviderConfig(provider);

  // Update API key placeholder
  if (providerConfig) {
    apiKeyInput.placeholder = `${providerConfig.keyPrefix}...`;
  }

  // Clear existing content
  providerInfo.innerHTML = "";
  apiKeyLinks.innerHTML = "";

  // Provider-specific information
  const providerDescriptions = {
    openai: {
      description:
        "OpenAI provides the GPT-5 Mini and Nano models, balancing strong reasoning with low latency and cost.",
      linkText: "OpenAI API Keys",
      linkUrl: "https://platform.openai.com/api-keys",
      signupUrl: "https://platform.openai.com/signup",
    },
    anthropic: {
      description:
        "Anthropic's Claude Sonnet 4.5 pairs fast responses with deeper reasoning and strong safety defaults for nuanced summaries.",
      linkText: "Anthropic Console",
      linkUrl: "https://console.anthropic.com/",
      signupUrl: "https://console.anthropic.com/",
    },
    gemini: {
      description:
        "Google's Gemini 2.5 Flash Preview offers competitive performance with generous free tiers. Good for high-volume usage.",
      linkText: "Google AI Studio",
      linkUrl: "https://aistudio.google.com/app/apikey",
      signupUrl: "https://aistudio.google.com/",
    },
    grok: {
      description:
        "xAI's Grok 4 Fast offers fresh reasoning with competitive latency and web-native context updates.",
      linkText: "xAI Console",
      linkUrl: "https://console.x.ai/",
      signupUrl: "https://console.x.ai/",
    },
  };

  const info = providerDescriptions[provider];
  if (info) {
    providerInfo.innerHTML = `<p><strong>${providerConfig.name}:</strong> ${info.description}</p>`;

    // Add API key link
    const keyLi = document.createElement("li");
    const keyLink = document.createElement("a");
    keyLink.href = info.linkUrl;
    keyLink.target = "_blank";
    keyLink.textContent = info.linkText;
    keyLi.appendChild(keyLink);
    apiKeyLinks.appendChild(keyLi);

    // Add signup link if different
    if (info.signupUrl !== info.linkUrl) {
      const signupLi = document.createElement("li");
      const signupLink = document.createElement("a");
      signupLink.href = info.signupUrl;
      signupLink.target = "_blank";
      signupLink.textContent = `Sign up for ${providerConfig.name}`;
      signupLi.appendChild(signupLink);
      apiKeyLinks.appendChild(signupLi);
    }
  }
}

async function saveSetup() {
  const provider = document.getElementById("provider").value;
  const model = document.getElementById("model").value;
  const apiKey = document.getElementById("apiKey").value;
  const submitButton = document
    .getElementById("setupForm")
    .querySelector('button[type="submit"]');
  const errorDisplay = document.getElementById("setupError");

  if (!apiKey.trim()) {
    showSetupError("Please enter your API key");
    return;
  }

  // Disable button and show loading state
  submitButton.disabled = true;
  submitButton.textContent = "Validating...";
  hideSetupError();

  try {
    // Validate the API key
    const result = await apiClient.testAPIKey(provider, apiKey, model);

    if (!result.ok) {
      showSetupError(
        result.errorMessage ||
          "API key is invalid. Please check your key and try again.",
      );
      return;
    }

    // Hide the form
    document.getElementById("setupForm").style.display = "none";

    // Show success message
    const contentElement = document.getElementById("content");
    const successMessage = document.createElement("div");
    successMessage.innerHTML = `
      <h3 style="color: green;">Setup Complete!</h3>
      <p>Your ${getProviderConfig(provider).name} API key has been saved securely in your browser.</p>
      <p>You can now summarize articles by:</p>
      <ul>
        <li>Clicking the SummerIce extension icon</li>
        <li>Pressing <strong>Ctrl+Shift+Y</strong> (Windows) or <strong>Cmd+Shift+Y</strong> (Mac)</li>
      </ul>
      <p>You can change your AI provider or settings anytime by visiting the Settings page.</p>
      <p style="margin-top: 20px;"><em>It is safe to close this tab now.</em></p>
    `;
    contentElement.appendChild(successMessage);

    // Save all settings
    const settings = {
      provider,
      model,
      apiKey,
      summaryLength: CONFIG.DEFAULTS.summaryLength,
      summaryFormat: CONFIG.DEFAULTS.summaryFormat,
      youtubeTranscriptMode: CONFIG.DEFAULTS.youtubeTranscriptMode,
    };

    chrome.storage.local.set(settings, function () {});
  } catch (error) {
    console.error("API key validation error:", error);
    showSetupError("Error validating API key: " + error.message);
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = "Save & Start";
  }
}

function showSetupError(message) {
  let errorDisplay = document.getElementById("setupError");
  if (!errorDisplay) {
    errorDisplay = document.createElement("div");
    errorDisplay.id = "setupError";
    errorDisplay.style.cssText =
      "color: #e74c3c; background-color: #fdf2f2; border: 1px solid #fecaca; border-radius: 5px; padding: 10px; margin-bottom: 15px;";
    const form = document.getElementById("setupForm");
    form.insertBefore(errorDisplay, form.firstChild);
  }
  errorDisplay.textContent = message;
  errorDisplay.style.display = "block";
}

function hideSetupError() {
  const errorDisplay = document.getElementById("setupError");
  if (errorDisplay) {
    errorDisplay.style.display = "none";
  }
}
