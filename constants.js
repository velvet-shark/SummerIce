// Configuration constants
export const CONFIG = {
  // Timing constants
  TIMEOUT_MS: 25000,
  CACHE_TTL_HOURS: 24,
  RETRY_ATTEMPTS: 3,
  RETRY_DELAY_BASE: 1000, // Base delay for exponential backoff

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
    OVERLAP_MAX_CHARS: 1200
  },

  // Summary options
  SUMMARY_LENGTHS: {
    BRIEF: { words: 100, label: "Brief" },
    STANDARD: { words: 200, label: "Standard" },
    DETAILED: { words: 400, label: "Detailed" }
  },

  SUMMARY_FORMATS: {
    PARAGRAPH: "paragraph",
    BULLETS: "bullets"
  },

  // LLM Provider configurations
  // Verify model IDs against provider docs before changing:
  // - https://platform.openai.com/docs/models
  // - https://platform.claude.com/docs/en/about-claude/models/overview
  // - https://ai.google.dev/gemini-api/docs/models
  // - https://docs.x.ai/docs/models
  LLM_PROVIDERS: {
    OPENAI: {
      id: "openai",
      name: "OpenAI",
      models: {
        "gpt-5-mini": { name: "GPT-5 Mini", maxTokens: 8192 },
        "gpt-5-nano": { name: "GPT-5 Nano", maxTokens: 4096 }
      },
      apiUrl: "https://api.openai.com/v1/chat/completions",
      temperature: 0.7,
      keyPrefix: "sk-"
    },
    ANTHROPIC: {
      id: "anthropic",
      name: "Anthropic",
      models: {
        "claude-haiku-4-5-20251001": { name: "Claude Haiku 4.5", maxTokens: 8192 }
      },
      apiUrl: "https://api.anthropic.com/v1/messages",
      keyPrefix: "sk-ant-"
    },
    GEMINI: {
      id: "gemini",
      name: "Google Gemini",
      models: {
        "gemini-3-flash-preview": { name: "Gemini 3 Flash Preview", maxTokens: 8192 }
      },
      apiUrl: "https://generativelanguage.googleapis.com/v1beta/models",
      keyPrefix: "AI"
    },
    GROK: {
      id: "grok",
      name: "xAI Grok",
      models: {
        "grok-4-fast-reasoning": { name: "Grok 4 Fast", maxTokens: 4096 }
      },
      apiUrl: "https://api.x.ai/v1/chat/completions",
      keyPrefix: "xai-"
    }
  },

  // Default settings
  DEFAULTS: {
    provider: "openai",
    model: "gpt-5-mini",
    summaryLength: "STANDARD",
    summaryFormat: "paragraph"
  },

  // Error messages
  ERRORS: {
    NO_API_KEY: "API key not found. Please configure your API key in settings.",
    INVALID_API_KEY: "Invalid API key format. Please check your API key.",
    CONTENT_TOO_SHORT: "Page content is too short to summarize (minimum 500 characters).",
    CONTENT_EXTRACTION_FAILED: "Could not extract readable content from this page.",
    API_CALL_FAILED: "Failed to generate summary. Please try again.",
    TIMEOUT: "Summary generation timed out. Please try again.",
    UNSUPPORTED_PAGE: "Cannot summarize this page. Try a different website.",
    NETWORK_ERROR: "Network error. Please check your connection and try again."
  }
};

// Utility functions for configuration
export const getProviderConfig = (providerId) => {
  return CONFIG.LLM_PROVIDERS[providerId.toUpperCase()];
};

export const validateApiKey = (providerId, apiKey) => {
  const provider = getProviderConfig(providerId);
  if (!provider || !apiKey) return false;
  return apiKey.startsWith(provider.keyPrefix);
};

export const getSummaryPrompt = (content, length, format) => {
  const wordCount = CONFIG.SUMMARY_LENGTHS[length]?.words || 200;
  const formatInstruction =
    format === "bullets"
      ? "Format the summary as clear bullet points."
      : "Format the summary in well-structured paragraphs.";

  return `Provide a concise summary of the article below. The summary should be around ${wordCount} words and capture the essential information while preserving the original meaning and context. ${formatInstruction} Avoid including minor details or tangential information. The goal is to provide a quick, informative overview of the article's core content.

Do not include any intro text, e.g. 'Here is a concise summary of the article', get straight to the summary.

Article:
---
${content}
---`;
};
