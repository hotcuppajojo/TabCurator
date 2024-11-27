// src/background/background.js

// Use dependency injection to support both Chrome and Firefox APIs while enabling test mocks
function initBackground(browserInstance = (typeof browser !== 'undefined' ? browser : chrome), actionHistoryRef = [], archivedTabsRef = {}) {
  console.log("Background service worker started.");

  // Use the provided references or default to new ones
  const actionHistory = actionHistoryRef;
  const archivedTabs = archivedTabsRef;

  // Store tab activity in memory for faster lookups and reduced storage API calls
  const tabActivity = {};

  // Default tab limit
  let TAB_LIMIT = 100;

  // Prevents multiple simultaneous tagging prompts
  let isTaggingPromptActive = false;

  // Initialize default settings during installation or update
  browserInstance.runtime.onInstalled.addListener(() => {
    browserInstance.storage.sync.set({
      inactiveThreshold: 60,
      tabLimit: 100,
      rules: [], // Empty array for user-defined rules
    });
    console.log('Default settings initialized.');
  });

  // Function to archive a tab
  async function archiveTab(tabId, tag) {
    try {
      const tab = await new Promise((resolve, reject) => {
        browserInstance.tabs.get(tabId, (result) => {
          if (browserInstance.runtime.lastError) {
            reject(browserInstance.runtime.lastError);
          } else {
            resolve(result);
          }
        });
      });

      archivedTabs[tag] = archivedTabs[tag] || [];
      archivedTabs[tag].push({
        title: tab.title,
        url: tab.url
      });

      actionHistory.push({
        type: 'archive',
        tab,
        tag
      });

      await browserInstance.tabs.remove(tabId);
      console.log(`Tab ${tabId} archived with tag: ${tag}`);
    } catch (error) {
      console.error(`Failed to archive tab ${tabId}:`, error);
    }
  }

  // Function to undo the last action
  async function undoLastAction() {
    const lastAction = actionHistory.pop();
    if (lastAction && lastAction.type === 'archive') {
      const newTab = await browserInstance.tabs.create({ 
        url: lastAction.tab.url,
        active: true
      });
      
      if (archivedTabs[lastAction.tag]) {
        archivedTabs[lastAction.tag] = archivedTabs[lastAction.tag]
          .filter(t => t.url !== lastAction.tab.url);
      }
      
      return newTab;
    }
    return null;
  }

  // Track tab activation to maintain accurate usage patterns
  browserInstance.tabs.onActivated.addListener(activeInfo => {
    const tabId = activeInfo.tabId;
    tabActivity[tabId] = Date.now();
    console.log(`Tab activated: ${tabId}`);
  });

  // Update the onUpdated listener to ensure actionHistory is populated correctly
  browserInstance.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete') {
      const storedData = await browserInstance.storage.sync.get('rules');
      const rules = storedData.rules || [];
  
      for (const rule of rules) {
        if (tab.url.includes(rule.keyword) || tab.title.includes(rule.keyword)) {
          if (rule.action === 'archive') {
            await archiveTab(tabId, rule.tag);
            console.log(`Tab ${tabId} archived based on rule.`);
          } else if (rule.action === 'suspend') {
            await suspendTab(tabId);
            console.log(`Tab ${tabId} suspended based on rule.`);
          }
          break;
        }
      }
    }
  });

  // Remove tab activity when tabs are closed
  browserInstance.tabs.onRemoved.addListener(tabId => {
    delete tabActivity[tabId];
    console.log(`Tab removed: ${tabId}`);
  });

  // Threshold for inactive tabs (default 60 minutes)
  const INACTIVITY_THRESHOLD = 60 * 60 * 1000;

  // Identify inactive tabs
  async function getInactiveTabs() {
    const now = Date.now();
    const tabs = await browserInstance.tabs.query({});
    return tabs.filter(tab => {
      const lastActive = tabActivity[tab.id] || now;
      const timeInactive = now - lastActive;
      return !tab.active && timeInactive > INACTIVITY_THRESHOLD;
    });
  }

  // Suspend a specific tab
  async function suspendTab(tabId) {
    if (browserInstance.tabs.discard) {
      await browserInstance.tabs.discard(tabId);
      console.log(`Tab suspended: ${tabId}`);
    } else {
      console.warn("Tab discard API not supported.");
    }
  }

  // Check for inactive tabs and handle them
  async function checkForInactiveTabs() {
    try {
      const now = Date.now();

      const tabs = await browserInstance.tabs.query({});
      if (tabs.length > TAB_LIMIT && !isTaggingPromptActive) {
        const inactiveTabs = tabs.filter(tab => !tab.active);
        if (inactiveTabs.length > 0) {
          const oldestTab = inactiveTabs.reduce((oldest, current) => {
            const oldestTime = tabActivity[oldest.id] || now;
            const currentTime = tabActivity[current.id] || now;
            return currentTime < oldestTime ? current : oldest;
          });

          // Trigger tagging prompt
          browserInstance.runtime.sendMessage(
            { action: 'promptTagging', tabId: oldestTab.id },
            () => {
              isTaggingPromptActive = true;
              console.log(`Prompting user to tag tab: ${oldestTab.id}`);
            }
          );
        }
      }

      // Suspend inactive tabs
      for (const tab of tabs) {
        const lastActive = tabActivity[tab.id] || now;
        if (!tab.active && now - lastActive > INACTIVITY_THRESHOLD) {
          await suspendTab(tab.id);
        }
      }
    } catch (error) {
      console.error("Error during tab management:", error);
    }
  }

  // Handle messaging from other scripts
  browserInstance.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'tagAdded') {
      console.log(`Tag added for tab ${message.tabId}`);
      isTaggingPromptActive = false;
      browserInstance.storage.local.remove('oldestTabId');
      sendResponse({ message: 'Tag processed successfully.' });
    } else if (message.action === 'suspendInactiveTabs') {
      checkForInactiveTabs().then(() => {
        sendResponse({ success: true });
      });
    } else if (message.action === 'undoLastAction') {
      // Fix: properly await and handle the undoLastAction result
      (async () => {
        try {
          const result = await undoLastAction();
          sendResponse({ success: true, result });
        } catch (error) {
          console.error('Error in undoLastAction:', error);
          sendResponse({ success: false, error: error.message });
        }
      })();
      return true; // Keep message channel open
    } else {
      // Handle unrecognized message actions
      console.warn(`Unhandled message action: ${message.action}`);
      sendResponse({ success: false, error: 'Unrecognized action.' });
    }
    return true;
  });

  // Check for inactive tabs periodically
  browserInstance.alarms.create("checkForInactiveTabs", { periodInMinutes: 5 });

  browserInstance.alarms.onAlarm.addListener(alarm => {
    if (alarm.name === "checkForInactiveTabs") {
      checkForInactiveTabs();
    }
  });

  // Initialize
  checkForInactiveTabs();

  // Handle global errors in service worker
  if (typeof self !== 'undefined') {
    self.addEventListener('error', (event) => {
      console.error("Service Worker Error:", event.message);
    });
    self.addEventListener('unhandledrejection', (event) => {
      console.error("Unhandled Rejection:", event.reason);
    });
  }

  // Update tab listeners to properly handle async operations
  browserInstance.tabs.onCreated.addListener(async (tab) => {
    tabActivity[tab.id] = Date.now();
    console.log(`Tab created: ${tab.id}`);
  });

  // Return interface for testing
  return {
    checkForInactiveTabs,
    suspendTab,
    tabActivity,
    archivedTabs,
    actionHistory,
    getIsTaggingPromptActive: () => isTaggingPromptActive,
    setIsTaggingPromptActive: (value) => {
      isTaggingPromptActive = value;
    },
    archiveTab,
    undoLastAction,
    tabs: browserInstance.tabs, // Expose tabs for testing
  };
}

// Export for tests while still initializing in production
if (typeof module !== 'undefined' && module.exports) {
  module.exports = initBackground;
} else {
  initBackground();
}