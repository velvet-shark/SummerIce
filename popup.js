window.onload = function () {
  var summaryArea = document.getElementById("summary-area");
  if (summaryArea && summaryArea.innerHTML.trim() === "") {
    summaryArea.style.display = "none";
  }
};

async function summarizeText(url) {
  // Check if URL is passed as an argument
  if (!url) {
    console.error("URL of the article not provided");
    return;
  }

  try {
    // Get the API key from local storage
    const apiKey = await new Promise((resolve) => {
      chrome.storage.local.get("apiKey", (result) => {
        resolve(result.apiKey);
      });
    });

    if (!apiKey) {
      throw new Error("API key not found in chrome.storage.local");
    }

    let response;

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
          model: "claude-3-sonnet-20240229",
          max_tokens: 1024,
          messages: [
            {
              role: "user",
              content: `Please provide a concise and comprehensive summary of the article at URL: ${url}. The summary should capture the main points and key details of the text while conveying the author's intended meaning accurately. Please ensure that the summary is well-organized and easy to read, with clear headings and subheadings to guide the reader through each section. The length of the summary should be so that it can be read in under 1 minute. Try to not exceed this reading time. The summary should be appropriate to capture the main points and key details of the text, without including unnecessary information or becoming overly long. Do not include any intro text, e.g. 'Here is a summary at the provided URL', get straight to summary.`
            }
          ]
        })
      });

      // Prompt for OpenAI API
    } else if (apiKey.startsWith("sk-")) {
      response = await fetch("https://api.openai.com/v1/engines/gpt-3.5-turbo-instruct/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          prompt: `Please provide a concise and comprehensive summary of the article at URL: ${url}. The summary should capture the main points and key details of the text while conveying the author's intended meaning accurately. Please ensure that the summary is well-organized and easy to read, with clear headings and subheadings to guide the reader through each section. The length of the summary should be so that it can be read in under 1 minute. Try to not exceed this reading time. The summary should be appropriate to capture the main points and key details of the text, without including unnecessary information or becoming overly long. Do not include any intro text, e.g. 'Here is a concise summary of the article at the provided URL', get straight to the summary.`,
          max_tokens: 3800
        })
      });
    }

    // Send the data to the background page
    chrome.runtime.sendMessage({ data: url }, function (response) {
      console.log(response);
    });
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    if (data) {
      if (apiKey.startsWith("sk-ant-")) {
        return data.content[0].text;
      } else if (apiKey.startsWith("sk-")) {
        return data.choices[0].text;
      }
    } else {
      throw new Error("No choices returned from the API");
    }
  } catch (error) {
    console.error(`An error occurred: ${error}`);
  }
}

// Function to display the summary
function displaySummary(summary) {
  const summaryArea = document.getElementById("summary-area");
  const spinner = document.getElementById("spinner");

  if (summary) {
    summaryArea.style.display = "block";
    summaryArea.innerText = summary;
    spinner.style.display = "none";
  } else {
    summaryArea.style.display = "none";
    spinner.style.display = "block";
  }
}

chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
  if (request.action === "performSummarization") {
    const url = request.url;
    summarizeText(url).then((summary) => {
      // Display the summary in the popup
      displaySummary(summary);
    });
  }
});

// Function to set up the event listeners
function setupEventListeners() {
  document.addEventListener("DOMContentLoaded", function () {
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      const url = tabs[0].url;
      chrome.scripting.executeScript(
        {
          target: { tabId: tabs[0].id },
          function: function () {
            return document.body.textContent;
          }
        },
        (result) => {
          if (chrome.runtime.lastError) {
            console.error(chrome.runtime.lastError);
          } else {
            displaySummary(null); // Show the spinner
            summarizeText(url).then((summary) => {
              displaySummary(summary); // Hide the spinner and display the summary
            });
          }
        }
      );
    });
  });
}

// Call the function to set up the event listeners
setupEventListeners();
