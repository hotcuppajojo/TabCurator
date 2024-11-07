// src/background/background.js
console.log("Background service worker started.");
// Polyfill for browser APIs to ensure cross-browser compatibility
// Safari uses the 'browser' namespace similarly to Firefox
const browser = typeof browser === 'undefined' ? chrome : browser;

// Store the last active time for each tab
const tabActivity = {};

// Ensure tabActivity is available for testing
if (typeof process !== 'undefined' && process.env.NODE_ENV === 'test') {
  global.tabActivity = tabActivity;
}

// Update the last active time when a tab is activated
browser.tabs.onActivated.addListener(activeInfo => {
  const tabId = activeInfo.tabId;
  tabActivity[tabId] = Date.now();
});

// Update the last active time when a tab is updated
browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete') {
    tabActivity[tabId] = Date.now();
  }
});

// Remove tab from activity tracking when it's closed
browser.tabs.onRemoved.addListener(tabId => {
  delete tabActivity[tabId];
});

// Function to suspend a tab (discard it)
async function suspendTab(tabId) {
  if (browser.tabs.discard) {
    try {
      await browser.tabs.discard(tabId);
      console.log(`Suspended tab ${tabId}`);
    } catch (error) {
      console.error(`Failed to suspend tab ${tabId}:`, error);
    }
  } else {
    console.warn(`Discard API not supported in this browser. Unable to suspend tab ${tabId}.`);
    // Alternative logic (e.g., close the tab or notify the user)
  }
}

// Periodically check and suspend inactive tabs
async function checkForInactiveTabs() {
  const now = Date.now();
  const defaultThreshold = 60 * 1000 * 60; // 60 minutes

  try {
    const { inactiveThreshold = 60 } = await browser.storage.sync.get('inactiveThreshold');
    const thresholdMillis = inactiveThreshold * 60 * 1000;

    const tabs = await browser.tabs.query({});
    for (const tab of tabs) {
      const lastActive = tabActivity[tab.id] || now;
      if (!tab.active && now - lastActive > thresholdMillis) {
        await suspendTab(tab.id);
      }
    }
  } catch (error) {
    console.error("Error during inactive tabs check:", error);
  }
}

// Set up an alarm to periodically check for inactive tabs
browser.alarms.create("checkForInactiveTabs", { periodInMinutes: 5 });

browser.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === "checkForInactiveTabs") {
    checkForInactiveTabs();
  }
});

// Listen for runtime messages, e.g., from popup
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "suspendInactiveTabs") {
    checkForInactiveTabs();
    sendResponse({ message: "Inactive tabs suspended" });
  }
  // Return true to indicate asynchronous response if needed
  return true;
});

// Global error handling in the service worker
if (typeof self !== 'undefined' && self.addEventListener) {
  self.addEventListener('error', (event) => {
    console.error("Service Worker Error:", event.message, event);
  });

  self.addEventListener('unhandledrejection', (event) => {
    console.error("Unhandled Rejection:", event.reason);
  });
}

// Initial check for inactive tabs
checkForInactiveTabs();

// Expose functions and data for testing
if (typeof module !== 'undefined') {
  module.exports = { checkForInactiveTabs, tabActivity };
}