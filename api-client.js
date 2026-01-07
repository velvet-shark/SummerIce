import { CONFIG, getProviderConfig, getSummaryPrompt } from "./constants.js";

class APIClient {
  constructor() {
    this.abortController = null;
  }

  // Get API configuration for a provider
  async getSettings() {
    return new Promise((resolve) => {
      chrome.storage.local.get(
        [
          "provider",
          "model",
          "apiKey",
          "summaryLength",
          "summaryFormat",
          "youtubeTranscriptMode",
        ],
        (result) => {
          const provider = result.provider || CONFIG.DEFAULTS.provider;
          const providerConfig = getProviderConfig(provider);

          // For existing users, if they have an API key but no model set,
          // use the first available model for their provider
          let model = result.model || CONFIG.DEFAULTS.model;

          // Validate that the model exists for the current provider
          if (
            providerConfig &&
            providerConfig.models &&
            !providerConfig.models[model]
          ) {
            // Use the first available model for this provider
            const availableModels = Object.keys(providerConfig.models);
            if (availableModels.length > 0) {
              model = availableModels[0];
            }
          }

          resolve({
            provider: provider,
            model: model,
            apiKey: result.apiKey || "",
            summaryLength:
              result.summaryLength || CONFIG.DEFAULTS.summaryLength,
            summaryFormat:
              result.summaryFormat || CONFIG.DEFAULTS.summaryFormat,
            youtubeTranscriptMode:
              result.youtubeTranscriptMode ||
              CONFIG.DEFAULTS.youtubeTranscriptMode,
          });
        },
      );
    });
  }

  // Create request payload for OpenAI
  createOpenAIRequest(prompt, model, maxTokens) {
    const requestBody = {
      model: model,
      max_completion_tokens: maxTokens,
      messages: [{ role: "user", content: prompt }],
    };
    const temperature = CONFIG.LLM_PROVIDERS.OPENAI.temperature;
    if (!model.startsWith("gpt-5") && typeof temperature === "number") {
      requestBody.temperature = temperature;
    }
    return requestBody;
  }

  // Create request payload for Anthropic
  createAnthropicRequest(prompt, model, maxTokens) {
    return {
      model: model,
      max_tokens: maxTokens,
      messages: [{ role: "user", content: prompt }],
      system:
        "You are a helpful assistant that creates concise, accurate summaries of articles.",
    };
  }

  // Create request payload for Gemini
  createGeminiRequest(prompt, model, maxTokens) {
    return {
      contents: [
        {
          parts: [{ text: prompt }],
        },
      ],
      generationConfig: {
        maxOutputTokens:
          maxTokens ||
          CONFIG.LLM_PROVIDERS.GEMINI.models[model]?.maxTokens ||
          8192,
        temperature: 0.7,
      },
    };
  }

  // Create request payload for Grok
  createGrokRequest(prompt, model, maxTokens) {
    return {
      model: model,
      max_tokens: maxTokens,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.7,
    };
  }

  // Get request headers for each provider
  getHeaders(provider, apiKey) {
    const headers = {
      "Content-Type": "application/json",
    };

    switch (provider) {
      case "openai":
        headers["Authorization"] = `Bearer ${apiKey}`;
        break;
      case "anthropic":
        headers["x-api-key"] = apiKey;
        headers["anthropic-version"] = "2023-06-01";
        headers["anthropic-dangerous-direct-browser-access"] = "true";
        break;
      case "gemini":
        // Gemini uses API key in URL, not headers
        break;
      case "grok":
        headers["Authorization"] = `Bearer ${apiKey}`;
        break;
    }

    return headers;
  }

  // Get API URL for each provider
  getAPIURL(provider, model, apiKey) {
    const providerConfig = getProviderConfig(provider);
    if (!providerConfig) {
      throw new Error(`Unsupported provider: ${provider}`);
    }

    switch (provider) {
      case "gemini":
        return `${providerConfig.apiUrl}/${model}:generateContent?key=${apiKey}`;
      default:
        return providerConfig.apiUrl;
    }
  }

  // Parse response based on provider
  parseResponse(provider, data) {
    switch (provider) {
      case "openai":
      case "grok":
        if (data.choices && data.choices.length > 0) {
          return data.choices[0].message.content;
        }
        break;
      case "anthropic":
        if (data.content && data.content.length > 0) {
          return data.content[0].text;
        }
        break;
      case "gemini":
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
        break;
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

  buildChunkPrompt(
    chunk,
    chunkIndex,
    totalChunks,
    targetWords,
    summaryFormat,
    promptContext = {},
  ) {
    const formatInstruction =
      summaryFormat === "bullets"
        ? "Format the summary as clear bullet points."
        : "Format the summary in concise paragraphs.";
    const sourceType = promptContext.sourceType || "article";
    const subjectLabel =
      sourceType === "video" ? "video transcript" : "article";
    const titleLine = promptContext.title
      ? `Title: ${promptContext.title}\n`
      : "";

    return `Summarize the section below from a longer ${subjectLabel}. Keep the key facts and context. Target about ${targetWords} words. ${formatInstruction}

Do not include any intro text. This is section ${chunkIndex} of ${totalChunks}.

Section:
---
${titleLine}${chunk}
---`;
  }

  buildSynthesisPrompt(
    chunkSummaries,
    length,
    summaryFormat,
    promptContext = {},
  ) {
    const wordCount = CONFIG.SUMMARY_LENGTHS[length]?.words || 200;
    const formatInstruction =
      summaryFormat === "bullets"
        ? "Format the summary as clear bullet points."
        : "Format the summary in well-structured paragraphs.";
    const sourceType = promptContext.sourceType || "article";
    const subjectLabel =
      sourceType === "video" ? "video transcript" : "article";

    return `The text below contains summaries of multiple sections from one long ${subjectLabel}. Synthesize them into a single coherent summary around ${wordCount} words. ${formatInstruction} Remove duplication and keep the most important points.

Do not include any intro text.

Section summaries:
---
${chunkSummaries}
---`;
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

      let requestBody;
      switch (provider) {
        case "openai":
          requestBody = this.createOpenAIRequest(prompt, model, maxTokens);
          break;
        case "anthropic":
          requestBody = this.createAnthropicRequest(prompt, model, maxTokens);
          break;
        case "gemini":
          requestBody = this.createGeminiRequest(prompt, model, maxTokens);
          break;
        case "grok":
          requestBody = this.createGrokRequest(prompt, model, maxTokens);
          break;
        default:
          throw new Error(`Unsupported provider: ${provider}`);
      }

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
      const prompt = this.buildChunkPrompt(
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
    const synthesisPrompt = this.buildSynthesisPrompt(
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
      chrome.storage.local.set({ model: resolvedModel });
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
      let requestBody;
      switch (provider) {
        case "openai":
          requestBody = this.createOpenAIRequest(testPrompt, resolvedModel, 10);
          break;
        case "anthropic":
          requestBody = this.createAnthropicRequest(
            testPrompt,
            resolvedModel,
            10,
          );
          break;
        case "gemini":
          requestBody = this.createGeminiRequest(testPrompt, resolvedModel, 10);
          requestBody.generationConfig.maxOutputTokens = 10;
          break;
        case "grok":
          requestBody = this.createGrokRequest(testPrompt, resolvedModel, 10);
          break;
        default:
          return {
            ok: false,
            errorMessage: `Unsupported provider: ${provider}`,
          };
      }

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
