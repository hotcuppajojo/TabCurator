// src/background/background.js
/**
 * @fileoverview Background service worker module for TabCurator extension.
 * Manages tab lifecycle, rule processing, session handling, and automated maintenance tasks.
 * Ensures compatibility with both Chrome and Firefox using the WebExtension API.
 */
import browser from 'webextension-polyfill'; // Import the browser API polyfill
import { queryTabs, getTab } from '../utils/tabUtils.js'; // Import tab management utilities
import { archiveTab } from '../utils/tagUtils.js'; // Import tab tagging utilities
import { suspendTab } from '../utils/suspensionUtils.js'; // Import tab suspension utilities
import { store } from '../utils/stateManager.js'; // Import the Redux store

/**
 * Background service worker module for TabCurator extension.
 * @module background
 * @exports background
 * @description Manages tab lifecycle, rule processing, session handling, and automated maintenance tasks.
 */
const background = {
  /**
   * Applies rules to a tab for automated organization.
   * Matches tabs based on URL/title against the ruleset and performs actions like archiving.
   *
   * @param {browser.tabs.Tab} tab - Tab object to evaluate.
   * @param {object} browserInstance - Browser API instance.
   * @returns {Promise<void>}
   */
  async applyRulesToTab(tab, browserInstance) {
    if (!browserInstance?.storage) {
      console.error("Invalid browser instance provided to applyRulesToTab.");
      return;
    }
    try {
      const data = await browserInstance.storage.sync.get("rules");
      const rules = data.rules || [];
      for (const rule of rules) {
        if (tab.url.includes(rule.condition) || tab.title.includes(rule.condition)) {
          const [actionType, tag] = rule.action.split(": ");
          if (actionType === 'Tag') {
            const tabData = { title: tab.title, url: tab.url };
            await archiveTab(tab.id, tag, store.getState().archivedTabs);
            store.dispatch({ type: 'ARCHIVE_TAB', tag, tabData });
            await browserInstance.tabs.remove(tab.id); // Encapsulated tab removal
            console.log(`Rule applied: Archived tab '${tab.title}' under tag '${tag}'.`);
            break;
          }
        }
      }
    } catch (error) {
      console.error(`Error applying rules to tab (ID: ${tab.id}):`, error);
    }
  },

  /**
   * Saves the current window's tabs as a named session.
   *
   * @param {string} sessionName - Unique identifier for the session.
   * @param {object} browserInstance - Browser API instance.
   * @returns {Promise<Array>} Array of saved tab metadata.
   */
  async saveSession(sessionName, browserInstance) {
    try {
      const tabs = await browserInstance.tabs.query({ currentWindow: true });
      const sessionTabs = tabs.map(({ title, url }) => ({ title, url }));
      store.dispatch({ type: 'SAVE_SESSION', sessionName, sessionTabs });
      await browserInstance.storage.sync.set({ savedSessions: store.getState().savedSessions });
      console.log(`Session '${sessionName}' saved with ${sessionTabs.length} tabs.`);
      return sessionTabs;
    } catch (error) {
      console.error(`Error saving session '${sessionName}':`, error);
      throw error;
    }
  },

  /**
   * Restores a saved session.
   *
   * @param {string} sessionName - Session identifier to restore.
   * @param {object} browserInstance - Browser API instance.
   * @returns {Promise<void>}
   */
  async restoreSession(sessionName, browserInstance) {
    const sessionTabs = store.getState().savedSessions[sessionName];
    if (sessionTabs) {
      for (const tab of sessionTabs) {
        await browserInstance.tabs.create({ url: tab.url });
      }
      console.log(`Session '${sessionName}' restored successfully.`);
    } else {
      console.warn(`Session '${sessionName}' not found.`);
    }
  },

  /**
   * Monitors and manages inactive tabs.
   * Suspends or prompts tagging based on inactivity thresholds.
   *
   * @param {object} browserInstance - Browser API instance.
   * @param {number} tabLimit - Maximum allowed tabs before intervention.
   * @returns {Promise<void>}
   */
  async checkForInactiveTabs(browserInstance, tabLimit = 100) {
    try {
      const now = Date.now();
      const tabs = await queryTabs({});
      if (tabs.length > tabLimit) {
        const inactiveTabs = tabs.filter(tab => !tab.active);
        if (inactiveTabs.length > 0) {
          const oldestTab = inactiveTabs.reduce((oldest, current) => {
            const oldestTime = store.getState().tabActivity[oldest.id] || now;
            const currentTime = store.getState().tabActivity[current.id] || now;
            return currentTime < oldestTime ? current : oldest;
          });
          browserInstance.runtime.sendMessage({ action: 'promptTagging', tabId: oldestTab.id });
          console.log(`Prompting tagging for oldest inactive tab: ${oldestTab.title}`);
        }
      }
      for (const tab of tabs) {
        const lastActive = store.getState().tabActivity[tab.id] || now;
        if (!tab.active && now - lastActive > 60 * 60 * 1000) {
          await suspendTab(tab.id);
          console.log(`Tab suspended: ${tab.title}`);
        }
      }
    } catch (error) {
      console.error("Error during tab management:", error);
    }
  },

  /**
   * Initializes the background service worker.
   * Sets up event handlers, message listeners, and persistent storage defaults.
   *
   * @param {object} browserInstance - Browser API instance.
   */
  async initBackground(browserInstance = browser) {
    if (!browserInstance?.tabs) {
      console.error("Invalid browser instance provided to initBackground.");
      return;
    }

    console.log("Background service worker started.");

    // Set default storage values on extension installation
    browserInstance.runtime.onInstalled.addListener(async () => {
      try {
        await browserInstance.storage.sync.set({
          inactiveThreshold: 60,
          tabLimit: 100,
          rules: [],
        });
        console.log("Default settings initialized.");
      } catch (error) {
        console.error("Error initializing default settings:", error);
      }

      // Register declarativeNetRequest rules
      try {
        await browserInstance.declarativeNetRequest.updateDynamicRules({
          addRules: [],
          removeRuleIds: []
        });
        console.log("Declarative Net Request rules registered.");
      } catch (error) {
        console.error("Error registering declarativeNetRequest rules:", error);
      }
    });

    browserInstance.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
      console.log("Message received from:", sender.url || "Unknown sender");
      try {
        switch (message.action) {
          case "saveSession":
            await saveSessionHandler(message.sessionName, browserInstance);
            sendResponse({ success: true });
            break;

          case "restoreSession":
            await restoreSessionHandler(message.sessionName, browserInstance);
            sendResponse({ success: true });
            break;

          case "DISPATCH_ACTION":
            store.dispatch(message.payload);
            sendResponse({ success: true });
            break;

          case "GET_STATE":
            sendResponse({ state: store.getState() });
            break;

          default:
            console.warn("Unknown action:", message.action);
            sendResponse({ error: "Unknown action" });
        }
      } catch (error) {
        console.error("Error handling message:", error);
        sendResponse({ error: error.message });
      }
      return true;
    });

    browserInstance.tabs.onActivated.addListener(({ tabId }) => {
      store.dispatch({ type: "UPDATE_TAB_ACTIVITY", tabId, timestamp: Date.now() });
      console.log(`Tab activated: ${tabId}`);
    });

    browserInstance.alarms.create("checkForInactiveTabs", { periodInMinutes: 5 });
    browserInstance.alarms.onAlarm.addListener(async (alarm) => {
      if (alarm.name === "checkForInactiveTabs") {
        try {
          await this.checkForInactiveTabs(browserInstance);
        } catch (error) {
          console.error("Error checking for inactive tabs:", error);
        }
      }
    });

    try {
      await this.checkForInactiveTabs(browserInstance);
    } catch (error) {
      console.error("Initial inactive tab check failed:", error);
    }
  },
};

