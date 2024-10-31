// src/popup/popup.js

document.addEventListener("DOMContentLoaded", () => {
    const suspendButton = document.getElementById("suspend-inactive-tabs");
    if (suspendButton) {
      suspendButton.addEventListener("click", () => {
        chrome.runtime.sendMessage({ action: "suspendInactiveTabs" }, (response) => {
          console.log(response.message);
        });
      });
    }
  
    loadTabs(); // Load tabs when the popup is opened
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
  
  module.exports = { loadTabs };