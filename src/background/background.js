// src/background/background.js

// Use dependency injection to support both Chrome and Firefox APIs while enabling test mocks
function initBackground(browserInstance = (typeof browser !== 'undefined' ? browser : chrome)) {
  console.log("Background service worker started.");

  // Store tab activity in memory for faster lookups and reduced storage API calls
  const tabActivity = {};

  // Conservative default limit to prevent aggressive tab management on first run
  let TAB_LIMIT = 100;

  // Flag prevents UI race conditions when multiple tag prompts could appear
  let isTaggingPromptActive = false;

  // Track tab activation to maintain accurate usage patterns
  browserInstance.tabs.onActivated.addListener(activeInfo => {
    const tabId = activeInfo.tabId;
    tabActivity[tabId] = Date.now();
    console.log(`Tab activated: ${tabId}`);
  });

  // Update timestamps on page loads to handle refreshes and navigation
  browserInstance.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete') {
      tabActivity[tabId] = Date.now();
      console.log(`Tab updated: ${tabId}`);
    }
  });

  // Clean up memory when tabs are closed to prevent memory leaks
  browserInstance.tabs.onRemoved.addListener(tabId => {
    delete tabActivity[tabId];
    console.log(`Tab removed: ${tabId}`);
  });

  // Fixed threshold provides predictable behavior for initial implementation
  const INACTIVITY_THRESHOLD = 60 * 60 * 1000;

  // Separate inactive tab detection for reusability and testing
  async function getInactiveTabs() {
    const now = Date.now();
    const inactiveTabs = [];

    // Use promises to handle async browser APIs consistently and catch errors
    const tabs = await new Promise((resolve, reject) => {
      browserInstance.tabs.query({}, (result) => {
        if (browserInstance.runtime.lastError) {
          reject(browserInstance.runtime.lastError);
        } else {
          resolve(result);
        }
      });
    });

    // Filter tabs in memory to reduce API calls
    tabs.forEach(tab => {
      const lastActive = tabActivity[tab.id] || now;
      const timeInactive = now - lastActive;
      if (!tab.active && timeInactive > INACTIVITY_THRESHOLD) {
        inactiveTabs.push(tab);
      }
    });

    return inactiveTabs;
  }

  // Wrap tab suspension in promise for consistent error handling across browsers
  async function suspendTab(tabId) {
    // Wrap browser.tabs.discard in Promise for consistent async handling
    if (browserInstance.tabs.discard) {
      return new Promise((resolve, reject) => {
        browserInstance.tabs.discard(tabId, () => {
          if (browserInstance.runtime.lastError) {
            reject(browserInstance.runtime.lastError);
          } else {
            console.log(`Suspended tab ${tabId}`);
            resolve();
          }
        });
      });
    } else {
      console.warn(`Discard API not supported. Unable to suspend tab ${tabId}.`);
      return Promise.resolve();
    }
  }

  // Centralize tab management logic to maintain single source of truth
  async function checkForInactiveTabs() {
    const now = Date.now();

    try {
      // Fetch settings on each check to support real-time updates without restart
      const settings = await new Promise((resolve, reject) => {
        browserInstance.storage.sync.get(['inactiveThreshold', 'tabLimit'], (result) => {
          if (browserInstance.runtime.lastError) {
            reject(browserInstance.runtime.lastError);
          } else {
            resolve(result);
          }
        });
      });
      
      // Calculate threshold once to optimize repeated comparisons
      const thresholdMillis = (settings.inactiveThreshold || 60) * 60 * 1000;
      const tabLimit = settings.tabLimit || 100;

      // Query tabs in single call to minimize API overhead
      const tabs = await new Promise((resolve, reject) => {
        browserInstance.tabs.query({}, (result) => {
          if (browserInstance.runtime.lastError) {
            reject(browserInstance.runtime.lastError);
          } else {
            resolve(result);
          }
        });
      });

      // Handle tab limits before suspension to prioritize user control
      if (tabs.length > tabLimit && !isTaggingPromptActive) {
        // Find oldest inactive tab for consistent user experience
        const inactiveTabs = tabs.filter(tab => !tab.active);
        if (inactiveTabs.length > 0) {
          const oldestTab = inactiveTabs.reduce((oldest, current) => {
            const oldestTime = tabActivity[oldest.id] || now;
            const currentTime = tabActivity[current.id] || now;
            return currentTime < oldestTime ? current : oldest;
          });

          await new Promise((resolve, reject) => {
            browserInstance.runtime.sendMessage(
              { action: 'promptTagging', tabId: oldestTab.id },
              () => {
                if (browserInstance.runtime.lastError) {
                  reject(browserInstance.runtime.lastError);
                } else {
                  browserInstance.storage.local.set({ oldestTabId: oldestTab.id }, resolve);
                  isTaggingPromptActive = true;
                }
              }
            );
          });
          return;
        }
      }

      // Process tabs sequentially to prevent overwhelming browser resources
      for (const tab of tabs) {
        if (!tab.active) {
          const lastActive = tabActivity[tab.id] || now;
          if (now - lastActive > thresholdMillis) {
            await suspendTab(tab.id);
          }
        }
      }
    } catch (error) {
      // Surface errors for debugging and test validation
      console.error("Error during inactive tabs check:", error);
      throw error; // Re-throw for test catching
    }
  }

  // Use message passing to maintain clean separation between UI and background logic
  browserInstance.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // Handle tag completion and cleanup state
    if (message.action === 'tagAdded') {
      const { tabId } = message;
      console.log(`Tag added to tab ${tabId}`);

      // Remove the oldestTabId from storage
      browserInstance.storage.local.remove('oldestTabId', () => {
        if (browserInstance.runtime.lastError) {
          console.error('Error removing oldestTabId:', browserInstance.runtime.lastError.message);
        } else {
          console.log('oldestTabId removed from storage.');
        }
      });

      // Reset the tagging prompt flag
      isTaggingPromptActive = false;

      sendResponse({ message: 'Tag processed successfully.' });
    // Manual suspension trigger for user-initiated actions
    } else if (message.action === 'suspendInactiveTabs') {
      checkForInactiveTabs();
      sendResponse({ message: "Inactive tabs suspended" });
    }
    return true;
  });

  // Monitor new tab creation to enforce limits immediately rather than waiting for periodic checks
