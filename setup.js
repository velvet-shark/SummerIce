document.getElementById("setupForm").addEventListener("submit", function (event) {
  event.preventDefault();

  // Hide the form
  this.style.display = "none";

  // Show success message
  const contentElement = document.getElementById("content");
  const successMessage = document.createElement("p");
  successMessage.innerHTML = `Your API key has been saved. It is safe to close the browser tab.<br /><br />
    Now you can summarize the articles by clicking on the extension icon or by pressing <strong>Ctrl+Shift+Y</strong> (on Windows) or <strong>Cmd+Shift+Y</strong> (on Mac).`;
  contentElement.appendChild(successMessage);

  // Save the API key
  const openaiApiKey = document.getElementById("openaiApiKey").value;
  const anthropicApiKey = document.getElementById("anthropicApiKey").value;
  const apiKey = openaiApiKey || anthropicApiKey;
  chrome.storage.local.set({ apiKey: apiKey }, function () {
    console.log("API key saved");
  });
});
