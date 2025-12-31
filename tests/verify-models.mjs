import fs from "node:fs";
import { CONFIG } from "../constants.js";

const REQUIRED_KEYS = {
  openai: "OPENAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  gemini: "GEMINI_API_KEY",
  grok: "GROK_API_KEY"
};

const TEST_PROMPT = "Test";
const TIMEOUT_MS = 8000;

const loadDotEnv = () => {
  const envPath = new URL("../.env", import.meta.url);
  if (!fs.existsSync(envPath)) {
    return;
  }

  const contents = fs.readFileSync(envPath, "utf8");
  contents.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      return;
    }
    const [rawKey, ...rest] = trimmed.split("=");
    if (!rawKey || rest.length === 0) {
      return;
    }
    const key = rawKey.trim();
    const rawValue = rest.join("=").trim();
    if (!key || key in process.env) {
      return;
    }
    const value = rawValue.replace(/^["']|["']$/g, "");
    process.env[key] = value;
  });
};

const timeout = (ms) =>
  new Promise((_, reject) =>
    setTimeout(() => reject(new Error(`Request timed out after ${ms}ms`)), ms)
  );

const parseErrorMessage = async (response) => {
  try {
    const data = await response.json();
    return data.error?.message || data.message || JSON.stringify(data);
  } catch (error) {
    const text = await response.text().catch(() => "");
    return text || `HTTP ${response.status}`;
  }
};

const buildRequest = (providerId, model, apiKey) => {
  switch (providerId) {
    case "openai": {
      return {
        url: CONFIG.LLM_PROVIDERS.OPENAI.apiUrl,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`
        },
        body: {
          model,
          max_completion_tokens: 10,
          messages: [{ role: "user", content: TEST_PROMPT }]
        }
      };
    }
    case "anthropic": {
      return {
        url: CONFIG.LLM_PROVIDERS.ANTHROPIC.apiUrl,
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true"
        },
        body: {
          model,
          max_tokens: 10,
          messages: [{ role: "user", content: TEST_PROMPT }]
        }
      };
    }
    case "gemini": {
      return {
        url: `${CONFIG.LLM_PROVIDERS.GEMINI.apiUrl}/${model}:generateContent?key=${apiKey}`,
        headers: {
          "Content-Type": "application/json"
        },
        body: {
          contents: [{ parts: [{ text: TEST_PROMPT }] }],
          generationConfig: {
            maxOutputTokens: 10,
            temperature: 0.7
          }
        }
      };
    }
    case "grok": {
      return {
        url: CONFIG.LLM_PROVIDERS.GROK.apiUrl,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`
        },
        body: {
          model,
          max_tokens: 10,
          messages: [{ role: "user", content: TEST_PROMPT }],
          temperature: 0.7
        }
      };
    }
    default:
      throw new Error(`Unsupported provider: ${providerId}`);
  }
};

const main = async () => {
  loadDotEnv();
  const missing = Object.values(REQUIRED_KEYS).filter((key) => !process.env[key]);
  if (missing.length > 0) {
    console.error("Missing required API keys:", missing.join(", "));
    console.error(
      "Set OPENAI_API_KEY, ANTHROPIC_API_KEY, GEMINI_API_KEY, GROK_API_KEY before running."
    );
    process.exit(1);
  }

  const failures = [];

  for (const providerConfig of Object.values(CONFIG.LLM_PROVIDERS)) {
    const providerId = providerConfig.id;
    const apiKey = process.env[REQUIRED_KEYS[providerId]];
    const modelIds = Object.keys(providerConfig.models);

    for (const model of modelIds) {
      const request = buildRequest(providerId, model, apiKey);
      try {
        const response = await Promise.race([
          fetch(request.url, {
            method: "POST",
            headers: request.headers,
            body: JSON.stringify(request.body)
          }),
          timeout(TIMEOUT_MS)
        ]);

        if (!response.ok) {
          const message = await parseErrorMessage(response);
          failures.push(`${providerId}:${model} -> ${message}`);
        } else {
          console.log(`OK ${providerId}:${model}`);
        }
      } catch (error) {
        failures.push(`${providerId}:${model} -> ${error.message}`);
      }
    }
  }

  if (failures.length > 0) {
    console.error("\nModel verification failures:");
    failures.forEach((failure) => console.error(`- ${failure}`));
    process.exit(1);
  }

  console.log("\nAll model checks passed.");
};

main();
