// background/background.js

/**
 * @fileoverview Background service worker module for TabCurator extension.
 * Manages tab lifecycle, rule processing, session handling, and automated maintenance tasks.
 * Ensures compatibility with both Chrome and Firefox using the WebExtension API.
 */
import { CONNECTION_NAME } from './constants.js';
import { 
  getTab, 
  createTab, 
  updateTab, 
  removeTab, 
  discardTab,
  suspendTab,
  suspendInactiveTabs,
  queryTabs,
  archiveTab
} from '../utils/tabManager.js';

import { store } from '../utils/stateManager.js';
import { 
  actions,
  initializeStateFromStorage 
} from '../utils/stateManager.js';

import { 
  handleMessage, 
  initializeConnection, 
  sendMessage,
  createAlarm,
  onAlarm,
  connectToBackground,
  ServiceWorker
} from '../utils/messagingUtils.js';

// Import the browser API correctly for the service worker context
import browser from 'webextension-polyfill';
import { ServiceWorkerManager } from '../utils/messagingUtils.js';
import { validatePermissions } from '../utils/permissionUtils.js';
import { initializeServiceWorkerState } from '../utils/stateManager.js';

// Add lifecycle events
export const LIFECYCLE_EVENTS = Object.freeze({
  INSTALL: 'install',
  ACTIVATE: 'activate',
  UPDATE: 'update'
});

// Add lifecycle management
export const ServiceWorkerLifecycle = Object.freeze({
  async onInstall() {
    await initializeStateFromStorage();
    await setupRules();
  },
  async onActivate() {
    await browser.clients.claim();
    await recoverState();
  },
  async onUpdate() {
    await persistState();
    await updateRules();
  }
});

// Add declarative rules management
export const DeclarativeRules = Object.freeze({
  async setup() {
    if (await validatePermissions('OPTIONAL')) {
      const rules = await loadRules();
      await browser.declarativeNetRequest.updateDynamicRules({
        removeRuleIds: rules.map(r => r.id),
        addRules: rules
      });
    }
  }
});

const sw = await ServiceWorkerManager.initialize();

console.log('Background service worker initialized.');

// Declare a set to keep track of all connected ports
const connectedPorts = new Set();

// Add response queue for managing multiple requests
const responseQueue = new Map();

async function handleBackgroundMessage(message, sender) {
  const { type, payload, requestId } = message;
  
  try {
    let response;
    
    switch (type) {
      case 'STATE_REQUEST':
        response = await store.getState();
        break;
        
      case 'TAB_ACTION':
        response = await handleTabAction(payload);
        break;
        
      // ...handle other message types
    }
    
    return {
      type: `${type}_RESPONSE`,
      requestId,
      payload: response
    };
    
  } catch (error) {
    return {
      type: 'ERROR',
      requestId,
      error: error.message
    };
  }
}

