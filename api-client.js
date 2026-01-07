import { CONFIG, getProviderConfig } from "./constants.js";
import { loadSettings, saveSettings } from "./modules/settings-store.js";
import {
  buildChunkPrompt,
  buildSynthesisPrompt,
  getSummaryPrompt,
} from "./modules/prompts.js";

const DEFAULT_SYSTEM_PROMPT =
  "You are a helpful assistant that creates concise, accurate summaries of articles.";

const PROVIDER_ADAPTERS = {
  openai: {
    buildRequest: ({ prompt, model, maxTokens, providerConfig }) => {
      const requestBody = {
        model: model,
        max_completion_tokens: maxTokens,
        messages: [{ role: "user", content: prompt }],
      };
      const temperature = providerConfig.temperature;
      if (!model.startsWith("gpt-5") && typeof temperature === "number") {
        requestBody.temperature = temperature;
      }
      return requestBody;
    },
    headers: ({ apiKey }) => ({
      Authorization: `Bearer ${apiKey}`,
    }),
    apiUrl: ({ providerConfig }) => providerConfig.apiUrl,
    parseResponse: (data) => {
      if (data.choices && data.choices.length > 0) {
        return data.choices[0].message.content;
      }
      return null;
    },
  },
  anthropic: {
    buildRequest: ({ prompt, model, maxTokens }) => ({
      model: model,
      max_tokens: maxTokens,
      messages: [{ role: "user", content: prompt }],
      system: DEFAULT_SYSTEM_PROMPT,
    }),
    headers: ({ apiKey }) => ({
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    }),
    apiUrl: ({ providerConfig }) => providerConfig.apiUrl,
    parseResponse: (data) => {
      if (data.content && data.content.length > 0) {
        return data.content[0].text;
      }
      return null;
    },
  },
  gemini: {
    buildRequest: ({ prompt, model, maxTokens, providerConfig }) => ({
      contents: [
        {
          parts: [{ text: prompt }],
        },
      ],
      generationConfig: {
        maxOutputTokens:
          maxTokens || providerConfig.models[model]?.maxTokens || 8192,
        temperature: 0.7,
      },
    }),
    headers: () => ({}),
    apiUrl: ({ providerConfig, model, apiKey }) =>
      `${providerConfig.apiUrl}/${model}:generateContent?key=${apiKey}`,
    parseResponse: (data) => {
      if (data.candidates && data.candidates.length > 0) {
        const candidate = data.candidates[0];
        if (
          candidate.content &&
          candidate.content.parts &&
          candidate.content.parts.length > 0
        ) {
          return candidate.content.parts[0].text;
        }
      }
      return null;
    },
  },
  grok: {
    buildRequest: ({ prompt, model, maxTokens }) => ({
      model: model,
      max_tokens: maxTokens,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.7,
    }),
    headers: ({ apiKey }) => ({
      Authorization: `Bearer ${apiKey}`,
    }),
    apiUrl: ({ providerConfig }) => providerConfig.apiUrl,
    parseResponse: (data) => {
      if (data.choices && data.choices.length > 0) {
        return data.choices[0].message.content;
      }
      return null;
    },
  },
};

const getProviderAdapter = (provider) => {
  const adapter = PROVIDER_ADAPTERS[provider];
  if (!adapter) {
    throw new Error(`Unsupported provider: ${provider}`);
  }
  return adapter;
};

class APIClient {
  constructor() {
    this.abortController = null;
  }

  // Get API configuration for a provider
  async getSettings() {
    return loadSettings();
  }

  // Get request headers for each provider
  getHeaders(provider, apiKey) {
    const adapter = getProviderAdapter(provider);
    return {
      "Content-Type": "application/json",
      ...adapter.headers({ apiKey }),
    };
  }

  // Get API URL for each provider
  getAPIURL(provider, model, apiKey) {
    const providerConfig = getProviderConfig(provider);
    if (!providerConfig) {
      throw new Error(`Unsupported provider: ${provider}`);
    }
    const adapter = getProviderAdapter(provider);
    return adapter.apiUrl({ providerConfig, model, apiKey });
  }