browserInstance.tabs.onCreated.addListener(async (tab) => {
  // Query only current window tabs to respect per-window limits and reduce overhead
  const tabs = await new Promise((resolve, reject) => {
    browserInstance.tabs.query({ currentWindow: true }, (result) => {
      // ...existing code...
    });
  });

  // Check against tab limit before proceeding with expensive operations
  if (tabs.length > TAB_LIMIT) {
    // Prevent duplicate prompts which could confuse users and create race conditions
    if (!isTaggingPromptActive) {
      // Reuse existing inactive detection logic for consistency
      const inactiveTabs = await getInactiveTabs();
      // Only proceed if we have candidates for tagging/suspension
      if (inactiveTabs.length > 0) {
        // Find the least recently used tab by comparing timestamps
        // Default to current time if no activity recorded to handle edge cases
        const oldestTab = inactiveTabs.reduce((oldest, current) => {
          // ...existing code...
        }, inactiveTabs[0]);

        // Notify UI to prompt for tagging before suspending
        // This maintains user control over tab management
        browserInstance.runtime.sendMessage({ action: 'promptTagging', tabId: oldestTab.id }, () => {
          if (browserInstance.runtime.lastError) {
            // ...existing code...
          } else {
            // Store tab ID for recovery if browser crashes during tagging
            browserInstance.storage.local.set({ oldestTabId: oldestTab.id }, () => {
              // ...existing code...
            });
            // Lock tagging system until user responds
            isTaggingPromptActive = true;
          }
        });
      }
    }
  }
});

  // Use alarms API for reliable background tasks that persist across browser sessions
  browserInstance.alarms.create("checkForInactiveTabs", { periodInMinutes: 5 });

  browserInstance.alarms.onAlarm.addListener(alarm => {
    if (alarm.name === "checkForInactiveTabs") {
      checkForInactiveTabs();
    }
  });

  // Centralize error handling to prevent silent failures in background process
  if (typeof self !== 'undefined' && self.addEventListener) {
    self.addEventListener('error', (event) => {
      console.error("Service Worker Error:", event.message, event);
    });

    self.addEventListener('unhandledrejection', (event) => {
      console.error("Unhandled Rejection:", event.reason);
    });
  }

  // Initial check for inactive tabs (only if not in test environment)
  if (typeof process === 'undefined' || process.env.NODE_ENV !== 'test') {
    checkForInactiveTabs();
  }

  // Export minimal interface to maintain encapsulation while supporting tests
  return {
    checkForInactiveTabs,
    suspendTab,
    tabActivity,
    getIsTaggingPromptActive: () => isTaggingPromptActive,
    setIsTaggingPromptActive: (value) => {
      isTaggingPromptActive = value;
    },
  };
}

// Support both direct usage and testing scenarios
module.exports = initBackground;

// Initialize only in production to prevent test environment conflicts
if (typeof process === 'undefined' || process.env.NODE_ENV !== 'test') {
  initBackground();
}