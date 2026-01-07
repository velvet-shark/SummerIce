const FALLBACK_CONFIG = {
  MIN_CONTENT_LENGTH: 500,
  ERRORS: {
    CONTENT_TOO_SHORT:
      "Page content is too short to summarize (minimum 500 characters).",
    NON_HTML_CONTENT: "Cannot process non-HTML content",
  },
};

let CONFIG = FALLBACK_CONFIG;
let isContentTooShort = (text) =>
  (text || "").length < CONFIG.MIN_CONTENT_LENGTH;

const loadDependencies = async () => {
  try {
    const [constantsModule, textUtilsModule] = await Promise.all([
      import(chrome.runtime.getURL("constants.js")),
      import(chrome.runtime.getURL("modules/text-utils.js")),
    ]);
    if (constantsModule?.CONFIG) {
      CONFIG = constantsModule.CONFIG;
    }
    if (typeof textUtilsModule?.isContentTooShort === "function") {
      isContentTooShort = textUtilsModule.isContentTooShort;
    }
  } catch (error) {
    console.warn("Content script using fallback config:", error);
  }
};

const dependenciesReady = loadDependencies();

const handleExtractContent = async (sendResponse) => {
  await dependenciesReady;

  if (document.contentType !== "text/html") {
    sendResponse({
      success: false,
      error: CONFIG.ERRORS.NON_HTML_CONTENT,
    });
    return;
  }

  const hostname = window.location.hostname || "";
  const isYouTubePage =
    hostname.includes("youtube.com") || hostname.includes("youtu.be");
  const bodyText = document.body.innerText || document.body.textContent || "";
  if (!isYouTubePage && isContentTooShort(bodyText)) {
    sendResponse({
      success: false,
      error: CONFIG.ERRORS.CONTENT_TOO_SHORT,
    });
    return;
  }

  chrome.runtime.sendMessage({
    type: "extractedHTML",
    htmlContent: document.documentElement.outerHTML,
    url: window.location.href,
    title: document.title,
  });

  sendResponse({ status: "ok" });
};

// Simple content script that only handles page access validation and HTML extraction
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === "extractContent") {
    handleExtractContent(sendResponse);
    return true;
  }

  if (request.type === "ping") {
    sendResponse({ status: "ok" });
  }
});