  // Parse response based on provider
  parseResponse(provider, data) {
    const adapter = getProviderAdapter(provider);
    const parsed = adapter.parseResponse(data);
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
    if (!content) return false;
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
        if (tail) chunks.push(tail);
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
  ) {
    try {
      const { provider, model, apiKey } = settings;
      const maxTokens =
        maxTokensOverride || providerConfig.models[model].maxTokens;
      const adapter = getProviderAdapter(provider);
      const requestBody = adapter.buildRequest({
        prompt,
        model,
        maxTokens,
        providerConfig,
      });

      this.abortController = new AbortController();
      const timeoutId = setTimeout(() => {
        this.abortController.abort();
      }, CONFIG.TIMEOUT_MS);

      const response = await fetch(this.getAPIURL(provider, model, apiKey), {
        method: "POST",
        headers: this.getHeaders(provider, apiKey),
        body: JSON.stringify(requestBody),
        signal: this.abortController.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.error?.message || `API request failed: ${response.status}`,
        );
      }

      const data = await response.json();
      return this.parseResponse(provider, data);
    } catch (error) {
      if (error.name === "AbortError") {
        throw new Error(CONFIG.ERRORS.TIMEOUT);
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
        );
      }

      throw new Error(error.message || CONFIG.ERRORS.API_CALL_FAILED);
    }
  }

  async summarizeWithChunking(
    content,
    settings,
    providerConfig,
    promptContext = {},
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
      return this.requestSummary(prompt, settings, providerConfig, maxTokens);
    }

    const wordCount =
      CONFIG.SUMMARY_LENGTHS[settings.summaryLength]?.words || 200;
    const targetWords = Math.max(
      80,
      Math.round(wordCount / Math.min(chunks.length, 6)),
    );
    const chunkMaxTokens = Math.min(1024, maxTokens);

    const chunkSummaries = [];
    for (let i = 0; i < chunks.length; i += 1) {
      const prompt = buildChunkPrompt(
        chunks[i],
        i + 1,
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
    );
  }

  // Main API call with chunking support
  async callAPI(content, promptContext = {}) {
    const settings = await this.getSettings();
    const { provider, model, apiKey, summaryLength, summaryFormat } = settings;

    if (!apiKey) {
      throw new Error(CONFIG.ERRORS.NO_API_KEY);
    }

    const providerConfig = getProviderConfig(provider);
    if (!providerConfig) {
      return this.legacyOpenAICall(
        content,
        apiKey,
        summaryLength,
        summaryFormat,
      );
    }

    let resolvedModel = model;
    if (!providerConfig.models[resolvedModel]) {
      const availableModels = Object.keys(providerConfig.models);
      if (availableModels.length === 0) {
        throw new Error(`No models available for provider: ${provider}`);
      }
      resolvedModel = availableModels[0];
      await saveSettings(
        { ...settings, model: resolvedModel },
        { merge: false },
      );
    }

    const resolvedSettings = { ...settings, model: resolvedModel };
    const maxTokens = providerConfig.models[resolvedModel].maxTokens;

    if (this.shouldChunkContent(content, maxTokens)) {
      return this.summarizeWithChunking(
        content,
        resolvedSettings,
        providerConfig,
        promptContext,
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
    );
  }

  // Cancel ongoing API call
  cancelRequest() {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }

  // Legacy OpenAI call for backward compatibility
  async legacyOpenAICall(
    content,
    apiKey,
    summaryLength = "STANDARD",
    summaryFormat = "paragraph",
  ) {
    const prompt = getSummaryPrompt(content, summaryLength, summaryFormat);

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-5-mini",
        max_completion_tokens: 8192,
        messages: [{ role: "user", content: prompt }],
      }),
      signal: AbortSignal.timeout(CONFIG.TIMEOUT_MS),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        errorData.error?.message || `API request failed: ${response.status}`,
      );
    }

    const data = await response.json();

    if (data.choices && data.choices.length > 0) {
      return data.choices[0].message.content;
    }

    throw new Error("No response from OpenAI API");
  }

  // Test API key validity
  async testAPIKey(provider, apiKey, model) {
    const testPrompt = "Test";
    const providerConfig = getProviderConfig(provider);

    if (!providerConfig) {
      return { ok: false, errorMessage: `Unsupported provider: ${provider}` };
    }

    let resolvedModel = model;
    if (!providerConfig.models[resolvedModel]) {
      const availableModels = Object.keys(providerConfig.models);
      if (availableModels.length === 0) {
        return {
          ok: false,
          errorMessage: `No models available for provider: ${provider}`,
        };
      }
      resolvedModel = availableModels[0];
    }

    try {
      const adapter = getProviderAdapter(provider);
      const requestBody = adapter.buildRequest({
        prompt: testPrompt,
        model: resolvedModel,
        maxTokens: 10,
        providerConfig,
      });

      const response = await fetch(
        this.getAPIURL(provider, resolvedModel, apiKey),
        {
          method: "POST",
          headers: this.getHeaders(provider, apiKey),
          body: JSON.stringify(requestBody),
          signal: AbortSignal.timeout(5000), // 5 second timeout for test
        },
      );

      if (!response.ok) {
        let errorMessage = `API request failed: ${response.status}`;
        const errorData = await response.json().catch(() => ({}));
        errorMessage =
          errorData.error?.message || errorData.message || errorMessage;
        return { ok: false, errorMessage };
      }

      return { ok: true };
    } catch (error) {
      console.error("API key test failed:", error);
      return {
        ok: false,
        errorMessage: error.message || "API key test failed.",
      };
    }
  }
}

export default APIClient;
