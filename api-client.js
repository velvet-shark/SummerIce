import {
  CONFIG,
  getProviderConfig,
  resolveProviderModel,
  validateProviderApiKey,
} from "./constants.js";
import { loadSettings, saveSettings } from "./modules/settings-store.js";
import {
  buildChunkPrompt,
  buildSynthesisPrompt,
  getSummaryPrompt,
} from "./modules/prompts.js";

const assertNotAborted = (signal) => {
  if (signal?.aborted) {
    throw new Error(CONFIG.ERRORS.REQUEST_CANCELLED);
  }
};

class APIClient {
  async getSettings() {
    return loadSettings();
  }

  getHeaders(providerConfig, apiKey) {
    return {
      "Content-Type": "application/json",
      ...providerConfig.getHeaders({ apiKey }),
    };
  }

  getAPIURL(providerConfig, model, apiKey) {
    return providerConfig.getApiUrl({ providerConfig, model, apiKey });
  }

  parseResponse(providerConfig, data) {
    const parsed = providerConfig.parseResponse(data);
    if (parsed) {
      return parsed;
    }

    throw new Error("Invalid response format from API");
  }

  estimateMaxContentChars(maxTokens) {
    const chunkConfig = CONFIG.CHUNKING;
    const availableTokens = Math.max(
      chunkConfig.MIN_CONTENT_TOKENS,
      maxTokens -
        chunkConfig.OUTPUT_TOKEN_RESERVE -
        chunkConfig.PROMPT_TOKEN_OVERHEAD,
    );
    return availableTokens * chunkConfig.TOKEN_CHAR_RATIO;
  }

  shouldChunkContent(content, maxTokens) {
    if (!content) {
      return false;
    }

    const maxChars = this.estimateMaxContentChars(maxTokens);
    return content.length > maxChars;
  }

  splitContentIntoChunks(content, maxChunkChars, overlapChars) {
    if (!content || content.length <= maxChunkChars) {
      return [content.trim()];
    }

    const chunks = [];
    let start = 0;
    const maxChunks = CONFIG.CHUNKING.MAX_CHUNKS;

    const findBoundary = (slice) => {
      const candidates = [
        slice.lastIndexOf("\n\n"),
        slice.lastIndexOf(". "),
        slice.lastIndexOf("? "),
        slice.lastIndexOf("! "),
        slice.lastIndexOf("\n"),
      ];
      return Math.max(...candidates);
    };

    while (start < content.length) {
      if (chunks.length >= maxChunks - 1) {
        const tail = content.slice(start).trim();
        if (tail) {
          chunks.push(tail);
        }
        break;
      }

      const end = Math.min(start + maxChunkChars, content.length);
      const slice = content.slice(start, end);
      const boundary = findBoundary(slice);
      const boundaryOffset =
        boundary > Math.floor(maxChunkChars * 0.5)
          ? boundary + 1
          : slice.length;
      const actualEnd = start + boundaryOffset;
      const chunkText = content.slice(start, actualEnd).trim();

      if (!chunkText) {
        break;
      }

      chunks.push(chunkText);

      let nextStart = actualEnd - overlapChars;
      if (nextStart <= start) {
        nextStart = actualEnd;
      }
      start = nextStart;
    }

    return chunks;
  }

