import { getProviderConfig } from "../constants.js";

const PROVIDER_UI = {
  openai: {
    description:
      "OpenAI provides the GPT-5 Mini and Nano models, balancing strong reasoning with low latency and cost.",
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
  anthropic: {
    description:
      "Anthropic's Claude Sonnet 4.5 pairs fast responses with deeper reasoning and strong safety defaults for nuanced summaries.",
    links: [
      {
        kind: "apiKey",
        text: "Anthropic Console",
        url: "https://console.anthropic.com/",
      },
    ],
  },
  gemini: {
    description:
      "Google's Gemini 2.5 Flash Preview offers competitive performance with generous free tiers. Good for high-volume usage.",
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
  grok: {
    description:
      "xAI's Grok 4 Fast offers fresh reasoning with competitive latency and web-native context updates.",
    links: [
      {
        kind: "apiKey",
        text: "xAI Console",
        url: "https://console.x.ai/",
      },
    ],
  },
};

export const getProviderUiData = (providerId) => {
  const providerConfig = getProviderConfig(providerId);
  const entry = PROVIDER_UI[providerId] || {};

  return {
    providerConfig,
    description: entry.description || "",
    links: Array.isArray(entry.links) ? entry.links : [],
    apiKeyPlaceholder: providerConfig ? `${providerConfig.keyPrefix}...` : "",
  };
};

export const getProviderApiKeyLink = (providerId) => {
  const { links } = getProviderUiData(providerId);
  return links.find((link) => link.kind === "apiKey") || null;
};
