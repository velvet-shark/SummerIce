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
