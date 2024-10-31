// background/background.js

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
  
  // Example alarm setup for dormant tab reminder
  chrome.alarms.create("checkDormantTabs", { periodInMinutes: 60 });
  
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === "checkDormantTabs") {
      // Placeholder logic for checking dormant tabs
      console.log("Checking for dormant tabs...");
    }
  });