/**
 * Saves the current session and handles errors.
 * @param {string} sessionName - Name of the session.
 * @param {object} browserInstance - Browser API instance.
 */
async function saveSessionHandler(sessionName = "Untitled Session", browserInstance) {
  try {
    await background.saveSession(sessionName, browserInstance);
    console.log(`Session '${sessionName}' saved.`);
  } catch (error) {
    console.error(`Error saving session '${sessionName}':`, error);
    throw error;
  }
}

/**
 * Restores a saved session and handles errors.
 * @param {string} sessionName - Name of the session to restore.
 * @param {object} browserInstance - Browser API instance.
 */
async function restoreSessionHandler(sessionName, browserInstance) {
  try {
    await background.restoreSession(sessionName, browserInstance);
    console.log(`Session '${sessionName}' restored.`);
  } catch (error) {
    console.error(`Error restoring session '${sessionName}':`, error);
    throw error;
  }
}

// Support both testing and service worker environments
if (typeof module !== 'undefined' && module.exports) {
  /**
   * Export the background module for testing or external use.
   * This ensures compatibility with Node.js testing environments.
   */
  module.exports = background;
} else {
  /**
   * Initialize the background service worker when running in the browser context.
   * This entry point sets up the extension's background processes.
   */
  background.initBackground(browser);
}