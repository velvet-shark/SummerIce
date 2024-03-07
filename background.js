chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
  console.log(request.data);
  // Handle the data here...
  sendResponse({ message: "Data received" });
});

chrome.runtime.onInstalled.addListener(function (details) {
  if (details.reason === "install") {
    chrome.tabs.create({ url: "setup.html" });
  }
});

// Listen for commands
chrome.commands.onCommand.addListener(function (command) {
  if (command === "_execute_action") {
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      const activeTab = tabs[0];
      chrome.scripting.executeScript(
        {
          target: { tabId: activeTab.id },
          files: ["content.js"]
        },
        () => {
          if (chrome.runtime.lastError) {
            console.error(chrome.runtime.lastError);
          }
        }
      );
    });
  }
});

chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
  if (request.action === "summarizePage") {
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
            // Call the summarizeText function with the URL
            summarizeText(url).then((summary) => {
              // Send the summary to the popup
              chrome.runtime.sendMessage({ summary: summary });
            });
          }
        }
      );
    });
  }
});
