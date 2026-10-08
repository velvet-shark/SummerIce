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

  it("uses non-reasoning as the grok provider default", () => {
    const normalized = normalizeSettings({
      provider: "grok",
      model: "invalid-model",
    });

    expect(normalized.model).toBe("grok-4.20-non-reasoning");
  });

  it.each([
    ["openai", "gpt-5.4-nano", "gpt-5.6-luna"],
    ["gemini", "gemini-3.5-flash", "gemini-3.5-flash-lite"],
    ["grok", "grok-4.3", "grok-4.20-non-reasoning"],
  ])(
    "migrates removed %s models while preserving settings",
    (provider, model, expected) => {
      expect(
        normalizeSettings({
          provider,
          model,
          apiKey: "test-key",
          summaryFormat: "bullets",
        }),
      ).toMatchObject({
        provider,
        model: expected,
        apiKey: "test-key",
        summaryFormat: "bullets",
      });
    },
  );

  it("keeps a saved budget Gemini model instead of replacing it with the new default", () => {
    expect(
      normalizeSettings({ provider: "gemini", model: "gemini-3.1-flash-lite" })
        .model,
    ).toBe("gemini-3.1-flash-lite");
    expect(normalizeSettings({ provider: "gemini" }).model).toBe(
      "gemini-3.5-flash-lite",
    );
  });

  it("disables Luna reasoning without sending an unsupported option to GPT-5 Nano", () => {
    const providerConfig = CONFIG.LLM_PROVIDERS.OPENAI;
    const request = (model) =>
      providerConfig.buildRequest({
        prompt: "Summarize this article",
        model,
        maxTokens: 4096,
        providerConfig,
      });
    expect(request("gpt-5.6-luna")).toMatchObject({
      reasoning_effort: "none",
      max_completion_tokens: 4096,
    });
    expect(request("gpt-5-nano")).not.toHaveProperty("reasoning_effort");
  });

  it("merges and saves settings by default", async () => {
    await withStorage(
      {
        provider: "openai",
        model: "gpt-5.6-luna",
        apiKey: "sk-test",
      },
      async (store) => {
        await saveSettings({ summaryFormat: "bullets" });

        expect(store).toMatchObject({
          provider: "openai",
          model: "gpt-5.6-luna",
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
        model: "gpt-5.6-luna",
        apiKey: "sk-test",
      },
      async (store) => {
        await saveSettings(
          {
            provider: "grok",
            model: "grok-4.20-non-reasoning",
            apiKey: "xai-test",
          },
          { merge: false },
        );

        expect(store).toMatchObject({
          provider: "grok",
          model: "grok-4.20-non-reasoning",
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
          model: "gpt-5.6-luna",
          apiKey: "sk-test",
        }),
      ).rejects.toThrow("Storage set failed");
    });
  });
});
