// src/background/background.js
/**
 * @fileoverview Background service worker module for TabCurator extension.
 * Manages tab lifecycle, rule processing, session handling, and automated maintenance tasks.
 * Ensures compatibility with both Chrome and Firefox using the WebExtension API.
 */
import browser from 'webextension-polyfill'; // Import the browser API polyfill
import { 
  queryTabs, 
  getTab, 
  createTab, 
  updateTab, 
  removeTab, 
  discardTab,
  suspendTab,
  suspendInactiveTabs 
} from '../utils/tabManager.js';

import { 
  store, 
  initializeStateFromStorage, 
  updateRulesHandler,
  saveSessionHandler, 
  restoreSessionHandler, 
  getSessions, 
  deleteSessionHandler 
} from '../utils/stateManager.js';

import { 
  handleMessage, 
  initializeConnection, 
  sendMessage 
} from '../utils/messagingUtils.js';

import { archiveTab, applyRulesToTab } from '../utils/tagUtils.js';

/**
 * Background service worker module for TabCurator extension.
 * @module background
 * @exports background
 * @description Manages tab lifecycle, rule processing, session handling, and automated maintenance tasks.
 */
const background = {
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
          
          // Use getTab to verify tab still exists
          const tab = await getTab(oldestTab.id);
          if (tab) {
            browserInstance.runtime.sendMessage({ action: 'promptTagging', tabId: tab.id });
            console.log(`Prompting tagging for oldest inactive tab: ${tab.title}`);
          }
        }
      }
      for (const tab of tabs) {
        const lastActive = store.getState().tabActivity[tab.id] || now;
        if (!tab.active && now - lastActive > 60 * 60 * 1000) {
          // Use discardTab instead of suspendTab for consistency
          await discardTab(tab.id);
          console.log(`Tab discarded: ${tab.title}`);
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
   * Enhanced to ensure stability and handle unexpected disconnections gracefully.
   */
  async initBackground(browserInstance = browser) {
    try {
      await initializeStateFromStorage();
      if (!browserInstance?.tabs || !browserInstance?.alarms || !browserInstance?.runtime) {
        console.error("Required browser APIs are unavailable.");
        return;
      }

      // Initialize connection utilities
      initializeConnection(sendMessage);

      // Ensure Redux store is initialized with default state
      store.dispatch({ type: 'RESET_STATE' });

      console.log("Background service worker started.");

      // Add null checks for tabs.onUpdated
      if (browserInstance.tabs.onUpdated && browserInstance.tabs.onUpdated.addListener) {
        browserInstance.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
          if (changeInfo.status === 'complete') {
            applyRulesToTab(tab, browserInstance, store);
          }
        });
      } else {
        console.warn("tabs.onUpdated.addListener is not available.");
      }

      // Add null checks for tabs.onCreated
      if (browserInstance.tabs.onCreated && browserInstance.tabs.onCreated.addListener) {
        browserInstance.tabs.onCreated.addListener((tab) => {
          store.dispatch({ type: "UPDATE_TAB_ACTIVITY", tabId: tab.id, timestamp: Date.now() });
        });
      } else {
        console.warn("tabs.onCreated.addListener is not available.");
      }

      // Set default storage values on extension installation
      if (browserInstance.runtime.onInstalled && browserInstance.runtime.onInstalled.addListener) {
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
              addRules: [
                // Example rule
                {
                  id: 1,
                  priority: 1,
                  action: { type: 'block' },
                  condition: { urlFilter: 'https://example.com/*' }
                }
              ],
              removeRuleIds: []
            });
            console.log("Declarative Net Request rules registered.");
          } catch (error) {
            console.error("Error registering declarativeNetRequest rules:", error);
          }
        });
      } else {
        console.warn("runtime.onInstalled.addListener is not available.");
      }

      // Add null checks for runtime.onMessage
      if (browserInstance.runtime.onMessage && browserInstance.runtime.onMessage.addListener) {
        browserInstance.runtime.onMessage.addListener((message, sender, sendResponse) => {
          handleMessage(message, sender, sendResponse, browser, store);
          return true;
        });
      } else {
        console.warn("runtime.onMessage.addListener is not available.");
      }

      // Add null checks for tabs.onActivated
      if (browserInstance.tabs.onActivated && browserInstance.tabs.onActivated.addListener) {
        browserInstance.tabs.onActivated.addListener(({ tabId }) => {
          store.dispatch({ type: "UPDATE_TAB_ACTIVITY", tabId, timestamp: Date.now() });
          console.log(`Tab activated: ${tabId}`);
        });
      } else {
        console.warn("tabs.onActivated.addListener is not available.");
      }

      // Add null checks for alarms
      if (browserInstance.alarms) {
        browserInstance.alarms.create("checkForInactiveTabs", { periodInMinutes: 5 });
        if (browserInstance.alarms.onAlarm && browserInstance.alarms.onAlarm.addListener) {
          browserInstance.alarms.onAlarm.addListener(async (alarm) => {
            if (alarm.name === "checkForInactiveTabs") {
              try {
                await this.checkForInactiveTabs(browserInstance);
              } catch (error) {
                console.error("Error checking for inactive tabs:", error);
              }
            }
          });
        } else {
          console.warn("alarms.onAlarm.addListener is not available.");
        }
      } else {
        console.warn("alarms API is not available.");
      }

      try {
        await this.checkForInactiveTabs(browserInstance);
      } catch (error) {
        console.error("Initial inactive tab check failed:", error);
      }

      // Add null checks for runtime.onConnect
      if (browserInstance.runtime.onConnect && browserInstance.runtime.onConnect.addListener) {
        browserInstance.runtime.onConnect.addListener((port) => {
          if (port.name === 'tabActivity') {
            console.log('Port connected:', port.name);
            
            // Track connected ports
            const connectedPorts = new Set();
            connectedPorts.add(port);
            
            port.onMessage.addListener(async (message) => {
              if (!connectedPorts.has(port)) return;
              
              try {
                if (message.type === 'CONNECT_REQUEST') {
                  port.postMessage({ 
                    type: 'CONNECTION_ACK',
                    timestamp: Date.now()
                  });
                  return;
                }

                console.log('Message from content script:', message);
                switch (message.action) {
                  case "saveSession":
                  case "SAVE_SESSION":
                    await saveSessionHandler(message.sessionName, browserInstance);
                    port.postMessage({ success: true });
                    break;

                  case "archiveTab":
                  case "ARCHIVE_TAB":
                    await archiveTab(message.tabId, message.tags, browserInstance);
                    port.postMessage({ success: true });
                    break;

                  case "restoreSession":
                  case "RESTORE_SESSION":
                    await restoreSessionHandler(message.sessionName, browserInstance);
                    port.postMessage({ success: true });
                    break;

                  case "suspendInactiveTabs":
                    await suspendInactiveTabs(browserInstance);
                    port.postMessage({ success: true });
                    break;

                  case "getSessions":
                    const sessions = await getSessions(browserInstance);
                    port.postMessage({ sessions });
                    break;

                  case "updateRules":
                  case "UPDATE_RULES":
                    await updateRulesHandler(message.rules, browserInstance);
                    port.postMessage({ success: true });
                    break;

                  case "deleteSession":
                    await deleteSessionHandler(message.sessionName, browserInstance);
                    port.postMessage({ success: true });
                    break;

                  case "getState":
                    port.postMessage({ state: store.getState() });
                    break;

                  case "DISPATCH_ACTION":
                    store.dispatch(message.payload);
                    port.postMessage({ success: true });
                    break;

                  case "createTab":
                    const newTab = await createTab(message.properties);
                    port.postMessage({ success: true, tab: newTab });
                    break;

                  case "updateTab":
                    const updatedTab = await updateTab(message.tabId, message.properties);
                    port.postMessage({ success: true, tab: updatedTab });
                    break;

                  case "removeTab":
                    await removeTab(message.tabId);
                    port.postMessage({ success: true });
                    break;

                  default:
                    console.warn("Unknown action:", message.action);
                    port.postMessage({ error: "Unknown action" });
                }
              } catch (error) {
                console.error('Error handling port message:', error);
                port.postMessage({ type: 'ERROR', error: error.message });
              }
            });

            port.onDisconnect.addListener(() => {
              console.log('Port disconnected:', port.name);
              connectedPorts.delete(port);
            });
          }
        });
      } else {
        console.warn("runtime.onConnect.addListener is not available.");
      }

      // Ensure background script doesn't terminate unexpectedly
      if (
        browserInstance.runtime.onSuspend &&
        browserInstance.runtime.onSuspend.addListener
      ) {
        browserInstance.runtime.onSuspend.addListener(() => {
          console.log('Background service worker is suspending.');
          // Perform any necessary cleanup here
        });
      } else {
        console.warn("runtime.onSuspend.addListener is not available.");
      }

      if (browserInstance.runtime.onStartup && browserInstance.runtime.onStartup.addListener) {
        browserInstance.runtime.onStartup.addListener(() => {
          console.log('Background service worker started on browser startup.');
        });
      } else {
        console.warn("runtime.onStartup.addListener is not available.");
      }

      // Add null checks for runtime.onError
      if (browserInstance.runtime.onError && browserInstance.runtime.onError.addListener) {
        browserInstance.runtime.onError.addListener((error) => {
          console.error('Runtime error:', error);
        });
      } else {
        console.warn("runtime.onError.addListener is not available.");
      }
    } catch (error) {
      console.error("Error during background initialization:", error);
    }
  },
};

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