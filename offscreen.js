import { CONFIG } from './constants.js';

// Check if dependencies are loaded and provide fallbacks
function checkDependencies() {
  // Readability should be available globally from the script tag
  if (typeof window.Readability === 'undefined') {
    return false;
  }
  
  // DOMPurify should be available globally from the script tag  
  if (typeof window.DOMPurify === 'undefined') {
    // Create minimal fallback
    window.DOMPurify = {
      sanitize: (html, options) => {
        if (options && options.ALLOWED_TAGS && options.ALLOWED_TAGS.length === 0) {
          // Strip all HTML tags
          return html.replace(/<[^>]*>/g, '');
        }
        // Basic sanitization - remove script tags
        return html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
      }
    };
  }
  
  return true;
}

const NON_CONTENT_SELECTORS = [
  "script",
  "style",
  "noscript",
  "iframe",
  "header",
  "footer",
  "nav",
  "aside",
  "form",
  "button",
  "svg",
  "canvas",
  "[role='navigation']",
  "[aria-hidden='true']",
  ".cookie",
  ".cookies",
  ".subscribe",
  ".newsletter",
  ".promo",
  ".advert",
  ".ads",
  ".sponsored"
];

function stripNonContentElements(doc) {
  try {
    doc.querySelectorAll(NON_CONTENT_SELECTORS.join(",")).forEach((node) => node.remove());
  } catch (error) {
    // Best-effort cleanup; ignore failures to keep extraction resilient.
  }
}

function normalizeWhitespace(text) {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function sanitizeExtractedHtml(html) {
  if (window.DOMPurify && window.DOMPurify.sanitize) {
    return window.DOMPurify.sanitize(html, {
      ALLOWED_TAGS: [
        "p",
        "ul",
        "ol",
        "li",
        "h1",
        "h2",
        "h3",
        "h4",
        "h5",
        "h6",
        "blockquote",
        "pre",
        "code",
        "br"
      ],
      ALLOWED_ATTR: []
    });
  }

  // Basic sanitization fallback.
  return html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "");
}

function extractTextFromHtml(html) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  const blocks = doc.body.querySelectorAll(
    "h1, h2, h3, h4, h5, h6, p, li, blockquote, pre"
  );
  const parts = [];

  blocks.forEach((block) => {
    const text = block.innerText || block.textContent || "";
    const normalized = normalizeWhitespace(text);
    if (normalized.length > 0) {
      parts.push(normalized);
    }
  });

  if (parts.length > 0) {
    return parts.join("\n\n");
  }

  return normalizeWhitespace(doc.body.innerText || doc.body.textContent || "");
}

function extractTextFromNode(node) {
  if (!node) return "";
  const text = node.innerText || node.textContent || "";
  return normalizeWhitespace(text);
}

// Extract content using Mozilla Readability
function extractWithReadability(htmlContent, url) {
  try {
    // Check if Readability is available
    if (typeof window.Readability === 'undefined') {
      throw new Error('Readability not available');
    }
    
    // Create a DOM document from the HTML
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlContent, 'text/html');

    stripNonContentElements(doc);
    
    // Clone to avoid mutating
    const docClone = doc.cloneNode(true);
    
    // Initialize Readability
    const reader = new window.Readability(docClone, {
      url: url,
      debug: false,
      maxElemsToParse: 0, // No limit
      nbTopCandidates: 5,
      charThreshold: 500,
      classesToPreserve: [],
      keepClasses: false
    });
    
    // Parse the article
    const article = reader.parse();
    
    if (!article) {
      throw new Error('Readability failed to parse article');
    }
    
    const sanitizedHtml = sanitizeExtractedHtml(article.content || "");
    const structuredText = extractTextFromHtml(sanitizedHtml);
    const textContent = structuredText || normalizeWhitespace(article.textContent || "");
    return {
      title: article.title || '',
      content: textContent,
      success: true
    };
    
  } catch (error) {
    return { success: false, error: error.message };
  }
}

