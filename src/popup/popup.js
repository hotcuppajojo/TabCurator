// popup/popup.js

document.addEventListener("DOMContentLoaded", () => {
    const suspendButton = document.getElementById("suspend-inactive-tabs");
    if (suspendButton) {
      suspendButton.addEventListener("click", () => {
        chrome.runtime.sendMessage({ action: "suspendInactiveTabs" }, (response) => {
          console.log(response.message);
        });
      });
    }
  });
  
  // Load list of tabs in the popup
  function loadTabs() {
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
  
  // Load tabs when popup is opened
  module.exports = { loadTabs };