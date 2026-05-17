const DEFAULT_SYSTEM_PROMPT =
  "You are a helpful assistant that creates concise, accurate summaries of articles.";

const PROVIDER_REGISTRY = {
  openai: {
    id: "openai",
    name: "OpenAI",
    keyPrefix: "sk-",
    apiUrl: "https://api.openai.com/v1/chat/completions",
    temperature: 0.7,
    ui: {
      description:
        "OpenAI's GPT-5.4 Mini and Nano models are current low-latency options tuned for cost-sensitive, high-volume text workloads.",
      links: [
        {
          kind: "apiKey",
          text: "OpenAI API Keys",
          url: "https://platform.openai.com/api-keys",
        },
        {
          kind: "signup",
          text: "Sign up for OpenAI",
          url: "https://platform.openai.com/signup",
        },
      ],
    },
    models: {
      "gpt-5.4-mini": { name: "GPT-5.4 Mini", maxTokens: 8192 },
      "gpt-5.4-nano": { name: "GPT-5.4 Nano", maxTokens: 4096 },
    },
    validateApiKey(apiKey) {
      return apiKey.startsWith(this.keyPrefix);
    },
    buildRequest({ prompt, model, maxTokens, providerConfig }) {
      const requestBody = {
        model,
        max_completion_tokens: maxTokens,
        messages: [{ role: "user", content: prompt }],
      };
      const temperature = providerConfig.temperature;
      if (!model.startsWith("gpt-5") && typeof temperature === "number") {
        requestBody.temperature = temperature;
      }
      return requestBody;
    },
    getHeaders({ apiKey }) {
      return {
        Authorization: `Bearer ${apiKey}`,
      };
    },
    getApiUrl({ providerConfig }) {
      return providerConfig.apiUrl;
    },
    parseResponse(data) {
      if (data.choices && data.choices.length > 0) {
        return data.choices[0].message.content;
      }
      return null;
    },
  },
  anthropic: {
    id: "anthropic",
    name: "Anthropic",
    keyPrefix: "sk-ant-",
    apiUrl: "https://api.anthropic.com/v1/messages",
    ui: {
      description:
        "Claude Haiku 4.5 is Anthropic's fast, lightweight text model and remains the cheapest fit in Claude's lineup for short summaries.",
      links: [
        {
          kind: "apiKey",
          text: "Anthropic Console",
          url: "https://console.anthropic.com/",
        },
      ],
    },
    models: {
      "claude-haiku-4-5": {
        name: "Claude Haiku 4.5",
        maxTokens: 8192,
      },
    },
    validateApiKey(apiKey) {
      return apiKey.startsWith(this.keyPrefix);
    },
    buildRequest({ prompt, model, maxTokens }) {
      return {
        model,
        max_tokens: maxTokens,
        messages: [{ role: "user", content: prompt }],
        system: DEFAULT_SYSTEM_PROMPT,
      };
    },
    getHeaders({ apiKey }) {
      return {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      };
    },
    getApiUrl({ providerConfig }) {
      return providerConfig.apiUrl;
    },
    parseResponse(data) {
      if (data.content && data.content.length > 0) {
        return data.content[0].text;
      }
      return null;
    },
  },
  gemini: {
    id: "gemini",
    name: "Google Gemini",
    keyPrefix: "AI",
    apiUrl: "https://generativelanguage.googleapis.com/v1beta/models",
    ui: {
      description:
        "Gemini 2.5 Flash-Lite is Google's budget-speed sweet spot, with Gemini 2.5 Flash available as the higher-quality step up.",
      links: [
        {
          kind: "apiKey",
          text: "Google AI Studio",
          url: "https://aistudio.google.com/app/apikey",
        },
        {
          kind: "signup",
          text: "Sign up for Google Gemini",
          url: "https://aistudio.google.com/",
        },
      ],
    },
    models: {
      "gemini-2.5-flash-lite": {
        name: "Gemini 2.5 Flash-Lite",
        maxTokens: 8192,
      },
      "gemini-2.5-flash": {
        name: "Gemini 2.5 Flash",
        maxTokens: 8192,
      },
    },
    validateApiKey(apiKey) {
      return apiKey.startsWith(this.keyPrefix);
    },
    buildRequest({ prompt, model, maxTokens, providerConfig }) {
      return {
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
      };
    },
    getHeaders() {
      return {};
    },
    getApiUrl({ providerConfig, model, apiKey }) {
      return `${providerConfig.apiUrl}/${model}:generateContent?key=${apiKey}`;
    },
    parseResponse(data) {
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
    id: "grok",
    name: "xAI Grok",
    keyPrefix: "xai-",
    apiUrl: "https://api.x.ai/v1/chat/completions",
    ui: {
      description:
        "Grok 4.20 Non-Reasoning is xAI's recommended non-reasoning model and the default fit for fast summarization. Grok 4.3 remains available for heavier reasoning workloads.",
      links: [
        {
          kind: "apiKey",
          text: "xAI Console",
          url: "https://console.x.ai/",
        },
      ],
    },
    models: {
      "grok-4.20-non-reasoning": {
        name: "Grok 4.20 Non-Reasoning",
        maxTokens: 4096,
      },
      "grok-4.3": {
        name: "Grok 4.3",
        maxTokens: 4096,
      },
    },
    validateApiKey(apiKey) {
      return apiKey.startsWith(this.keyPrefix);
    },
    buildRequest({ prompt, model, maxTokens }) {
      return {
        model,
        max_tokens: maxTokens,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.7,
      };
    },
    getHeaders({ apiKey }) {
      return {
        Authorization: `Bearer ${apiKey}`,
      };
    },
    getApiUrl({ providerConfig }) {
      return providerConfig.apiUrl;
    },
    parseResponse(data) {
      if (data.choices && data.choices.length > 0) {
        return data.choices[0].message.content;
      }
      return null;
    },
  },
};

const LEGACY_PROVIDER_MAP = Object.fromEntries(
  Object.values(PROVIDER_REGISTRY).map((providerConfig) => [
    providerConfig.id.toUpperCase(),
    providerConfig,
  ]),
);

// Configuration constants
export const CONFIG = {
  // Timing constants
  TIMEOUT_MS: 25000,
  CACHE_TTL_HOURS: 24,
  RETRY_ATTEMPTS: 3,
  RETRY_DELAY_BASE: 1000,

  // Content extraction constants
  MIN_CONTENT_LENGTH: 500,
  MAX_CONTENT_LENGTH: 50000,
  CHUNKING: {
    TOKEN_CHAR_RATIO: 4,
    OUTPUT_TOKEN_RESERVE: 1200,
    PROMPT_TOKEN_OVERHEAD: 600,
    MIN_CONTENT_TOKENS: 800,
    MAX_CHUNKS: 12,
    OVERLAP_RATIO: 0.08,
    OVERLAP_MAX_CHARS: 1200,
  },

  // Summary options
  SUMMARY_LENGTHS: {
    BRIEF: { words: 100, label: "Brief" },
    STANDARD: { words: 200, label: "Standard" },
    DETAILED: { words: 400, label: "Detailed" },
  },

  SUMMARY_FORMATS: {
    PARAGRAPH: "paragraph",
    BULLETS: "bullets",
  },

  // LLM Provider configurations
  // Verify model IDs against provider docs before changing:
  // - https://platform.openai.com/docs/models
  // - https://platform.claude.com/docs/en/about-claude/models/overview
  // - https://ai.google.dev/gemini-api/docs/models
  // - https://docs.x.ai/docs/models
  LLM_PROVIDERS: LEGACY_PROVIDER_MAP,

  // Default settings
  DEFAULTS: {
    provider: "openai",
    model: "gpt-5.4-mini",
    summaryLength: "STANDARD",
    summaryFormat: "paragraph",
    youtubeTranscriptMode: "auto",
  },

  // Error messages
  ERRORS: {
    NO_API_KEY: "API key not found. Please configure your API key in settings.",
    INVALID_API_KEY: "Invalid API key format. Please check your API key.",
    CONTENT_TOO_SHORT:
      "Page content is too short to summarize (minimum 500 characters).",
    CONTENT_EXTRACTION_FAILED:
      "Could not extract readable content from this page.",
    API_CALL_FAILED: "Failed to generate summary. Please try again.",
    TIMEOUT: "Summary generation timed out. Please try again.",
    REQUEST_CANCELLED: "Summary request cancelled.",
    UNSUPPORTED_PAGE: "Cannot summarize this page. Try a different website.",
    NETWORK_ERROR: "Network error. Please check your connection and try again.",
    YOUTUBE_TRANSCRIPT_UNAVAILABLE:
      "No transcript available for this YouTube video.",
    NON_HTML_CONTENT: "Cannot process non-HTML content",
  },
};

export const getProviderConfig = (providerId) => {
  if (!providerId) {
    return undefined;
  }

  return PROVIDER_REGISTRY[String(providerId).toLowerCase()];
};

export const getProviderConfigs = () => Object.values(PROVIDER_REGISTRY);

export const resolveProviderModel = (providerId, requestedModel) => {
  const providerConfig = getProviderConfig(providerId);
  if (!providerConfig) {
    return {
      providerConfig: getProviderConfig(CONFIG.DEFAULTS.provider),
      model: CONFIG.DEFAULTS.model,
    };
  }

  if (requestedModel && providerConfig.models[requestedModel]) {
    return { providerConfig, model: requestedModel };
  }

  const firstModel = Object.keys(providerConfig.models)[0] || null;
  return { providerConfig, model: firstModel };
};

export const validateProviderApiKey = (providerId, apiKey) => {
  const providerConfig = getProviderConfig(providerId);
  if (!providerConfig) {
    return {
      ok: false,
      errorMessage: `Unsupported provider: ${providerId}`,
    };
  }

  const normalizedApiKey = typeof apiKey === "string" ? apiKey.trim() : "";
  if (!normalizedApiKey) {
    return {
      ok: false,
      errorMessage: CONFIG.ERRORS.NO_API_KEY,
    };
  }

  if (
    typeof providerConfig.validateApiKey === "function" &&
    !providerConfig.validateApiKey(normalizedApiKey)
  ) {
    return {
      ok: false,
      errorMessage: CONFIG.ERRORS.INVALID_API_KEY,
    };
  }

  return {
    ok: true,
    apiKey: normalizedApiKey,
  };
};

export const getProviderUiData = (providerId) => {
  const providerConfig = getProviderConfig(providerId);
  const links = Array.isArray(providerConfig?.ui?.links)
    ? providerConfig.ui.links
    : [];

  return {
    providerConfig,
    description: providerConfig?.ui?.description || "",
    links,
    apiKeyPlaceholder: providerConfig ? `${providerConfig.keyPrefix}...` : "",
  };
};

export const getProviderApiKeyLink = (providerId) => {
  const { links } = getProviderUiData(providerId);
  return links.find((link) => link.kind === "apiKey") || null;
};
