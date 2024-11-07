// src/popup/popup.js

export function loadTabs() {
  chrome.tabs.query({}, (tabs) => {
    const tabList = document.getElementById("tab-list");
    if (tabList) {
      tabList.innerHTML = ''; // Clear any existing entries
      tabs.forEach(tab => {
        const tabItem = document.createElement("div");
        tabItem.textContent = tab.title;
        tabList.appendChild(tabItem);
      });
    }
  });
}

function setupSuspendButton() {
  const suspendButton = document.getElementById("suspend-inactive-tabs");
  if (suspendButton) {
    suspendButton.addEventListener("click", () => {
      chrome.runtime.sendMessage({ action: "suspendInactiveTabs" }, (response) => {
        console.log(response.message);
      });
    });
  }
}

// Initialize the popup when the DOM is fully loaded
document.addEventListener("DOMContentLoaded", () => {
  setupSuspendButton();
  loadTabs();
});