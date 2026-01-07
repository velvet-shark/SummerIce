import { CONFIG, getProviderConfig } from "./constants.js";
import APIClient from "./api-client.js";
import { saveSettings } from "./modules/settings-store.js";
import { getProviderUiData } from "./modules/provider-ui.js";

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

  const { providerConfig, description, links, apiKeyPlaceholder } =
    getProviderUiData(provider);

  // Update API key placeholder
  if (apiKeyPlaceholder) {
    apiKeyInput.placeholder = apiKeyPlaceholder;
  }

  // Clear existing content
  providerInfo.innerHTML = "";
  apiKeyLinks.innerHTML = "";

  if (providerConfig && description) {
    providerInfo.innerHTML = `<p><strong>${providerConfig.name}:</strong> ${description}</p>`;
  }

  links.forEach((link) => {
    const li = document.createElement("li");
    const a = document.createElement("a");
    a.href = link.url;
    a.target = "_blank";
    a.textContent = link.text;
    li.appendChild(a);
    apiKeyLinks.appendChild(li);
  });
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

    await saveSettings(
      {
        provider,
        model,
        apiKey,
        summaryLength: CONFIG.DEFAULTS.summaryLength,
        summaryFormat: CONFIG.DEFAULTS.summaryFormat,
        youtubeTranscriptMode: CONFIG.DEFAULTS.youtubeTranscriptMode,
      },
      { merge: false },
    );

    // Hide the form
    document.getElementById("setupForm").style.display = "none";

    // Show success message
    const contentElement = document.getElementById("content");
    const { providerConfig } = getProviderUiData(provider);
    const providerName = providerConfig?.name || provider;
    const successMessage = document.createElement("div");
    successMessage.innerHTML = `
      <h3 style="color: green;">Setup Complete!</h3>
      <p>Your ${providerName} API key has been saved securely in your browser.</p>
      <p>You can now summarize articles by:</p>
      <ul>
        <li>Clicking the SummerIce extension icon</li>
        <li>Pressing <strong>Ctrl+Shift+Y</strong> (Windows) or <strong>Cmd+Shift+Y</strong> (Mac)</li>
      </ul>
      <p>You can change your AI provider or settings anytime by visiting the Settings page.</p>
      <p style="margin-top: 20px;"><em>It is safe to close this tab now.</em></p>
    `;
    contentElement.appendChild(successMessage);
  } catch (error) {
    console.error("Setup error:", error);
    showSetupError(
      error.message ? `Setup failed: ${error.message}` : "Setup failed.",
    );
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
