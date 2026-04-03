import { describe, expect, it } from "vitest";
import { CONFIG } from "../constants.js";
import {
  loadSettings,
  normalizeSettings,
  saveSettings,
} from "../modules/settings-store.js";

const createStorageMock = (initial = {}) => {
  const store = { ...initial };
  let shouldFailGet = false;
  let shouldFailSet = false;

  return {
    store,
    failGet() {
      shouldFailGet = true;
    },
    failSet() {
      shouldFailSet = true;
    },
    get(keys, cb) {
      if (shouldFailGet) {
        global.chrome.runtime.lastError = { message: "Storage get failed" };
        cb({});
        global.chrome.runtime.lastError = null;
        return;
      }

      if (Array.isArray(keys)) {
        const result = {};
        keys.forEach((key) => {
          if (Object.prototype.hasOwnProperty.call(store, key)) {
            result[key] = store[key];
          }
        });
        cb(result);
        return;
      }
      cb({ ...store });
    },
    set(values, cb) {
      if (shouldFailSet) {
        global.chrome.runtime.lastError = { message: "Storage set failed" };
        cb?.();
        global.chrome.runtime.lastError = null;
        return;
      }

      Object.assign(store, values);
      if (cb) cb();
    },
  };
};

const withStorage = async (initial, testFn) => {
  const storage = createStorageMock(initial);
  global.chrome = {
    runtime: {
      lastError: null,
    },
    storage: {
      local: storage,
    },
  };
  try {
    await testFn(storage.store, storage);
  } finally {
    delete global.chrome;
  }
};

describe("settings store", () => {
  it("loads defaults when storage is empty", async () => {
    await withStorage({}, async () => {
      const settings = await loadSettings();

      expect(settings).toMatchObject({
        provider: CONFIG.DEFAULTS.provider,
        model: CONFIG.DEFAULTS.model,
        apiKey: "",
        summaryLength: CONFIG.DEFAULTS.summaryLength,
        summaryFormat: CONFIG.DEFAULTS.summaryFormat,
        youtubeTranscriptMode: CONFIG.DEFAULTS.youtubeTranscriptMode,
      });
    });
  });

  it("normalizes invalid model to provider default", () => {
    const normalized = normalizeSettings({
      provider: "openai",
      model: "invalid-model",
    });

    const firstModel = Object.keys(CONFIG.LLM_PROVIDERS.OPENAI.models)[0];
    expect(normalized.model).toBe(firstModel);
  });

  it("merges and saves settings by default", async () => {
    await withStorage(
      {
        provider: "openai",
        model: "gpt-5.4-mini",
        apiKey: "sk-test",
      },
      async (store) => {
        await saveSettings({ summaryFormat: "bullets" });

        expect(store).toMatchObject({
          provider: "openai",
          model: "gpt-5.4-mini",
          apiKey: "sk-test",
          summaryFormat: "bullets",
        });
      },
    );
  });

  it("overwrites when merge is false", async () => {
    await withStorage(
      {
        provider: "openai",
        model: "gpt-5.4-mini",
        apiKey: "sk-test",
      },
      async (store) => {
        await saveSettings(
          {
            provider: "grok",
            model: "grok-4-1-fast-reasoning",
            apiKey: "xai-test",
          },
          { merge: false },
        );

        expect(store).toMatchObject({
          provider: "grok",
          model: "grok-4-1-fast-reasoning",
          apiKey: "xai-test",
        });
      },
    );
  });

  it("rejects when settings cannot be loaded", async () => {
    await withStorage({}, async (_, storage) => {
      storage.failGet();

      await expect(loadSettings()).rejects.toThrow("Storage get failed");
    });
  });

  it("rejects when settings cannot be saved", async () => {
    await withStorage({}, async (_, storage) => {
      storage.failSet();

      await expect(
        saveSettings({
          provider: "openai",
          model: "gpt-5.4-mini",
          apiKey: "sk-test",
        }),
      ).rejects.toThrow("Storage set failed");
    });
  });
});
