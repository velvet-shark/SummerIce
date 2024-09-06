document.addEventListener("DOMContentLoaded", function () {
  // Load the current API key
  chrome.storage.local.get(["apiKey"], function (result) {
    if (result.apiKey) {
      document.getElementById("apiKey").value = result.apiKey;
    }
  });

  document.getElementById("settingsForm").addEventListener("submit", function (event) {
    event.preventDefault();

    const apiKey = document.getElementById("apiKey").value;
    chrome.storage.local.set({ apiKey: apiKey }, function () {
      const messageElement = document.getElementById("message");
      messageElement.textContent = "API key updated successfully!";
      messageElement.style.color = "green";
      setTimeout(() => {
        messageElement.textContent = "";
      }, 3000);
    });
  });
});