// Define the background object in the global scope
const background = {
  /**


  /**
   * Sets up alarms based on stored settings.
   */
  async setupAlarms(browserInstance) {
    try {
      if (!browserInstance || !browserInstance.storage) {
        console.error('Storage API not available');
        return;
      }
      const settings = await browser.storage.sync.get({ inactiveCheckPeriod: 5 }); // Pass an object with default values
      const period = settings.inactiveCheckPeriod || 5; // Ensure a default value
      
      createAlarm('checkForInactiveTabs', { periodInMinutes: period }, browserInstance);
      console.log("Alarm 'checkForInactiveTabs' created successfully.");
      
      onAlarm(async (alarm) => {
        if (alarm.name === 'checkForInactiveTabs') {
          console.log("Alarm 'checkForInactiveTabs' triggered.");
          await this.checkForInactiveTabs(browserInstance);
        }
      }, browserInstance);
      
      // Listen for settings changes to update alarms
      browserInstance.storage.onChanged.addListener((changes) => {
        if (changes.inactiveCheckPeriod) {
          createAlarm('checkForInactiveTabs', { 
            periodInMinutes: changes.inactiveCheckPeriod.newValue 
          }, browserInstance);
          console.log("Alarm 'checkForInactiveTabs' updated based on settings change.");
        }
      });
      
      // Initial check
      await this.checkForInactiveTabs(browserInstance);
      console.log("Initial inactive tabs check completed.");
    } catch (error) {
      console.error("Error setting up alarms:", error);
    }
  },

  /**
   * Initializes the background service worker.
   * Sets up event handlers, message listeners, and persistent storage defaults.
   *
   * Enhanced to ensure stability and handle unexpected disconnections gracefully.
   */
  async initBackground(browserInstance = browser) { // Updated default parameter
    try {
      // Verify required APIs first
      if (!browserInstance?.tabs || !browserInstance?.alarms || !browserInstance?.runtime) {
        throw new Error("Required browser APIs are unavailable.");
      }

      // Initialize state first
      await initializeStateFromStorage();

      // Add diagnostic logging for service worker activation
      console.log('Initializing background service worker...');

      // Set up state sync message handler
      self.addEventListener('message', async (event) => {
        if (event.data?.type === MESSAGE_TYPES.STATE_SYNC) {
          store.dispatch({
            type: ACTION_TYPES.STATE.SYNC,
            payload: event.data.payload
          });
          
          // Notify all clients of state update
          const clients = await self.clients.matchAll();
          clients.forEach(client => {
            client.postMessage({
              type: MESSAGE_TYPES.STATE_UPDATE,
              payload: store.getState()
            });
          });
        }
      });

      // Set up runtime.onMessage listener
      if (browserInstance.runtime.onMessage && browserInstance.runtime.onMessage.addListener) {
        browserInstance.runtime.onMessage.addListener((message, sender, sendResponse) => {
          handleBackgroundMessage(message, sender, sendResponse, browserInstance, store)
            .catch(error => {
              console.error('Error handling message:', error);
              sendResponse({ error: error.message });
            });
          return true; // Keeps the message channel open for async response
        });
        console.log("runtime.onMessage listener set up successfully.");
      } else {
        console.warn("runtime.onMessage.addListener is not available.");
      }

      // Set up runtime.onConnect listener for general connections
      if (browserInstance.runtime.onConnect && browserInstance.runtime.onConnect.addListener) {
        browserInstance.runtime.onConnect.addListener((connectedPort) => {
          console.log('New connection attempt from:', connectedPort.name);

          if (connectedPort.name === CONNECTION_NAME || connectedPort.name === 'tabActivity') {
            // Add the connected port to the set
            connectedPorts.add(connectedPort);

            console.log('Port connected:', connectedPort.name);

            // Define message listener
            const messageListener = async (message) => {
              // Ensure the port is still connected
              if (!connectedPorts.has(connectedPort)) return;

              try {
                if (message.type === 'CONNECT_REQUEST') {
                  connectedPort.postMessage({ 
                    type: 'CONNECTION_ACK',
                    timestamp: Date.now()
                  });
                  return;
                }

                switch (message.action) {
                  case "saveSession":
                  case "SAVE_SESSION":
                    await saveSessionHandler(message.sessionName, browserInstance);
                    connectedPort.postMessage({ success: true });
                    break;

                  case "archiveTab":
                  case "ARCHIVE_TAB":
                    await archiveTab(message.tabId, message.tags, browserInstance);
                    connectedPort.postMessage({ success: true });
                    break;

                  case "restoreSession":
                  case "RESTORE_SESSION":
                    await restoreSessionHandler(message.sessionName, browserInstance);
                    connectedPort.postMessage({ success: true });
                    break;

                  case "suspendInactiveTabs":
                    await suspendInactiveTabs(browserInstance);
                    connectedPort.postMessage({ success: true });
                    break;

                  case "getSessions":
                    const sessions = await getSavedSessions(browserInstance);
                    connectedPort.postMessage({ sessions });
                    break;

                  case "updateRules":
                  case "UPDATE_RULES":
                    await updateRulesHandler(message.rules, browserInstance);
                    connectedPort.postMessage({ success: true });
                    break;

                  case "deleteSession":
                    await deleteSessionHandler(message.sessionName, browserInstance);
                    connectedPort.postMessage({ success: true });
                    break;

                  case "getState":
                    connectedPort.postMessage({ state: store.getState() });
                    break;

                  case "DISPATCH_ACTION":
                    store.dispatch(message.payload);
                    connectedPort.postMessage({ success: true });
                    break;

                  case "getTab":
                    const tab = await getTab(message.tabId);
                    connectedPort.postMessage({ success: true, tab });
                    break;

                  case "suspendTab":
                    const suspendedTab = await suspendTab(message.tabId);
                    connectedPort.postMessage({ success: true, tab: suspendedTab });
                    break;

                  case "createTab":
                    const newTab = await createTab(message.properties);
                    connectedPort.postMessage({ success: true, tab: newTab });
                    break;

                  case "updateTab":
                    const updatedTab = await updateTab(message.tabId, message.properties);
                    connectedPort.postMessage({ success: true, tab: updatedTab });
                    break;

                  case "removeTab":
                    await removeTab(message.tabId);
                    connectedPort.postMessage({ success: true });
                    break;

                  default:
                    console.warn("Unknown action:", message.action);
                    connectedPort.postMessage({ error: "Unknown action" });
                }
              } catch (error) {
                console.error('Error handling port message:', error);
                connectedPort.postMessage({ type: 'ERROR', error: error.message });
              }
            };

            // Define disconnect listener
            const disconnectListener = () => {
              console.log('Port disconnected:', connectedPort.name);
              connectedPorts.delete(connectedPort);
              connectedPort.onMessage.removeListener(messageListener);
              connectedPort.onDisconnect.removeListener(disconnectListener);
            };

            // Attach listeners
            connectedPort.onMessage.addListener(messageListener);
            connectedPort.onDisconnect.addListener(disconnectListener);

            // Store listener references on the connectedPort
            connectedPort._messageListener = messageListener;
            connectedPort._disconnectListener = disconnectListener;

            // Send immediate acknowledgment
            connectedPort.postMessage({ type: 'CONNECTION_ACK', timestamp: Date.now() });

            console.log('Connection listeners set up successfully.');
          }
        });
        console.log("runtime.onConnect listener set up successfully.");
      } else {
        console.warn("runtime.onConnect.addListener is not available.");
      }

      // Initialize connection utilities
      initializeConnection(sendMessage);

      // Ensure Redux store is initialized with default state
      store.dispatch({ type: 'RESET_STATE' });

      console.log("Background service worker started.");

      // Setup tabs.onUpdated listener
      if (browserInstance.tabs.onUpdated && browserInstance.tabs.onUpdated.addListener) {
        browserInstance.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
          if (changeInfo.status === 'complete') {
            applyRulesToTab(tab, browserInstance, store);
          }
        });
        console.log("tabs.onUpdated listener set up successfully.");
      } else {
        console.warn("tabs.onUpdated.addListener is not available.");
      }

      // Setup tabs.onCreated listener
      if (browserInstance.tabs.onCreated && browserInstance.tabs.onCreated.addListener) {
        browserInstance.tabs.onCreated.addListener((tab) => {
          store.dispatch({ type: "UPDATE_TAB_ACTIVITY", tabId: tab.id, timestamp: Date.now() });
        });
        console.log("tabs.onCreated listener set up successfully.");
      } else {
        console.warn("tabs.onCreated.addListener is not available.");
      }

      // Prevent overwriting storage during tests
      if (process.env.NODE_ENV !== 'test') {
        // Set default storage values on extension installation
        if (browserInstance.runtime.onInstalled && browserInstance.runtime.onInstalled.addListener) {
          browserInstance.runtime.onInstalled.addListener(async () => {
            try {
              await new Promise((resolve, reject) => {
                browser.storage.sync.set({
                  inactiveThreshold: 60,
                  tabLimit: 100,
                  rules: [],
                }, () => {
                  if (browser.runtime.lastError) {
                    reject(browser.runtime.lastError);
                  } else {
                    resolve();
                  }
                });
              });
              console.log("Default settings initialized.");
            } catch (error) {
              console.error("Error initializing default settings:", error);
            }

            // Register declarativeNetRequest rules with unique IDs
            try {
              await addBlockRule('https://example.com/*');
              console.log("Declarative Net Request rules registered.");
            } catch (error) {
              console.error("Error registering declarativeNetRequest rules:", error);
            }
          });
          console.log("runtime.onInstalled listener set up successfully.");
        } else {
          console.warn("runtime.onInstalled.addListener is not available.");
        }
      }

      // Setup tabs.onActivated listener
      if (browserInstance.tabs.onActivated && browserInstance.tabs.onActivated.addListener) {
        browserInstance.tabs.onActivated.addListener(({ tabId }) => {
          store.dispatch({ type: "UPDATE_TAB_ACTIVITY", tabId, timestamp: Date.now() });
          console.log(`Tab activated: ${tabId}`);
        });
        console.log("tabs.onActivated listener set up successfully.");
      } else {
        console.warn("tabs.onActivated.addListener is not available.");
      }

      // Setup alarm handling
      await this.setupAlarms(browserInstance);

      // Setup additional runtime.onConnect listener for 'tabActivity'
      if (browserInstance.runtime.onConnect && browserInstance.runtime.onConnect.addListener) {
        browserInstance.runtime.onConnect.addListener((connectedPort) => {
          if (connectedPort.name === 'tabActivity') {
            console.log('Port connected:', connectedPort.name);
            
            // Track connected ports
            connectedPorts.add(connectedPort);
            
            // Define message listener for this port
            const messageListener = async (message) => {
              if (!connectedPorts.has(connectedPort)) return;
              
              try {
                if (message.type === 'CONNECT_REQUEST') {
                  connectedPort.postMessage({ 
                    type: 'CONNECTION_ACK',
                    timestamp: Date.now()
                  });
                  return;
                }

                switch (message.action) {
                  case "saveSession":
                  case "SAVE_SESSION":
                    await saveSessionHandler(message.sessionName, browserInstance);
                    connectedPort.postMessage({ success: true });
                    break;

                  case "archiveTab":
                  case "ARCHIVE_TAB":
                    await archiveTab(message.tabId, message.tags, browserInstance);
                    connectedPort.postMessage({ success: true });
                    break;

                  case "restoreSession":
                  case "RESTORE_SESSION":
                    await restoreSessionHandler(message.sessionName, browserInstance);
                    connectedPort.postMessage({ success: true });
                    break;

                  case "suspendInactiveTabs":
                    await suspendInactiveTabs(browserInstance);
                    connectedPort.postMessage({ success: true });
                    break;

                  case "getSessions":
                    const sessions = await getSavedSessions(browserInstance);
                    connectedPort.postMessage({ sessions });
                    break;

                  case "updateRules":
                  case "UPDATE_RULES":
                    await updateRulesHandler(message.rules, browserInstance);
                    connectedPort.postMessage({ success: true });
                    break;

                  case "deleteSession":
                    await deleteSessionHandler(message.sessionName, browserInstance);
                    connectedPort.postMessage({ success: true });
                    break;

                  case "getState":
                    connectedPort.postMessage({ state: store.getState() });
                    break;

                  case "DISPATCH_ACTION":
                    store.dispatch(message.payload);
                    connectedPort.postMessage({ success: true });
                    break;

                  case "getTab":
                    const tab = await getTab(message.tabId);
                    connectedPort.postMessage({ success: true, tab });
                    break;

                  case "suspendTab":
                    const suspendedTab = await suspendTab(message.tabId);
                    connectedPort.postMessage({ success: true, tab: suspendedTab });
                    break;

                  case "createTab":
                    const newTab = await createTab(message.properties);
                    connectedPort.postMessage({ success: true, tab: newTab });
                    break;

                  case "updateTab":
                    const updatedTab = await updateTab(message.tabId, message.properties);
                    connectedPort.postMessage({ success: true, tab: updatedTab });
                    break;

                  case "removeTab":
                    await removeTab(message.tabId);
                    connectedPort.postMessage({ success: true });
                    break;

                  default:
                    console.warn("Unknown action:", message.action);
                    connectedPort.postMessage({ error: "Unknown action" });
                }
              } catch (error) {
                console.error('Error handling port message:', error);
                connectedPort.postMessage({ type: 'ERROR', error: error.message });
              }
            };

            // Define disconnect listener for this port
            const disconnectListener = () => {
              console.log('Port disconnected:', connectedPort.name);
              connectedPorts.delete(connectedPort);
              connectedPort.onMessage.removeListener(messageListener);
              connectedPort.onDisconnect.removeListener(disconnectListener);
            };

            // Attach listeners
            connectedPort.onMessage.addListener(messageListener);
            connectedPort.onDisconnect.addListener(disconnectListener);

            // Store listener references on the connectedPort
            connectedPort._messageListener = messageListener;
            connectedPort._disconnectListener = disconnectListener;

            console.log('Connection listeners for "tabActivity" set up successfully.');
          }
        });
        console.log("Additional runtime.onConnect listener for 'tabActivity' set up successfully.");
      } else {
        console.warn("runtime.onConnect.addListener is not available.");
      }

      // Setup runtime.onSuspend listener
      if (
        browserInstance.runtime.onSuspend &&
        browserInstance.runtime.onSuspend.addListener
      ) {
        browserInstance.runtime.onSuspend.addListener(async () => {
          console.log('Background service worker is suspending.');
          await background._cleanup();
        });
        console.log("runtime.onSuspend listener set up successfully.");
      } else {
        console.warn("runtime.onSuspend.addListener is not available.");
      }

      // Setup runtime.onStartup listener
      if (browserInstance.runtime.onStartup && browserInstance.runtime.onStartup.addListener) {
        browserInstance.runtime.onStartup.addListener(() => {
          console.log('Background service worker started on browser startup.');
        });
        console.log("runtime.onStartup listener set up successfully.");
      } else {
        console.warn("runtime.onStartup.addListener is not available.");
      }

      // Setup runtime.onError listener
      if (browserInstance.runtime.onError && browserInstance.runtime.onError.addListener) {
        browserInstance.runtime.onError.addListener((error) => {
          console.error('Runtime error:', error);
        });
        console.log("runtime.onError listener set up successfully.");
      } else {
        console.warn("runtime.onError.addListener is not available.");
      }

      // Setup fetch event listener
      self.addEventListener('fetch', (event) => {
        background.handleFetch(event.request)
          .then(response => {
            if (response) {
              event.respondWith(response);
            }
          })
          .catch(error => {
            console.error('Fetch handling error:', error);
          });
      });
      console.log("Fetch event listener set up successfully.");

      return; // Initialization successful
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

      // Remove port listeners for all connected ports
      for (const connectedPort of connectedPorts) {
        if (connectedPort._messageListener) {
          connectedPort.onMessage.removeListener(connectedPort._messageListener);
        }
        if (connectedPort._disconnectListener) {
          connectedPort.onDisconnect.removeListener(connectedPort._disconnectListener);
        }
      }
      connectedPorts.clear();

      // Remove any alarms
      if (browser.alarms) {
        await browser.alarms.clearAll();
        console.log("All alarms cleared successfully.");
      }

      console.log("Background service worker cleanup completed successfully.");
    } catch (err) {
      console.error('Error during cleanup:', err);
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
      if (url.protocol === 'chrome-extension:' || url.protocol === 'moz-extension:') {
        // Handle extension resource requests if needed
        return new Response('Extension resource handled');
      }
      return undefined; // Let the request proceed as normal
    } catch (error) {
      console.error('Error handling fetch:', error);
      return undefined;
    }
  }
};

