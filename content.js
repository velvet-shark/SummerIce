chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log("Content.js received message:", request);
  if (request.type === "extractContent") {
    const content = extractContent();
    chrome.runtime.sendMessage({ type: "extractedContent", content: content });
  } else if (request.type === "ping") {
    // Respond to ping
    sendResponse({ status: "ok" });
  }
});

// Function to extract article content
function extractContent() {
  // Helper function to get inner text while preserving some paragraph breaks
  function getInnerText(node) {
    let text = node.innerText || node.textContent;
    return text.trim().replace(/\s{2,}/g, " ");
  }

  // Helper function to calculate text density
  function getTextDensity(element) {
    const text = getInnerText(element);
    const length = text.length;
    if (length === 0) return 0;

    const linkLength = Array.from(element.getElementsByTagName("a")).reduce(
      (total, link) => total + getInnerText(link).length,
      0
    );

    return (length - linkLength) / length;
  }

  // First try to find article content using common article selectors
  const articleSelectors = [
    "article",
    '[role="main"]',
    '[role="article"]',
    "main",
    "#main-content",
    ".post-content",
    ".article-content",
    ".article-body",
    ".entry-content",
    ".content-body",
    ".story-body"
  ];

  let articleContent = null;

  // Try each selector until we find content
  for (const selector of articleSelectors) {
    const element = document.querySelector(selector);
    if (element && getInnerText(element).length > 500) {
      articleContent = element;
      break;
    }
  }

  // If no article found, look for the largest content block
  if (!articleContent) {
    // Get all potential content blocks
    const contentBlocks = Array.from(document.getElementsByTagName("*")).filter((node) => {
      // Skip elements that are usually not content
      if (["script", "style", "nav", "header", "footer"].includes(node.tagName.toLowerCase())) {
        return false;
      }

      // Skip invisible elements
      const style = window.getComputedStyle(node);
      if (style.display === "none" || style.visibility === "hidden") {
        return false;
      }

      // Skip elements with suspicious class names
      const className = (node.className || "").toLowerCase();
      if (/(comment|meta|footer|header|menu|nav|sidebar|widget)/.test(className)) {
        return false;
      }

      // Consider blocks with substantial text
      const text = getInnerText(node);
      return text.length > 200;
    });

    // Score content blocks based on various metrics
    const scoredBlocks = contentBlocks.map((block) => {
      let score = 0;

      // Prefer blocks with more text
      score += getInnerText(block).length / 100;

      // Prefer blocks with higher text density (less links)
      score += getTextDensity(block) * 10;

      // Prefer blocks with paragraphs
      score += block.getElementsByTagName("p").length * 3;

      // Prefer blocks with few ads-like elements
      const suspiciousTerms = /(share|social|comment|advertisement|sidebar)/i;
      if (suspiciousTerms.test(block.className + " " + block.id)) {
        score -= 10;
      }

      return { block, score };
    });

    // Select the block with highest score
    if (scoredBlocks.length > 0) {
      scoredBlocks.sort((a, b) => b.score - a.score);
      articleContent = scoredBlocks[0].block;
    }
  }

  // Clean up the selected content
  if (articleContent) {
    // Remove known non-content elements
    const elementsToRemove = articleContent.querySelectorAll(
      'script, style, iframe, nav, header, footer, [role="complementary"]'
    );
    elementsToRemove.forEach((el) => el.remove());

    return getInnerText(articleContent);
  }

  // Fallback to body text if nothing better found
  return document.body.innerText;
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === "summarizationResult") {
    const summary = request.summary;
    console.log("Received summary:", summary);
    // Display the summary or perform any desired action with the summary
  }
});
