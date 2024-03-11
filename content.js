chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log("Content.js received message:", request);
  if (request.type === "extractContent") {
    const content = extractContent();
    chrome.runtime.sendMessage({ type: "extractedContent", content: content });
  }
});

// Function to extract article content
function extractContent() {
  // Extract the article content
  const content = document.body.innerText;
  return content;
}

// // Send the extracted content to the background script
// chrome.runtime.sendMessage({ type: "extractedContent", content: extractContent() });

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === "summarizationResult") {
    const summary = request.summary;
    console.log("Received summary:", summary);
    // Display the summary or perform any desired action with the summary
  }
});
