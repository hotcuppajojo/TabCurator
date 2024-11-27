// src/background/background.js

/**
 * @fileoverview Background service worker module for TabCurator extension
 * Implements tab management, rule processing, and session handling functionality
 * Provides browser-agnostic implementation for Chrome/Firefox compatibility
 * Manages tab lifecycle, archival, and automated maintenance tasks
 */

const background = {
  // Maintains reversible action stack for undo operations
  actionHistory: [],
  // Groups tabs by user-defined tags for organized storage
  archivedTabs: {},
  // Tracks tab interaction timestamps for inactivity detection
  tabActivity: {},
  // Preserves window states for later restoration
  savedSessions: {},
  isTaggingPromptActive: false,

  /**
   * Checks if tagging prompt is currently active to prevent overlapping requests
   * @returns {boolean} Current state of tagging prompt
   */
  getIsTaggingPromptActive() {
    return this.isTaggingPromptActive; // check if tagging prompt is active
  },

  /**
   * Updates tagging prompt state for coordination between UI and background tasks
   * @param {boolean} value - New state for tagging prompt
   */
  setIsTaggingPromptActive(value) {
    this.isTaggingPromptActive = value; // update tagging prompt state
  },

  /**
   * Processes tab against defined ruleset for automated organization
   * Implements single-pass rule matching for performance
   * @param {browser.tabs.Tab} tab - Tab object to evaluate
   * @param {object} browserInstance - Browser API instance
   */
  async applyRulesToTab(tab, browserInstance) {
    // Validate API access before proceeding
    if (!browserInstance?.storage) {
      console.error("Invalid browser instance provided to applyRulesToTab");
      return;
    }

    try {
      // Batch fetch rules for efficient processing
      const data = await browserInstance.storage.sync.get("rules"); // retrieve stored rules
      const rules = data.rules || [];
      
      // Single-pass rule evaluation for performance
      for (const rule of rules) {
        // Flexible matching against both URL and title patterns
        if (tab.url.includes(rule.condition) || tab.title.includes(rule.condition)) {
          const [actionType, tag] = rule.action.split(": ");
          // Support for future action type expansion
          if (actionType === 'Tag') {
            await this.archiveTab(tab.id, tag, browserInstance); // archive tab based on rule
            break; // Exit after first match for predictable behavior
          }
        }
      }
    } catch (error) {
      console.error("Error applying rules to tab:", error); // handle retrieval errors
    }
  },

  /**
   * Persists current window tabs as named session
   * Implements storage sync for cross-device availability
   * @param {string} sessionName - Unique identifier for the session
   * @param {object} browserInstance - Browser API instance
   * @returns {Array} Saved tab metadata
   */
  async saveSession(sessionName, browserInstance) {
    try {
      const tabs = await browserInstance.tabs.query({ currentWindow: true }); // get current window tabs
      const sessionTabs = tabs.map(({ title, url }) => ({ title, url }));
      this.savedSessions[sessionName] = sessionTabs; // store session data
      await browserInstance.storage.sync.set({ savedSessions: this.savedSessions }); // save to storage
      return sessionTabs;
    } catch (error) {
      console.error("Error saving session:", error);
      throw error;
    }
  },

  /**
   * Recreates saved window state from session data
   * Implements user feedback for success/failure
   * @param {string} sessionName - Session identifier to restore
   * @param {object} browserInstance - Browser API instance
   */
  async restoreSession(sessionName, browserInstance) {
    const sessionTabs = this.savedSessions[sessionName];
    if (sessionTabs) {
      // Recreate each tab from session data
      for (const tab of sessionTabs) {
        await browserInstance.tabs.create({ url: tab.url });
      }
      alert(`Session "${sessionName}" restored successfully!`);
    } else {
      alert(`Session "${sessionName}" not found.`); // handle missing session
    }
  },

  /**
   * Archives specified tab with associated metadata
   * Implements undo support via action history
   * @param {number} tabId - ID of tab to archive
   * @param {string} tag - Organizational tag for grouping
   * @param {object} browserInstance - Browser API instance
   */
  async archiveTab(tabId, tag, browserInstance) {
    try {
      const tab = await browserInstance.tabs.get(tabId); // fetch tab details
      // Initialize tag group if needed
      this.archivedTabs[tag] = this.archivedTabs[tag] || [];
      // Store tab metadata for potential restoration
      this.archivedTabs[tag].push({
        title: tab.title,
        url: tab.url
      }); // add tab to archive under specified tag
      // Track action for undo support
      this.actionHistory.push({ type: 'archive', tab, tag }); // log archival action
      await browserInstance.tabs.remove(tabId); // close the archived tab
    } catch (error) {
      console.error(`Failed to archive tab ${tabId}:`, error); // handle archival errors
    }
  },

  /**
   * Suspends tab to reduce memory usage
   * Implements fallback for unsupported browsers
   * @param {number} tabId - ID of tab to suspend
   * @param {object} browserInstance - Browser API instance
   */
  async suspendTab(tabId, browserInstance) {
    if (browserInstance.tabs.discard) {
      await browserInstance.tabs.discard(tabId);
      console.log(`Tab suspended: ${tabId}`);
    } else {
      console.warn("Tab discard API not supported.");
    }
  },

  /**
   * Reverts most recent tab archival action
   * Implements cleanup of archived tabs storage
   * @param {object} browserInstance - Browser API instance
   * @returns {object|null} Newly created tab or null if no action to undo
   */
  async undoLastAction(browserInstance) {
    const lastAction = this.actionHistory.pop();
    if (lastAction && lastAction.type === 'archive') {
      // Restore tab to previous state
      const newTab = await browserInstance.tabs.create({ 
        url: lastAction.tab.url,
        active: true
      });
      
      // Remove from archived storage
      if (this.archivedTabs[lastAction.tag]) {
        this.archivedTabs[lastAction.tag] = this.archivedTabs[lastAction.tag]
          .filter(t => t.url !== lastAction.tab.url);
      }
      
      return newTab;
    }
    return null;
  },

  /**
   * Monitors tab count and activity for automated management
   * Implements adaptive threshold-based suspension
   * @param {object} browserInstance - Browser API instance
   * @param {number} tabLimit - Maximum allowed tabs before intervention
   */
  async checkForInactiveTabs(browserInstance, tabLimit = 100) {
    // Validate API access before proceeding
    if (!browserInstance?.tabs) {
      console.error("Invalid browser instance provided to checkForInactiveTabs");
      return;
    }
  
    try {
      const now = Date.now();
      
      const tabs = await browserInstance.tabs.query({});
      // Implement tab limit enforcement
      if (tabs.length > tabLimit && !this.isTaggingPromptActive) {
        const inactiveTabs = tabs.filter(tab => !tab.active);
        if (inactiveTabs.length > 0) {
          // Select oldest inactive tab using timestamp comparison
          const oldestTab = inactiveTabs.reduce((oldest, current) => {
            const oldestTime = this.tabActivity[oldest.id] || now;
            const currentTime = this.tabActivity[current.id] || now;
            return currentTime < oldestTime ? current : oldest;
          });
  
          // Delegate to UI for user intervention
          browserInstance.runtime.sendMessage(
            { action: 'promptTagging', tabId: oldestTab.id },
            () => {
              this.isTaggingPromptActive = true;
              console.log(`Prompting user to tag tab: ${oldestTab.id}`);
            }
          );
        }
      }
  
      // Implement automatic tab suspension for memory management
      for (const tab of tabs) {
        const lastActive = this.tabActivity[tab.id] || now;
        // Use 1-hour threshold for inactivity determination
        if (!tab.active && now - lastActive > 60 * 60 * 1000) {
          await this.suspendTab(tab.id, browserInstance);
        }
      }
    } catch (error) {
      console.error("Error during tab management:", error);
    }
  },

  /**
   * Initializes background service worker and sets up event handlers
   * Implements cross-browser compatibility layer
   * @param {object} browserInstance - Browser API instance
   */
  initBackground(browserInstance = (typeof browser !== 'undefined' ? browser : chrome)) {
    // Validate browser API availability
    if (!browserInstance?.tabs) {
      console.error("Invalid browser instance provided to initBackground");
      return;
    }

    console.log("Background service worker started."); // indicate service worker initiation

    // Configure persistent storage defaults
    browserInstance.runtime.onInstalled.addListener(() => {
      browserInstance.storage.sync.set({
        inactiveThreshold: 60,
        tabLimit: 100,
        rules: []
      }); // set default storage values on installation
    });

    // Implement error boundary for service worker context
    if (typeof self !== 'undefined') {
      self.addEventListener('error', (event) => {
        console.error("Service Worker Error:", event.message); // capture service worker errors
      });
      self.addEventListener('unhandledrejection', (event) => {
        console.error("Unhandled Rejection:", event.reason); // capture promise rejections
      });
    }

    // Initialize clean state for new session
    this.actionHistory.length = 0; // reset action history
    Object.keys(this.archivedTabs).forEach(key => delete this.archivedTabs[key]); // clear archived tabs

    // Configure message handling for extension components
    browserInstance.runtime.onMessage.addListener((message, sender, sendResponse) => {
      try {
        switch (message.action) {
          case 'tagAdded':
            this.isTaggingPromptActive = false; // reset tagging prompt state
            browserInstance.storage.local.remove('oldestTabId'); // clean up storage
            sendResponse({ message: 'Tag processed successfully.' }); // acknowledge
            break;
          case 'saveSession':
            this.saveSession(message.sessionName, browserInstance); // handle session saving
            sendResponse({ success: true });
            break;
          case 'getSessions':
            sendResponse({ sessions: this.savedSessions });
            break;
          case 'restoreSession':
            (async () => {
              await this.restoreSession(message.sessionName, browserInstance);
              sendResponse({ success: true });
            })();
            return true;
          case 'undoLastAction':
            (async () => {
              const result = await this.undoLastAction(browserInstance);
              sendResponse({ success: true, result });
            })();
            return true;
          default:
            sendResponse({ error: 'Unknown action' }); // handle unknown actions
        }
      } catch (error) {
        console.error('Error handling message:', error);
        sendResponse({ error: error.message }); // respond with error details
      }
    });

    // Configure tab lifecycle hooks
    browserInstance.tabs.onActivated.addListener((activeInfo) => {
      this.tabActivity[activeInfo.tabId] = Date.now(); // update activity timestamp
      console.log(`Tab activated: ${activeInfo.tabId}`); // log activation
    });

    browserInstance.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
      if (changeInfo.status === 'complete') {
        await this.applyRulesToTab(tab, browserInstance);
      }
    });

    browserInstance.tabs.onRemoved.addListener((tabId) => {
      delete this.tabActivity[tabId];
      console.log(`Tab removed: ${tabId}`);
    });

    browserInstance.tabs.onCreated.addListener(async (tab) => {
      this.tabActivity[tab.id] = Date.now();
      console.log(`Tab created: ${tab.id}`);
      await this.applyRulesToTab(tab, browserInstance);
    });

    // Schedule periodic maintenance tasks
    browserInstance.alarms.create("checkForInactiveTabs", { periodInMinutes: 5 }); // schedule inactivity checks
    browserInstance.alarms.onAlarm.addListener((alarm) => {
      if (alarm.name === "checkForInactiveTabs") {
        const instance = browserInstance;
        this.checkForInactiveTabs(instance); // execute inactivity check
      }
    });

    // Initialize persistent state and perform initial checks
    this.initSessions(browserInstance); // initialize session data
    this.checkForInactiveTabs(browserInstance); // perform initial inactivity check
  },

  /**
   * Initializes session management and storage sync
   * Implements change listener for cross-window updates
   * @param {object} browserInstance - Browser API instance
   */
  async initSessions(browserInstance) {
    if (!browserInstance) return;
    
    try {
      // Load existing sessions from storage
      const data = await browserInstance.storage.sync.get("savedSessions");
      this.savedSessions = data.savedSessions || {};
      
      // Monitor for session changes from other windows
      browserInstance.storage.onChanged.addListener((changes, area) => {
        if (area === "sync" && changes.savedSessions) {
          this.savedSessions = changes.savedSessions.newValue;
        }
      });
    } catch (error) {
      console.error("Error initializing sessions:", error);
    }
  }
};

module.exports = background;