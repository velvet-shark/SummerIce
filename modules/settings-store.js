import { CONFIG, getProviderConfig } from "../constants.js";

const SETTINGS_KEYS = [
  "provider",
  "model",
  "apiKey",
  "summaryLength",
  "summaryFormat",
  "youtubeTranscriptMode",
];

const normalizeSettings = (rawSettings = {}) => {
  const provider = rawSettings.provider || CONFIG.DEFAULTS.provider;
  const providerConfig = getProviderConfig(provider);

  let model = rawSettings.model || CONFIG.DEFAULTS.model;

  if (
    providerConfig &&
    providerConfig.models &&
    !providerConfig.models[model]
  ) {
    const availableModels = Object.keys(providerConfig.models);
    if (availableModels.length > 0) {
      model = availableModels[0];
    }
  }

  return {
    provider,
    model,
    apiKey: rawSettings.apiKey || "",
    summaryLength: rawSettings.summaryLength || CONFIG.DEFAULTS.summaryLength,
    summaryFormat: rawSettings.summaryFormat || CONFIG.DEFAULTS.summaryFormat,
    youtubeTranscriptMode:
      rawSettings.youtubeTranscriptMode ||
      CONFIG.DEFAULTS.youtubeTranscriptMode,
  };
};

const readSettings = () =>
  new Promise((resolve) => {
    chrome.storage.local.get(SETTINGS_KEYS, (result) => {
      resolve(result || {});
    });
  });

export const loadSettings = async () => {
  const stored = await readSettings();
  return normalizeSettings(stored);
};

export const saveSettings = async (settings, { merge = true } = {}) => {
  const base = merge ? await loadSettings() : {};
  const normalized = normalizeSettings({ ...base, ...settings });

  return new Promise((resolve) => {
    chrome.storage.local.set(normalized, () => {
      resolve(normalized);
    });
  });
};

export { normalizeSettings };
