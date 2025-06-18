// Simple content script that only handles page access validation and HTML extraction
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  
  if (request.type === "extractContent") {
    // Early validation checks
    if (document.contentType !== "text/html") {
      sendResponse({ 
        success: false, 
        error: "Cannot process non-HTML content" 
      });
      return;
    }
    
    const bodyText = document.body.innerText || document.body.textContent || '';
    if (bodyText.length < 500) {
      sendResponse({ 
        success: false, 
        error: "Page content too short to summarize" 
      });
      return;
    }
    
    // Send HTML to background script for offscreen processing
    chrome.runtime.sendMessage({ 
      type: "extractedHTML", 
      htmlContent: document.documentElement.outerHTML,
      url: window.location.href,
      title: document.title
    });
    
    sendResponse({ status: "ok" });
    
  } else if (request.type === "ping") {
    // Respond to ping for accessibility check
    sendResponse({ status: "ok" });
  }
});
