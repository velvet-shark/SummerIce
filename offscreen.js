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
    
    // Clean the content with DOMPurify if available
    let cleanContent = article.content;
    if (window.DOMPurify && window.DOMPurify.sanitize) {
      cleanContent = window.DOMPurify.sanitize(article.content, {
        ALLOWED_TAGS: [],
        KEEP_CONTENT: true,
        ALLOWED_ATTR: []
      });
    }
    
    // Return text content, removing extra whitespace
    const textContent = article.textContent || cleanContent.replace(/<[^>]*>/g, '');
    return {
      title: article.title || '',
      content: textContent.replace(/\s+/g, ' ').trim(),
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
        const textContent = element.innerText || element.textContent;
        if (textContent && textContent.length > 500) {
          return {
            title: doc.title || '',
            content: textContent.replace(/\s+/g, ' ').trim(),
            success: true
          };
        }
      }
    }
    
    // If no specific selectors work, try body content
    const bodyText = doc.body.innerText || doc.body.textContent;
    if (bodyText && bodyText.length > 500) {
      return {
        title: doc.title || '',
        content: bodyText.replace(/\s+/g, ' ').trim(),
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
  
  // If Readability fails, try basic selectors as fallback
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
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'extractContent') {
    extractContent(message.htmlContent, message.url)
      .then(result => {
        sendResponse(result);
      })
      .catch(error => {
        sendResponse({
          success: false,
          error: error.message || CONFIG.ERRORS.CONTENT_EXTRACTION_FAILED
        });
      });
    
    // Return true to indicate we'll respond asynchronously
    return true;
  }
});

