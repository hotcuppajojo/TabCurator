// src/background/background.js

// Simple in-memory state management chosen for performance and reduced complexity
// Avoiding complex state management libraries keeps the extension lightweight
const actionHistory = []; // Stack-based history enables simple undo operations
const archivedTabs = {}; // Hash map structure optimizes tag-based lookups
const tabActivity = {}; // Timestamp tracking enables intelligent tab management
let isTaggingPromptActive = false; // Mutex prevents prompt spam
let savedSessions = {}; // In-memory cache improves session restoration speed

// Configurable constants enable easy tuning of extension behavior
const DEFAULT_TAB_LIMIT = 100; // Threshold based on Chrome performance metrics
const INACTIVITY_THRESHOLD = 60 * 60 * 1000; // 1hr provides balance between memory usage and UX

// Manages tab lifecycle based on usage patterns
// Implements progressive enhancement - starts with basic prompt, adds suspension if supported
async function checkForInactiveTabs(browserInstance, tabLimit = DEFAULT_TAB_LIMIT) {
  try {
    const now = Date.now();
    
    // Query all tabs at once to minimize API calls
    const tabs = await browserInstance.tabs.query({});
    if (tabs.length > tabLimit && !isTaggingPromptActive) {
      // Filter inactive tabs in memory rather than with additional queries
      const inactiveTabs = tabs.filter(tab => !tab.active);
      if (inactiveTabs.length > 0) {
        // Reduce operation finds oldest tab in single pass through array
        const oldestTab = inactiveTabs.reduce((oldest, current) => {
          const oldestTime = tabActivity[oldest.id] || now;
          const currentTime = tabActivity[current.id] || now;
          return currentTime < oldestTime ? current : oldest;
        });

        // Async message handles UI prompt without blocking tab management
        browserInstance.runtime.sendMessage(
          { action: 'promptTagging', tabId: oldestTab.id },
          () => {
            isTaggingPromptActive = true;
            console.log(`Prompting user to tag tab: ${oldestTab.id}`);
          }
        );
      }
    }

    // Batch process inactive tabs to reduce number of suspend operations
    for (const tab of tabs) {
      const lastActive = tabActivity[tab.id] || now;
      if (!tab.active && now - lastActive > INACTIVITY_THRESHOLD) {
        await suspendTab(tab.id, browserInstance);
      }
    }
  } catch (error) {
    console.error("Error during tab management:", error);
  }
}

// Rules engine separated from main init for modularity and testing
// Promise-based implementation ensures reliable rule application
async function applyRulesToTab(tab, browserInstance) {
  return new Promise((resolve, reject) => {
    // Access rules from sync storage to ensure latest rules are applied
    browserInstance.storage.sync.get("rules", async (data) => {
      try {
        const rules = data.rules || [];
        // Sequential rule processing ensures predictable behavior
        for (const rule of rules) {
          // URL and title matching provides flexibility in rule definitions
          if (tab.url.includes(rule.condition) || tab.title.includes(rule.condition)) {
            // Action type parsing allows for extensible rule system
            const [actionType, tag] = rule.action.split(": ");
            if (actionType === 'Tag') {
              await archiveTab(tab.id, tag, browserInstance);
            } else if (actionType === 'Suspend') {
              await suspendTab(tab.id, browserInstance);
            }
          }
        }
        resolve();
      } catch (error) {
        reject(error);
      }
    });
  });
}

// Session management uses sync storage for cross-device compatibility
// Minimal data structure reduces storage quota usage
async function saveSession(sessionName, browserInstance) {
  const tabs = await browserInstance.tabs.query({ currentWindow: true });
  const sessionTabs = tabs.map((tab) => ({ title: tab.title, url: tab.url }));
  savedSessions[sessionName] = sessionTabs;
  await browserInstance.storage.sync.set({ savedSessions });
  alert(`Session "${sessionName}" saved successfully!`);
}

// Async tab restoration prevents UI freezing during bulk operations
// Sequential creation maintains tab order and reduces browser strain
async function restoreSession(sessionName, browserInstance) {
  const sessionTabs = savedSessions[sessionName];
  if (sessionTabs) {
    for (const tab of sessionTabs) {
      await browserInstance.tabs.create({ url: tab.url });
    }
    alert(`Session "${sessionName}" restored successfully!`);
  } else {
    alert(`Session "${sessionName}" not found.`);
  }
}

// Promise-based tab archiving ensures state consistency
// Maintains undo history for reliability
async function archiveTab(tabId, tag, browserInstance) {
  try {
    // Wrap callback API in promise for cleaner async handling
    const tab = await new Promise((resolve, reject) => {
      browserInstance.tabs.get(tabId, (result) => {
        if (browserInstance.runtime.lastError) {
          reject(browserInstance.runtime.lastError);
        } else {
          resolve(result);
        }
      });
    });

    // Initialize tag array if needed using short-circuit evaluation
    archivedTabs[tag] = archivedTabs[tag] || [];
    // Store minimal tab data to reduce memory footprint
    archivedTabs[tag].push({
      title: tab.title,
      url: tab.url
    });

    // Track action for undo support
    actionHistory.push({
      type: 'archive',
      tab,
      tag
    });

    // Remove tab only after successful archive
    await browserInstance.tabs.remove(tabId);
    console.log(`Tab ${tabId} archived with tag: ${tag}`);
  } catch (error) {
    console.error(`Failed to archive tab ${tabId}:`, error);
  }
}

