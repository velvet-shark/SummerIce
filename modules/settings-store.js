import { CONFIG, resolveProviderModel } from "../constants.js";

const SETTINGS_KEYS = [
  "provider",
  "model",
  "apiKey",
  "summaryLength",
  "summaryFormat",
  "youtubeTranscriptMode",
];

const normalizeSettings = (rawSettings = {}) => {
  const requestedProvider = rawSettings.provider || CONFIG.DEFAULTS.provider;
  const { providerConfig, model } = resolveProviderModel(
    requestedProvider,
    rawSettings.model || CONFIG.DEFAULTS.model,
  );
  const provider = providerConfig?.id || CONFIG.DEFAULTS.provider;

  return {
    provider,
    model,
    apiKey:
      typeof rawSettings.apiKey === "string" ? rawSettings.apiKey.trim() : "",
    summaryLength: rawSettings.summaryLength || CONFIG.DEFAULTS.summaryLength,
    summaryFormat: rawSettings.summaryFormat || CONFIG.DEFAULTS.summaryFormat,
    youtubeTranscriptMode:
      rawSettings.youtubeTranscriptMode ||
      CONFIG.DEFAULTS.youtubeTranscriptMode,
  };
};

const readSettings = () =>
  new Promise((resolve, reject) => {
    chrome.storage.local.get(SETTINGS_KEYS, (result) => {
      if (chrome.runtime?.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
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

  return new Promise((resolve, reject) => {
    chrome.storage.local.set(normalized, () => {
      if (chrome.runtime?.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(normalized);
    });
  });
};

export { normalizeSettings };
