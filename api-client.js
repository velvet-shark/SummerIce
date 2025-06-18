import { CONFIG, getProviderConfig, getSummaryPrompt } from './constants.js';

class APIClient {
  constructor() {
    this.abortController = null;
  }

  // Get API configuration for a provider
  async getSettings() {
    return new Promise((resolve) => {
      chrome.storage.local.get([
        'provider', 'model', 'apiKey', 'summaryLength', 'summaryFormat'
      ], (result) => {
        const provider = result.provider || CONFIG.DEFAULTS.provider;
        const providerConfig = getProviderConfig(provider);
        
        // For existing users, if they have an API key but no model set,
        // use the first available model for their provider
        let model = result.model || CONFIG.DEFAULTS.model;
        
        // Validate that the model exists for the current provider
        if (providerConfig && providerConfig.models && !providerConfig.models[model]) {
          // Use the first available model for this provider
          const availableModels = Object.keys(providerConfig.models);
          if (availableModels.length > 0) {
            model = availableModels[0];
          }
        }
        
        resolve({
          provider: provider,
          model: model,
          apiKey: result.apiKey || '',
          summaryLength: result.summaryLength || CONFIG.DEFAULTS.summaryLength,
          summaryFormat: result.summaryFormat || CONFIG.DEFAULTS.summaryFormat
        });
      });
    });
  }

  // Create request payload for OpenAI
  createOpenAIRequest(prompt, model, maxTokens) {
    return {
      model: model,
      max_tokens: maxTokens,
      messages: [{ role: "user", content: prompt }],
      temperature: CONFIG.LLM_PROVIDERS.OPENAI.temperature
    };
  }

  // Create request payload for Anthropic
  createAnthropicRequest(prompt, model, maxTokens) {
    return {
      model: model,
      max_tokens: maxTokens,
      messages: [{ role: "user", content: prompt }],
      system: "You are a helpful assistant that creates concise, accurate summaries of articles."
    };
  }

  // Create request payload for Gemini
  createGeminiRequest(prompt, model) {
    return {
      contents: [{
        parts: [{ text: prompt }]
      }],
      generationConfig: {
        maxOutputTokens: CONFIG.LLM_PROVIDERS.GEMINI.models[model]?.maxTokens || 8192,
        temperature: 0.7
      }
    };
  }

  // Create request payload for Grok
  createGrokRequest(prompt, model, maxTokens) {
    return {
      model: model,
      max_tokens: maxTokens,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.7
    };
  }

  // Get request headers for each provider
  getHeaders(provider, apiKey) {
    const headers = {
      'Content-Type': 'application/json'
    };

    switch (provider) {
      case 'openai':
        headers['Authorization'] = `Bearer ${apiKey}`;
        break;
      case 'anthropic':
        headers['Authorization'] = `Bearer ${apiKey}`;
        headers['anthropic-version'] = '2023-06-01';
        break;
      case 'gemini':
        // Gemini uses API key in URL, not headers
        break;
      case 'grok':
        headers['Authorization'] = `Bearer ${apiKey}`;
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
      case 'gemini':
        return `${providerConfig.apiUrl}/${model}:generateContent?key=${apiKey}`;
      default:
        return providerConfig.apiUrl;
    }
  }

  // Parse response based on provider
  parseResponse(provider, data) {
    switch (provider) {
      case 'openai':
      case 'grok':
        if (data.choices && data.choices.length > 0) {
          return data.choices[0].message.content;
        }
        break;
      case 'anthropic':
        if (data.content && data.content.length > 0) {
          return data.content[0].text;
        }
        break;
      case 'gemini':
        if (data.candidates && data.candidates.length > 0) {
          const candidate = data.candidates[0];
          if (candidate.content && candidate.content.parts && candidate.content.parts.length > 0) {
            return candidate.content.parts[0].text;
          }
        }
        break;
    }
    
    throw new Error('Invalid response format from API');
  }

