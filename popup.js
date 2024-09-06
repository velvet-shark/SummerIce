window.onload = function () {
  // Get the current active tab
  chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
    // Send a message to the content script
    chrome.tabs.sendMessage(tabs[0].id, { type: "extractContent" });
  });

  var summaryArea = document.getElementById("summary-area");
  var spinner = document.getElementById("spinner");
  if (summaryArea && summaryArea.innerHTML.trim() === "") {
    summaryArea.style.display = "none";
    spinner.style.display = "block"; // Show the spinner
  }
};

document.getElementById("settingsLink").addEventListener("click", function (event) {
  event.preventDefault();
  chrome.runtime.openOptionsPage();
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === "summarizationResult") {
    displaySummary(request.summary);
  }
});

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