  async requestSummary(
    prompt,
    settings,
    providerConfig,
    maxTokensOverride,
    retryCount = 0,
    { signal } = {},
  ) {
    assertNotAborted(signal);

    const { model, apiKey } = settings;
    const maxTokens =
      maxTokensOverride || providerConfig.models[model].maxTokens;
    const requestBody = providerConfig.buildRequest({
      prompt,
      model,
      maxTokens,
      providerConfig,
    });

    const requestController = new AbortController();
    let timedOut = false;
    const abortRequest = () => requestController.abort();
    signal?.addEventListener("abort", abortRequest, { once: true });
    const timeoutId = setTimeout(() => {
      timedOut = true;
      requestController.abort();
    }, CONFIG.TIMEOUT_MS);

    try {
      const response = await fetch(
        this.getAPIURL(providerConfig, model, apiKey),
        {
          method: "POST",
          headers: this.getHeaders(providerConfig, apiKey),
          body: JSON.stringify(requestBody),
          signal: requestController.signal,
        },
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.error?.message ||
            errorData.message ||
            `API request failed: ${response.status}`,
        );
      }

      const data = await response.json();
      return this.parseResponse(providerConfig, data);
    } catch (error) {
      if (requestController.signal.aborted) {
        if (signal?.aborted) {
          throw new Error(CONFIG.ERRORS.REQUEST_CANCELLED);
        }
        if (timedOut) {
          throw new Error(CONFIG.ERRORS.TIMEOUT);
        }
      }

      if (retryCount < CONFIG.RETRY_ATTEMPTS - 1) {
        const delay = CONFIG.RETRY_DELAY_BASE * Math.pow(2, retryCount);
        await new Promise((resolve) => setTimeout(resolve, delay));
        return this.requestSummary(
          prompt,
          settings,
          providerConfig,
          maxTokensOverride,
          retryCount + 1,
          { signal },
        );
      }

      throw new Error(error.message || CONFIG.ERRORS.API_CALL_FAILED);
    } finally {
      clearTimeout(timeoutId);
      signal?.removeEventListener("abort", abortRequest);
    }
  }

  async summarizeWithChunking(
    content,
    settings,
    providerConfig,
    promptContext = {},
    options = {},
  ) {
    const maxTokens = providerConfig.models[settings.model].maxTokens;
    const maxChunkChars = this.estimateMaxContentChars(maxTokens);
    const overlapChars = Math.min(
      CONFIG.CHUNKING.OVERLAP_MAX_CHARS,
      Math.floor(maxChunkChars * CONFIG.CHUNKING.OVERLAP_RATIO),
    );
    const chunks = this.splitContentIntoChunks(
      content,
      maxChunkChars,
      overlapChars,
    );

    if (chunks.length <= 1) {
      const prompt = getSummaryPrompt(
        content,
        settings.summaryLength,
        settings.summaryFormat,
        promptContext,
      );
      return this.requestSummary(
        prompt,
        settings,
        providerConfig,
        maxTokens,
        0,
        options,
      );
    }

    const wordCount =
      CONFIG.SUMMARY_LENGTHS[settings.summaryLength]?.words || 200;
    const targetWords = Math.max(
      80,
      Math.round(wordCount / Math.min(chunks.length, 6)),
    );
    const chunkMaxTokens = Math.min(1024, maxTokens);

    const chunkSummaries = [];
    for (let index = 0; index < chunks.length; index += 1) {
      assertNotAborted(options.signal);
      const prompt = buildChunkPrompt(
        chunks[index],
        index + 1,
        chunks.length,
        targetWords,
        settings.summaryFormat,
        promptContext,
      );
      const summary = await this.requestSummary(
        prompt,
        settings,
        providerConfig,
        chunkMaxTokens,
        0,
        options,
      );
      chunkSummaries.push(summary.trim());
    }

    const combinedSummaries = chunkSummaries.filter(Boolean).join("\n\n");
    const synthesisPrompt = buildSynthesisPrompt(
      combinedSummaries,
      settings.summaryLength,
      settings.summaryFormat,
      promptContext,
    );
    return this.requestSummary(
      synthesisPrompt,
      settings,
      providerConfig,
      maxTokens,
      0,
      options,
    );
  }

  async callAPI(content, { promptContext = {}, settings = null, signal } = {}) {
    const loadedSettings = settings || (await this.getSettings());
    const { provider, apiKey, summaryLength, summaryFormat } = loadedSettings;

    const apiKeyValidation = validateProviderApiKey(provider, apiKey);
    if (!apiKeyValidation.ok) {
      throw new Error(apiKeyValidation.errorMessage);
    }

    const { providerConfig, model } = resolveProviderModel(
      provider,
      loadedSettings.model,
    );
    if (!providerConfig || !model) {
      throw new Error(`Unsupported provider: ${provider}`);
    }

    const resolvedSettings = {
      ...loadedSettings,
      apiKey: apiKeyValidation.apiKey,
      model,
    };

    if (model !== loadedSettings.model) {
      await saveSettings({ ...resolvedSettings }, { merge: false });
    }

    const maxTokens = providerConfig.models[model].maxTokens;
    const requestOptions = { signal };

    if (this.shouldChunkContent(content, maxTokens)) {
      return this.summarizeWithChunking(
        content,
        resolvedSettings,
        providerConfig,
        promptContext,
        requestOptions,
      );
    }

    const prompt = getSummaryPrompt(
      content,
      summaryLength,
      summaryFormat,
      promptContext,
    );
    return this.requestSummary(
      prompt,
      resolvedSettings,
      providerConfig,
      maxTokens,
      0,
      requestOptions,
    );
  }

  async testAPIKey(provider, apiKey, model) {
    const providerConfig = getProviderConfig(provider);
    if (!providerConfig) {
      return { ok: false, errorMessage: `Unsupported provider: ${provider}` };
    }

    const apiKeyValidation = validateProviderApiKey(provider, apiKey);
    if (!apiKeyValidation.ok) {
      return apiKeyValidation;
    }

    const resolved = resolveProviderModel(provider, model);
    if (!resolved.providerConfig || !resolved.model) {
      return {
        ok: false,
        errorMessage: `No models available for provider: ${provider}`,
      };
    }

    const requestController = new AbortController();
    const timeoutId = setTimeout(() => requestController.abort(), 5000);

    try {
      const requestBody = providerConfig.buildRequest({
        prompt: "Test",
        model: resolved.model,
        maxTokens: 10,
        providerConfig,
      });

      const response = await fetch(
        this.getAPIURL(providerConfig, resolved.model, apiKeyValidation.apiKey),
        {
          method: "POST",
          headers: this.getHeaders(providerConfig, apiKeyValidation.apiKey),
          body: JSON.stringify(requestBody),
          signal: requestController.signal,
        },
      );

      if (!response.ok) {
        let errorMessage = `API request failed: ${response.status}`;
        const errorData = await response.json().catch(() => ({}));
        errorMessage =
          errorData.error?.message || errorData.message || errorMessage;
        return { ok: false, errorMessage };
      }

      return { ok: true, model: resolved.model };
    } catch (error) {
      if (requestController.signal.aborted) {
        return { ok: false, errorMessage: CONFIG.ERRORS.TIMEOUT };
      }

      console.error("API key test failed:", error);
      return {
        ok: false,
        errorMessage: error.message || "API key test failed.",
      };
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

export default APIClient;