// Verify that the browser APIs are available
if (!browser || !browser.tabs) {
  console.error('Tabs API not available');
} else {
  // Assign browser to the global scope if necessary
  self.browser = browser;

  let nextRuleId = 1000; // Starting ID (ensure it doesn't clash with existing rules)

  /**
   * Adds a declarativeNetRequest rule with a unique ID.
   * @param {string} urlFilter - The URL pattern to block.
   * @returns {Promise<void>}
   */
  async function addBlockRule(urlFilter) {
    try {
      const ruleId = nextRuleId++;
      await new Promise((resolve, reject) => {
        browser.declarativeNetRequest.updateDynamicRules({
          addRules: [
            {
              id: ruleId,
              priority: 1,
              action: { type: 'block' },
              condition: { urlFilter: urlFilter }
            }
          ],
          removeRuleIds: [] // Add any rule IDs you want to remove here
        }, () => {
          if (browser.runtime.lastError) {
            reject(browser.runtime.lastError);
          } else {
            resolve();
          }
        });
      });
      console.log(`DeclarativeNetRequest rule added with ID: ${ruleId} for URL Filter: ${urlFilter}`);
    } catch (error) {
      console.error("Error registering declarativeNetRequest rules:", error);
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
    background.initBackground(browser); // Pass the browser object
  }
}

// Service Worker event listeners
self.addEventListener('install', event => {
  event.waitUntil(sw.install());
});

self.addEventListener('activate', event => {
  event.waitUntil(sw.activate());
});

self.addEventListener('fetch', event => {
  event.respondWith(sw.fetch(event));
});

// Update port connection handling
const connections = new Map();

browser.runtime.onConnect.addListener((port) => {
  if (port.name === 'tabActivity') {
    const connectionId = crypto.randomUUID();
    
    // Store connection
    connections.set(connectionId, {
      port,
      timestamp: Date.now()
    });
    
    // Send immediate acknowledgment
    port.postMessage({
      type: MESSAGE_TYPES.CONNECTION_ACK,
      connectionId,
      timestamp: Date.now()
    });

    // Setup message handler
    port.onMessage.addListener(async (message) => {
      try {
        const response = await handleMessage(message, { connectionId });
        port.postMessage({
          ...response,
          requestId: message.requestId // Echo back requestId for message matching
        });
      } catch (error) {
        port.postMessage({
          type: MESSAGE_TYPES.ERROR,
          error: error.message,
          requestId: message.requestId
        });
      }
    });

    // Cleanup on disconnect
    port.onDisconnect.addListener(() => {
      connections.delete(connectionId);
      console.log(`Connection ${connectionId} closed`);
    });
  }
});

// Handle state sync in service worker context
async function handleStateSync(client) {
  try {
    const state = store.getState();
    await client.postMessage({
      type: MESSAGE_TYPES.STATE_UPDATE,
      payload: state
    });
  } catch (error) {
    console.error('Failed to sync state:', error);
  }
}

// Update service worker lifecycle events
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    await initializeStateFromStorage();
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    await self.clients.claim();
    const clients = await self.clients.matchAll();
    await Promise.all(clients.map(handleStateSync));
  })());
});

export default background;

// Utilize async/await for better asynchronous handling
async function initializeBackground() {
  try {
    await initializeStateFromStorage();
    await setupAlarms(browser);
    console.log('Background initialized successfully.');
    
    // Set up listeners using modern API practices
    browser.runtime.onMessage.addListener(handleBackgroundMessage);
    browser.runtime.onConnect.addListener(handlePortConnection);
    
    // ...additional initialization...
  } catch (error) {
    console.error('Error initializing background:', error);
  }
}

initializeBackground();