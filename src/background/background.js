// src/background/background.js

// Listener for new tab creation
chrome.tabs.onCreated.addListener((tab) => {
    console.log("New tab created:", tab);
  });
  
  // Listener for tab updates
  chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete') {
      console.log("Tab updated:", tab);
    }
  });
  
  // Dummy alarm setup for dormant tab reminder
  chrome.alarms.create("checkDormantTabs", { periodInMinutes: 60 });
  
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === "checkDormantTabs") {
      // Placeholder logic for checking dormant tabs
      console.log("Checking for dormant tabs...");
      // Implement logic to identify and handle dormant tabs here
    }
  });
  
  // Listener for messages from popup
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "suspendInactiveTabs") {
      // Implement logic for suspending inactive tabs
      console.log("Suspending inactive tabs...");
      sendResponse({ message: "Inactive tabs suspended" });
    }
  });