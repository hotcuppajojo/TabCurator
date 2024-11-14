// src/background/background.js

console.log("Background service worker started.");

// Polyfill for browser APIs to ensure cross-browser compatibility
const browser = typeof browser !== 'undefined' ? browser : (typeof chrome !== 'undefined' ? chrome : {});

// Store the last active time for each tab
const tabActivity = {};

// Update the last active time when a tab is activated
browser.tabs.onActivated.addListener(activeInfo => {
  const tabId = activeInfo.tabId;
  tabActivity[tabId] = Date.now();
  console.log(`Tab activated: ${tabId}`);
});

// Update the last active time when a tab is updated
browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete') {
    tabActivity[tabId] = Date.now();
    console.log(`Tab updated: ${tabId}`);
  }
});

// Remove tab from activity tracking when it's closed
browser.tabs.onRemoved.addListener(tabId => {
  delete tabActivity[tabId];
  console.log(`Tab removed: ${tabId}`);
});

// Define inactivity threshold in milliseconds (default 60 minutes)
const INACTIVITY_THRESHOLD = 60 * 60 * 1000;

// Function to detect inactive tabs
async function getInactiveTabs() {
  const now = Date.now();
  const inactiveTabs = [];

  const tabs = await browser.tabs.query({});

  tabs.forEach(tab => {
    const lastActive = tabActivity[tab.id] || now;
    const timeInactive = now - lastActive;
    if (!tab.active && timeInactive > INACTIVITY_THRESHOLD) {
      inactiveTabs.push(tab);
    }
  });

  return inactiveTabs;
}

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
    console.warn(`Discard API not supported. Unable to suspend tab ${tabId}.`);
  }
}

// Periodically check and suspend inactive tabs
async function checkForInactiveTabs() {
  const now = Date.now();

  try {
    const { inactiveThreshold = 60 } = await new Promise((resolve) => {
      browser.storage.sync.get('inactiveThreshold', (result) => {
        resolve(result);
      });
    });

    const thresholdMillis = inactiveThreshold * 60 * 1000;
    const tabs = await browser.tabs.query({});

    for (const tab of tabs) {
      const lastActive = tabActivity[tab.id] || now;
      if (!tab.active && now - lastActive > thresholdMillis) {
        await module.exports.suspendTab(tab.id); // Updated to use the exported suspendTab
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
if (typeof process === 'undefined' || process.env.NODE_ENV !== 'test') {
  checkForInactiveTabs();
}

// Expose functions and data for testing
if (typeof module !== 'undefined') {
  module.exports = {
    checkForInactiveTabs,
    suspendTab,
    tabActivity,
  };
}