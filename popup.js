window.onload = function () {
  // Get the current active tab
  chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
    if (tabs[0]) {
      // Check if we can access the tab
      chrome.tabs.sendMessage(tabs[0].id, { type: "ping" }, function (response) {
        if (chrome.runtime.lastError) {
          // Can't access this tab
          displayError("Cannot summarize this page. Try a different website.");
        } else {
          // Tab accessible, proceed with content extraction
          chrome.tabs.sendMessage(tabs[0].id, { type: "extractContent" });
        }
      });
    } else {
      displayError("No active tab found.");
    }
  });

  var summaryArea = document.getElementById("summary-area");
  var spinner = document.getElementById("spinner");
  if (summaryArea && summaryArea.innerHTML.trim() === "") {
    summaryArea.style.display = "none";
    spinner.style.display = "block"; // Show the spinner
  }
};

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === "summarizationResult") {
    displaySummary(request.summary);
  }
});

// Function to display the summary
function displaySummary(summary) {
  const summaryArea = document.getElementById("summary-area");
  const spinner = document.getElementById("spinner");
  const timeoutMessage = document.getElementById("timeout-message");

  if (summary) {
    summaryArea.style.display = "block";
    summaryArea.innerText = summary;
    spinner.style.display = "none";
    timeoutMessage.style.display = "none";
  } else {
    summaryArea.style.display = "none";
    spinner.style.display = "block";
  }
}

function displayError(message) {
  const summaryArea = document.getElementById("summary-area");
  const spinner = document.getElementById("spinner");

  summaryArea.style.display = "block";
  summaryArea.innerText = message;
  summaryArea.style.color = "red";
  spinner.style.display = "none";
}

document.getElementById("settingsLink").addEventListener("click", function (event) {
  event.preventDefault();
  chrome.runtime.openOptionsPage();
});

setTimeout(() => {
  if (document.getElementById("spinner").style.display !== "none") {
    document.getElementById("spinner").style.display = "none";
    document.getElementById("timeout-message").style.display = "block";
  }
}, 10000);
