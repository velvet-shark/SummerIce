console.log("Background script started");

chrome.storage.local.get(["apiKey"], function (result) {
  if (result.apiKey) {
    console.log("API key is defined");
  } else {
    console.log("API key is not defined");
  }
});

// After extension installation, run setup
chrome.runtime.onInstalled.addListener(function (details) {
  if (details.reason === "install") {
    console.log("Extension installed");
    chrome.tabs.create({ url: "setup.html" });
  }
});

chrome.commands.onCommand.addListener(function (command) {
  if (command === "_execute_action") {
    console.log("Background script received command:", command);
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      chrome.tabs.sendMessage(tabs[0].id, { type: "extractContent" });
    });
  }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === "extractedContent") {
    const extractedContent = request.content.trim();

    summarizeText(extractedContent)
      .then((summary) => {
        console.log("Generated summary:", summary);
        // Send the summary to the popup
        chrome.runtime.sendMessage({ type: "summarizationResult", summary });
      })
      .catch((error) => {
        console.error("Error generating summary:", error);
      });
  }
});

async function summarizeText(extractedContent) {
  console.log("Inside summarizeText function. Content:\n", extractedContent);
  // Check if extracted content is available
  if (!extractedContent) {
    console.error("Extracted content not found");
    return;
  }

  try {
    // Get the API key from local storage
    const apiKey = await new Promise((resolve) => {
      console.log("Getting API key from chrome.storage.local");
      chrome.storage.local.get("apiKey", (result) => {
        resolve(result.apiKey);
      });
    });

    if (!apiKey) {
      throw new Error("API key not found in chrome.storage.local");
    }

    const prompt = `Provide a concise summary of the article below.
        The summary should be around 200 words and capture the essential information while preserving the original meaning and context. Organize the summary into clear, logical paragraphs. Avoid including minor details or tangential information. The goal is to provide a quick, informative overview of the article's core content.

        Do not include any intro text, e.g. 'Here is a concise summary of the article at the provided URL', get straight to the summary.
    
        Article:
        ---
        ${extractedContent}
        ---
        `;

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        max_tokens: 4096,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.7
      })
    });

    const data = await response.json();
    if (data && data.choices && data.choices.length > 0) {
      return data.choices[0].message.content;
    } else {
      throw new Error("No choices returned from the API");
    }
  } catch (error) {
    console.error(`An error occurred: ${error}`);
  }
}
