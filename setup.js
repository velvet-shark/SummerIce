console.log("setup.js loaded");

document.getElementById("setupForm").addEventListener("submit", function (event) {
  event.preventDefault();

  // Hide the form
  this.style.display = "none";

  // Show success message
  const successMessage = document.createElement("p");
  successMessage.textContent = "Your API key has been saved. It is safe to close the browser tab.";
  document.body.appendChild(successMessage);

  // Save the API key
  const openaiApiKey = document.getElementById("openaiApiKey").value;
  const anthropicApiKey = document.getElementById("anthropicApiKey").value;
  const apiKey = openaiApiKey || anthropicApiKey;
  chrome.storage.local.set({ apiKey: apiKey }, function () {
    console.log("API key saved");
  });
});
