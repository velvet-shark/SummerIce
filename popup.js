// let screenWidth = window.screen.width;
// document.body.style.minWidth = screenWidth * 0.3 + "px";
document.body.style.minWidth = "600px";
document.body.style.maxWidth = "800px";
document.body.style.maxHeight = "1400px";

window.onload = function () {
  var summaryArea = document.getElementById("summary-area");
  if (summaryArea.innerHTML.trim() === "") {
    summaryArea.style.display = "none";
  }
};

// Function to fetch the article text
function fetchArticleText() {
  return new Promise((resolve, reject) => {
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      chrome.scripting.executeScript(
        {
          target: { tabId: tabs[0].id },
          function: function () {
            return document.body.innerText;
          }
        },
        (result) => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
            console.log("Rejected");
          } else {
            console.log(result[0].result);
            resolve(result[0].result);
          }
        }
      );
    });
  });
}

async function summarizeText(text, length) {
  if (!text || !length) {
    console.error("Invalid parameters provided to summarizeText");
    return;
  }

  try {
    let url = "https://api.example.com/data";
    let options = {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${chrome.storage.local.get("apiKey")}`
      },
      body: JSON.stringify({
        prompt: `Please provide a concise and comprehensive summary of the given text. The summary should capture the main points and key details of the text while conveying the author's intended meaning accurately. Please ensure that the summary is well-organized and easy to read, with clear headings and subheadings to guide the reader through each section. The length of the summary should be so that it can be read in ${length}. Do not exceed this reading time, under any circumstances. Check the length of the summary before returning it. The summary should be appropriate to capture the main points and key details of the text, without including unnecessary information or becoming overly long. \n\nText to summarize:\n\n${text}`,
        max_tokens: 500
      })
    };
    // Send the data to the background page
    chrome.runtime.sendMessage({ data: options }, function (response) {
      console.log(response);
    });

    const response = await fetch("https://api.openai.com/v1/engines/gpt-3.5-turbo-instruct/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${chrome.storage.local.get("apiKey")}`
      },
      body: JSON.stringify({
        prompt: `Please provide a concise and comprehensive summary of the given text. The summary should capture the main points and key details of the text while conveying the author's intended meaning accurately. Please ensure that the summary is well-organized and easy to read, with clear headings and subheadings to guide the reader through each section. The length of the summary should be so that it can be read in ${length}. Try to not exceed this reading time. The summary should be appropriate to capture the main points and key details of the text, without including unnecessary information or becoming overly long. \n\nText to summarize:\n\n${text}`,
        max_tokens: 500
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    if (data.choices && data.choices.length > 0) {
      return data.choices[0].text.trim();
    } else {
      throw new Error("No choices returned from the API");
    }
  } catch (error) {
    console.error(`An error occurred: ${error}`);
  }
}

// Function to display the summary
function displaySummary(summary) {
  var summaryArea = document.getElementById("summary-area");
  summaryArea.style.display = "block"; // Show the div
  summaryArea.innerText = summary;
}

// Function to set up the event listeners
function setupEventListeners() {
  document.addEventListener("DOMContentLoaded", function () {
    document.getElementById("15s").addEventListener("click", () => {
      fetchArticleText()
        .then((text) => {
          return summarizeText(text, "15 seconds");
        })
        .then((summary) => {
          displaySummary(summary);
        });
    });

    document.getElementById("1m").addEventListener("click", () => {
      fetchArticleText()
        .then((text) => {
          return summarizeText(text, "1 minute");
        })
        .then((summary) => {
          displaySummary(summary);
        });
    });
  });
}

// Call the function to set up the event listeners
setupEventListeners();