  // Main API call with retry logic
  async callAPI(content, retryCount = 0) {
    try {
      const settings = await this.getSettings();
      const { provider, model, apiKey, summaryLength, summaryFormat } = settings;

      if (!apiKey) {
        throw new Error(CONFIG.ERRORS.NO_API_KEY);
      }

      const providerConfig = getProviderConfig(provider);
      if (!providerConfig) {
        // Fallback to OpenAI for backward compatibility
        return this.legacyOpenAICall(content, apiKey, summaryLength, summaryFormat);
      }

      if (!providerConfig.models[model]) {
        // Use first available model as fallback
        const availableModels = Object.keys(providerConfig.models);
        if (availableModels.length === 0) {
          throw new Error(`No models available for provider: ${provider}`);
        }
        const fallbackModel = availableModels[0];
        const fallbackSettings = { ...settings, model: fallbackModel };
        // Save the corrected model for future use
        chrome.storage.local.set({ model: fallbackModel });
        return this.callAPI(content, retryCount);
      }

      const prompt = getSummaryPrompt(content, summaryLength, summaryFormat);
      const maxTokens = providerConfig.models[model].maxTokens;

      // Create request payload based on provider
      let requestBody;
      switch (provider) {
        case 'openai':
          requestBody = this.createOpenAIRequest(prompt, model, maxTokens);
          break;
        case 'anthropic':
          requestBody = this.createAnthropicRequest(prompt, model, maxTokens);
          break;
        case 'gemini':
          requestBody = this.createGeminiRequest(prompt, model);
          break;
        case 'grok':
          requestBody = this.createGrokRequest(prompt, model, maxTokens);
          break;
        default:
          throw new Error(`Unsupported provider: ${provider}`);
      }

      // Set up abort controller for timeout
      this.abortController = new AbortController();
      const timeoutId = setTimeout(() => {
        this.abortController.abort();
      }, CONFIG.TIMEOUT_MS);

      // Make API call
      const response = await fetch(this.getAPIURL(provider, model, apiKey), {
        method: 'POST',
        headers: this.getHeaders(provider, apiKey),
        body: JSON.stringify(requestBody),
        signal: this.abortController.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || `API request failed: ${response.status}`);
      }

      const data = await response.json();

      return this.parseResponse(provider, data);

    } catch (error) {

      // Handle abort (timeout)
      if (error.name === 'AbortError') {
        throw new Error(CONFIG.ERRORS.TIMEOUT);
      }

      // Retry logic with exponential backoff
      if (retryCount < CONFIG.RETRY_ATTEMPTS - 1) {
        const delay = CONFIG.RETRY_DELAY_BASE * Math.pow(2, retryCount);
        
        await new Promise(resolve => setTimeout(resolve, delay));
        return this.callAPI(content, retryCount + 1);
      }

      // All retries failed
      throw new Error(error.message || CONFIG.ERRORS.API_CALL_FAILED);
    }
  }

  // Cancel ongoing API call
  cancelRequest() {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }

  // Legacy OpenAI call for backward compatibility
  async legacyOpenAICall(content, apiKey, summaryLength = 'STANDARD', summaryFormat = 'paragraph') {
    
    const prompt = getSummaryPrompt(content, summaryLength, summaryFormat);
    
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        max_tokens: 4096,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7
      }),
      signal: AbortSignal.timeout(CONFIG.TIMEOUT_MS)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error?.message || `API request failed: ${response.status}`);
    }

    const data = await response.json();
    
    if (data.choices && data.choices.length > 0) {
      return data.choices[0].message.content;
    }
    
    throw new Error('No response from OpenAI API');
  }

  // Test API key validity
  async testAPIKey(provider, apiKey, model) {
    const testPrompt = "Test";
    const providerConfig = getProviderConfig(provider);
    
    if (!providerConfig) {
      throw new Error(`Unsupported provider: ${provider}`);
    }

    try {
      let requestBody;
      switch (provider) {
        case 'openai':
          requestBody = this.createOpenAIRequest(testPrompt, model, 10);
          break;
        case 'anthropic':
          requestBody = this.createAnthropicRequest(testPrompt, model, 10);
          break;
        case 'gemini':
          requestBody = this.createGeminiRequest(testPrompt, model);
          requestBody.generationConfig.maxOutputTokens = 10;
          break;
        case 'grok':
          requestBody = this.createGrokRequest(testPrompt, model, 10);
          break;
        default:
          throw new Error(`Unsupported provider: ${provider}`);
      }

      const response = await fetch(this.getAPIURL(provider, model, apiKey), {
        method: 'POST',
        headers: this.getHeaders(provider, apiKey),
        body: JSON.stringify(requestBody),
        signal: AbortSignal.timeout(5000) // 5 second timeout for test
      });

      return response.ok;
    } catch (error) {
      console.error('API key test failed:', error);
      return false;
    }
  }
}

export default APIClient;