function extractWithTextDensity(htmlContent) {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlContent, "text/html");
    stripNonContentElements(doc);

    const candidates = Array.from(
      doc.querySelectorAll("article, main, [role='main'], section, div")
    );

    let bestCandidate = null;
    let bestScore = 0;

    candidates.forEach((candidate) => {
      const text = extractTextFromNode(candidate);
      if (text.length < 200) return;

      const linkTextLength = Array.from(candidate.querySelectorAll("a")).reduce((sum, link) => {
        const linkText = link.innerText || link.textContent || "";
        return sum + linkText.length;
      }, 0);

      const linkDensity = linkTextLength / Math.max(text.length, 1);
      const paragraphCount = candidate.querySelectorAll("p").length;
      const headingCount = candidate.querySelectorAll("h1, h2, h3").length;
      const score =
        text.length * (1 - Math.min(linkDensity, 0.9)) +
        paragraphCount * 200 +
        headingCount * 150;

      if (score > bestScore) {
        bestScore = score;
        bestCandidate = candidate;
      }
    });

    if (!bestCandidate) {
      throw new Error("No suitable content found via text density");
    }

    const content = extractTextFromNode(bestCandidate);
    return {
      title: doc.title || "",
      content: content,
      success: true
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// Fallback extraction using basic content selectors
function extractWithBasicSelectors(htmlContent, url) {
  try {
    // Create a DOM document from the HTML
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlContent, 'text/html');
    stripNonContentElements(doc);
    
    // Try common article selectors as fallback
    const selectors = [
      'article',
      '[role="main"]',
      'main',
      '.article-content',
      '.post-content',
      '.entry-content',
      '.content-body',
      '#main-content'
    ];
    
    for (const selector of selectors) {
      const element = doc.querySelector(selector);
      if (element) {
        const textContent = extractTextFromNode(element);
        if (textContent && textContent.length > 500) {
          return {
            title: doc.title || '',
            content: textContent,
            success: true
          };
        }
      }
    }
    
    // If no specific selectors work, try body content
    const bodyText = extractTextFromNode(doc.body);
    if (bodyText && bodyText.length > 500) {
      return {
        title: doc.title || '',
        content: bodyText,
        success: true
      };
    }
    
    throw new Error('No suitable content found with basic selectors');
    
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// Main extraction function
async function extractContent(htmlContent, url) {
  // Early validation
  if (!htmlContent || htmlContent.length < CONFIG.MIN_CONTENT_LENGTH) {
    return {
      success: false,
      error: CONFIG.ERRORS.CONTENT_TOO_SHORT
    };
  }
  
  // Check dependencies and set up fallbacks
  checkDependencies();
  
  // Try Readability first
  let result = extractWithReadability(htmlContent, url);
  
  if (!result.success || !result.content || result.content.length < CONFIG.MIN_CONTENT_LENGTH) {
    result = extractWithTextDensity(htmlContent);
  }

  // If text density fails, try basic selectors as fallback
  if (!result.success) {
    result = extractWithBasicSelectors(htmlContent, url);
  }
  
  // Final validation of extracted content
  if (result.success) {
    if (result.content.length < CONFIG.MIN_CONTENT_LENGTH) {
      return {
        success: false,
        error: CONFIG.ERRORS.CONTENT_TOO_SHORT
      };
    }
    
    // Truncate if too long
    if (result.content.length > CONFIG.MAX_CONTENT_LENGTH) {
      result.content = result.content.substring(0, CONFIG.MAX_CONTENT_LENGTH) + '...';
    }
  }
  
  return result;
}

// Listen for messages from the background script
if (typeof chrome !== "undefined" && chrome?.runtime?.onMessage?.addListener) {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === "extractContent") {
      extractContent(message.htmlContent, message.url)
        .then((result) => {
          sendResponse(result);
        })
        .catch((error) => {
          sendResponse({
            success: false,
            error: error.message || CONFIG.ERRORS.CONTENT_EXTRACTION_FAILED
          });
        });

      // Return true to indicate we'll respond asynchronously
      return true;
    }
  });
}

export {
  extractContent,
  extractWithBasicSelectors,
  extractWithReadability,
  extractWithTextDensity,
  extractTextFromHtml,
  normalizeWhitespace,
  stripNonContentElements
};