// Leverages native tab discarding for optimal memory management
// Falls back gracefully when API unavailable
async function suspendTab(tabId, browserInstance) {
  if (browserInstance.tabs.discard) {
    await browserInstance.tabs.discard(tabId);
    console.log(`Tab suspended: ${tabId}`);
  } else {
    console.warn("Tab discard API not supported.");
  }
}

// Stack-based undo system provides predictable behavior
// Filters archived tabs to maintain data consistency
async function undoLastAction(browserInstance) {
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

// Global error boundary prevents extension crashes
// Logs errors for debugging while maintaining stability
if (typeof self !== 'undefined') {
  self.addEventListener('error', (event) => {
    console.error("Service Worker Error:", event.message);
  });

  self.addEventListener('unhandledrejection', (event) => {
    console.error("Unhandled Rejection:", event.reason);
  });
}

// Browser-agnostic initialization via dependency injection
// Enables testing and cross-browser compatibility
function initBackground(browserInstance = (typeof browser !== 'undefined' ? browser : chrome)) {
  console.log("Background service worker started.");

  // Error handlers initialized first to catch startup issues
  if (typeof self !== 'undefined') {
    self.addEventListener('error', (event) => {
      console.error("Service Worker Error:", event.message);
    });
    self.addEventListener('unhandledrejection', (event) => {
      console.error("Unhandled Rejection:", event.reason);
    });
  }

  // Reset state
  actionHistory.length = 0;
  Object.keys(archivedTabs).forEach(key => delete archivedTabs[key]);

  // Message handler uses switch for maintainability
  // Async responses handled via callback pattern
  browserInstance.runtime.onMessage.addListener((message, sender, sendResponse) => {
    try {
      switch (message.action) {
        // Handle tag completion and reset prompt state
        case 'tagAdded':
          isTaggingPromptActive = false;
          // Clean up stored tab reference
          browserInstance.storage.local.remove('oldestTabId');
          sendResponse({ message: 'Tag processed successfully.' });
          break;
        // Session operations dispatched to dedicated handlers
        case 'saveSession':
          saveSession(message.sessionName, browserInstance);
          sendResponse({ success: true });
          break;
        case 'getSessions':
          sendResponse({ sessions: savedSessions });
          break;
        case 'restoreSession':
          restoreSession(message.sessionName, browserInstance);
          sendResponse({ success: true });
          break;
        case 'undoLastAction':
          (async () => {
            const result = await undoLastAction(browserInstance);
            sendResponse({ success: true, result });
          })();
          return true; // Keep channel open for async response
        default:
          sendResponse({ error: 'Unknown action' });
      }
    } catch (error) {
      console.error('Error handling message:', error);
      sendResponse({ error: error.message });
    }
  });

  // Tab lifecycle hooks coordinate state management
  // Event-driven architecture reduces polling overhead
  browserInstance.tabs.onActivated.addListener((activeInfo) => {
    // Update activity timestamp when tab gains focus
    tabActivity[activeInfo.tabId] = Date.now();
    console.log(`Tab activated: ${activeInfo.tabId}`);
  });

  browserInstance.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete') {
      await applyRulesToTab(tab, browserInstance);
    }
  });

  browserInstance.tabs.onRemoved.addListener((tabId) => {
    delete tabActivity[tabId];
    console.log(`Tab removed: ${tabId}`);
  });

  browserInstance.tabs.onCreated.addListener(async (tab) => {
    tabActivity[tab.id] = Date.now();
    console.log(`Tab created: ${tab.id}`);
    await applyRulesToTab(tab, browserInstance);
  });

  // Alarm-based checks prefer battery life over immediacy
  // 5-minute interval balances responsiveness and resource usage
  browserInstance.alarms.create("checkForInactiveTabs", { periodInMinutes: 5 });
  browserInstance.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === "checkForInactiveTabs") {
      checkForInactiveTabs(browserInstance);
    }
  });

  // Initialize sessions
  initSessions(browserInstance);

  // Initial check
  checkForInactiveTabs(browserInstance);
}

// Session sync ensures consistent experience across devices
// Change listeners maintain real-time state updates
function initSessions(browserInstance) {
  if (!browserInstance) return;
  
  browserInstance.storage.sync.get("savedSessions", (data) => {
    savedSessions = data.savedSessions || {};
  });
  
  browserInstance.storage.onChanged.addListener((changes, area) => {
    if (area === "sync" && changes.savedSessions) {
      savedSessions = changes.savedSessions.newValue;
    }
  });
}

// Module exports support testing and external consumption
// Getter/setter pattern encapsulates internal state
module.exports = {
  initBackground,
  checkForInactiveTabs,
  suspendTab,
  tabActivity,
  archivedTabs,
  actionHistory,
  archiveTab,
  undoLastAction,
  saveSession,
  restoreSession,
  savedSessions,
  getIsTaggingPromptActive: () => isTaggingPromptActive,
  setIsTaggingPromptActive: (value) => {
    isTaggingPromptActive = value;
  },
  applyRulesToTab
};