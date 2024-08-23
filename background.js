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

    let response;

    const prompt = `Provide a concise summary of the article below.
        The summary should be around 200 words and capture the essential information while preserving the original meaning and context. Organize the summary into clear, logical paragraphs. Avoid including minor details or tangential information. The goal is to provide a quick, informative overview of the article's core content.

        Do not include any intro text, e.g. 'Here is a concise summary of the article at the provided URL', get straight to the summary.
    
        Article:
        ---
        ${extractedContent}
        ---
        `;

    // const prompt0 = `Please provide a concise and comprehensive summary of the article at URL: ${url}. The summary should capture the main points and key details of the text while conveying the author's intended meaning accurately. Please ensure that the summary is well-organized and easy to read, with clear headings and subheadings to guide the reader through each section. The length of the summary should be so that it can be read in under 1 minute. Try to not exceed this reading time. The summary should be appropriate to capture the main points and key details of the text, without including unnecessary information or becoming overly long. Do not include any intro text, e.g. 'Here is a concise summary of the article at the provided URL', get straight to the summary.`;

    // const prompt1 = `Please provide a concise summary of the article at the given URL, focusing on the key points and main takeaways. The summary should be around 200 words and capture the essential information while preserving the original meaning and context. Organize the summary into clear, logical paragraphs. Avoid including minor details or tangential information. The goal is to provide a quick, informative overview of the article's core content.
    // URL: ${url}`;

    // const prompt2 = `Generate a summary of the article at the provided URL using the following format:
    //     - Introduction (1-2 sentences)
    //     - Key Points:
    //         - Point 1 (1-2 sentences)
    //         - Point 2 (1-2 sentences)
    //         - Point 3 (1-2 sentences)
    //     - Conclusion (1-2 sentences)
    //     Each bullet point should capture a main idea or takeaway from the article. The entire summary should be around 200-250 words. Focus on clarity, brevity, and accuracy in conveying the essential information.
    //     URL: ${url}`;

    // const prompt3 = `Provide a TLDR (Too Long; Didn't Read) style summary of the article at the given URL. Start with a brief context sentence to orient the reader, then summarize the main points in 3-4 concise sentences. Aim for a total length of around 150 words. The summary should be easily understandable without having read the original article, while still capturing the key information accurately.
    //     URL: ${url}`;

    // const prompt4 = `Create a narrative summary of the article at the provided URL, weaving in 2-3 key quotes from the original text. The summary should tell a coherent story, highlighting the main ideas and conclusions in around 250 words. Use the quotes to support and illustrate the core points. Maintain a neutral, informative tone and present the information objectively.
    //     URL: ${url}`;

    // const prompt5 = `Generate a summary of the article at the given URL by answering the following questions:
    //     1. What is the main topic or issue discussed in the article?
    //     2. What are the 2-3 most important points or arguments made?
    //     3. What evidence, examples, or data are used to support these points?
    //     4. What conclusions or recommendations does the article make?
    //     Keep the answers concise, limiting the entire summary to around 200-250 words. Focus on accurately capturing the essential information while maintaining clarity and coherence.
    //     URL: ${url}`;

    // Prompt for Anthropic API
    if (apiKey.startsWith("sk-ant-")) {
      response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "anthropic-version": "2023-06-01",
          "x-api-key": apiKey
        },
        body: JSON.stringify({
          // model: "claude-3-sonnet-20240229",
          model: "claude-3-haiku-20240307",
          max_tokens: 1024,
          messages: [
            {
              role: "user",
              content: prompt
            }
          ]
        })
      });

      // Prompt for OpenAI API
    } else if (apiKey.startsWith("sk-")) {
      console.log("you are using OpenAI API");
      response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          // model: "gpt-4-0125-preview",
          model: "gpt-4o-mini",
          max_tokens: 4096,
          messages: [{ role: "user", content: prompt }],
          // messages: [{ role: "user", content: "Say hello" }],
          temperature: 0.7
        })
      });
    }

    const data = await response.json();
    if (data) {
      if (apiKey.startsWith("sk-ant-")) {
        return data.content[0].text;
      } else if (apiKey.startsWith("sk-")) {
        console.log(data);
        return data.choices[0].message.content;
      }
    } else {
      throw new Error("No choices returned from the API");
    }
  } catch (error) {
    console.error(`An error occurred: ${error}`);
  }
}
