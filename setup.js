document.getElementById("setupForm").addEventListener("submit", function (event) {
  event.preventDefault();
  const apiKey = document.getElementById("apiKey").value;
  chrome.storage.local.set({ apiKey: apiKey }, function () {
    console.log("API key saved");
  });
});
