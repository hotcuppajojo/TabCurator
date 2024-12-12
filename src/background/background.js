// src/background/background.js
/**
 * @fileoverview Background service worker module for TabCurator extension.
 * Manages tab lifecycle, rule processing, session handling, and automated maintenance tasks.
 * Ensures compatibility with both Chrome and Firefox using the WebExtension API.
 */
import browser from 'webextension-polyfill'; // Import the browser API polyfill
import { CONNECTION_NAME } from './constants.js';
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
  sendMessage,
  createAlarm,
  onAlarm
} from '../utils/messagingUtils.js';

import { archiveTab, applyRulesToTab } from '../utils/tagUtils.js';

/**
 * Background service worker module for TabCurator extension.
 * @module background
 * @exports background
 * @description Manages tab lifecycle, rule processing, session handling, and automated maintenance tasks.
 */
let port;
let messageListener;
let disconnectListener;

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
      // Use the imported queryTabs function
      const tabs = await queryTabs({});
      
      // Ensure we have tabs before processing
      if (tabs && Array.isArray(tabs) && tabs.length > 0) {
        // Process each tab sequentially
        for (const tab of tabs) {
          try {
            await discardTab(tab.id);
          } catch (error) {
            console.error(`Error discarding tab ${tab.id}:`, error);
          }
        }
      }
    } catch (error) {
      console.error("Error during tab management:", error);
      throw error; // Re-throw to ensure error is propagated
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
      // Verify required APIs first
      if (!browserInstance?.tabs || !browserInstance?.alarms || !browserInstance?.runtime) {
        throw new Error("Required browser APIs are unavailable.");
      }

      // Test connection immediately to fail fast
      try {
        browserInstance.runtime.connect();
      } catch (error) {
        throw new Error('Extension context invalidated');
      }

      // Initialize state first
      await initializeStateFromStorage();

      // Add diagnostic logging for service worker activation
      console.log('Initializing background service worker...');

      // Set up connection handling first
      browserInstance.runtime.onConnect.addListener((connectedPort) => {
        console.log('New connection attempt from:', connectedPort.name);
        
        if (connectedPort.name === CONNECTION_NAME) {
          port = connectedPort;
          // Track connected ports
          const connectedPorts = new Set();
          connectedPorts.add(port);

          // Send immediate acknowledgment
          port.postMessage({ type: 'CONNECTION_ACK', timestamp: Date.now() });
          
          messageListener = async (message) => {
            if (!connectedPorts.has(port)) return;
            try {
              await handleMessage(message, port.sender, 
                (response) => port.postMessage(response), 
                browserInstance, store);
            } catch (error) {
              console.error('Error handling message:', error);
              if (port) {
                port.postMessage({ type: 'ERROR', error: error.message });
              }
            }
          };

          disconnectListener = () => {
            console.log('Port disconnected:', port?.name);
            connectedPorts.delete(port);
            if (port?.onMessage?.removeListener) {
              port.onMessage.removeListener(messageListener);
            }
            if (port?.onDisconnect?.removeListener) {
              port.onDisconnect.removeListener(disconnectListener); 
            }
            port = null;
            if (browserInstance.runtime.lastError) {
              console.warn('Disconnect reason:', browserInstance.runtime.lastError.message);
            }
          };

          port.onMessage.addListener(messageListener);
          port.onDisconnect.addListener(disconnectListener);
        }
      });

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

      // Prevent overwriting storage during tests
      if (process.env.NODE_ENV !== 'test') {
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
      }

      // Add null checks for runtime.onMessage
      if (browserInstance.runtime.onMessage && browserInstance.runtime.onMessage.addListener) {
        browserInstance.runtime.onMessage.addListener((message, sender, sendResponse) => {
          handleMessage(message, sender, sendResponse, browserInstance, store).catch(error => {
            console.error('Error handling message:', error);
            sendResponse({ error: error.message });
          });
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

      // Set up alarm handling with configurable period
      try {
        const settings = await browserInstance.storage.sync.get(['inactiveCheckPeriod']);
        const period = settings.inactiveCheckPeriod || 5; // Default to 5 minutes if not set
        
        createAlarm('checkForInactiveTabs', { periodInMinutes: period }, browserInstance);
        
        onAlarm(async (alarm) => {
          if (alarm.name === 'checkForInactiveTabs') {
            await this.checkForInactiveTabs(browserInstance);
          }
        }, browserInstance);

        // Listen for settings changes
        browserInstance.storage.onChanged.addListener((changes) => {
          if (changes.inactiveCheckPeriod) {
            createAlarm('checkForInactiveTabs', { 
              periodInMinutes: changes.inactiveCheckPeriod.newValue 
            }, browserInstance);
          }
        });

        await this.checkForInactiveTabs(browserInstance);
      } catch (error) {
        console.error("Error setting up alarms:", error);
      }

      // Add null checks for runtime.onConnect
      if (browserInstance.runtime.onConnect && browserInstance.runtime.onConnect.addListener) {
        browserInstance.runtime.onConnect.addListener((connectedPort) => {
          if (connectedPort.name === 'tabActivity') {
            console.log('Port connected:', connectedPort.name);
            
            // Track connected ports
            const connectedPorts = new Set();
            connectedPorts.add(connectedPort);
            
            port = connectedPort;
            port.onMessage.addListener(messageListener = async (message) => {
              if (!connectedPorts.has(port)) return;
              
              try {
                if (message.type === 'CONNECT_REQUEST') {
                  port.postMessage({ 
                    type: 'CONNECTION_ACK',
                    timestamp: Date.now()
                  });
                  return;
                }

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

                  case "getTab":
                    const tab = await getTab(message.tabId);
                    port.postMessage({ success: true, tab });
                    break;

                  case "suspendTab":
                    const suspendedTab = await suspendTab(message.tabId);
                    port.postMessage({ success: true, tab: suspendedTab });
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

            port.onDisconnect.addListener(disconnectListener = () => {
              console.log('Port disconnected:', port.name);
              connectedPorts.delete(port);
              port = null;
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

      return; // Remove the return statement with serviceWorker
    } catch (error) {
      console.error("Error during background initialization:", error);
      throw error; // Re-throw to signal initialization failure
    }
  },

  /**
   * Cleans up event listeners and ongoing processes.
   * @returns {Promise<void>}
   */
  async _cleanup() {
    try {
      // Clear any pending timers
      if (this._timeouts) {
        this._timeouts.forEach(clearTimeout);
        this._timeouts = [];
      }
      
      // Remove port listeners
      if (port) {
        port.onMessage?.removeListener?.(messageListener);
        port.onDisconnect?.removeListener?.(disconnectListener);
        port = null;
      }

      // Remove any intervals/alarms
      if (browser.alarms) {
        await browser.alarms.clearAll();
      }

      // Force cleanup
      messageListener = null;
      disconnectListener = null;

      return Promise.resolve();
    } catch (err) {
      console.error('Error during cleanup:', err);
      return Promise.resolve();
    }
  },

  /**
   * Handle fetch request for extension resources.
   * @param {Request} request - The fetch request object.
   * @returns {Promise<Response|undefined>}
   */
  handleFetch: async (request) => {
    try {
      const url = new URL(request.url);
      if (url.protocol === 'chrome-extension:') {
        return new Response('Extension resource handled');
      }
      return undefined;
    } catch (error) {
      console.error('Error handling fetch:', error);
      return undefined;
    }
  }
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

export default background;
