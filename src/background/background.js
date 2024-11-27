// src/background/background.js

const background = {
  actionHistory: [],
  archivedTabs: {},
  tabActivity: {},
  savedSessions: {},
  isTaggingPromptActive: false,

  getIsTaggingPromptActive() {
    return this.isTaggingPromptActive;
  },

  setIsTaggingPromptActive(value) {
    this.isTaggingPromptActive = value;
  },

  async applyRulesToTab(tab, browserInstance) {
    if (!browserInstance?.storage) {
      console.error("Invalid browser instance provided to applyRulesToTab");
      return;
    }

    try {
      const data = await browserInstance.storage.sync.get("rules");
      const rules = data.rules || [];
      
      for (const rule of rules) {
        if (tab.url.includes(rule.condition) || tab.title.includes(rule.condition)) {
          const [actionType, tag] = rule.action.split(": ");
          if (actionType === 'Tag') {
            await this.archiveTab(tab.id, tag, browserInstance);
            break; // Stop after first match
          }
        }
      }
    } catch (error) {
      console.error("Error applying rules to tab:", error);
    }
  },

  async saveSession(sessionName, browserInstance) {
    try {
      const tabs = await browserInstance.tabs.query({ currentWindow: true });
      const sessionTabs = tabs.map(({ title, url }) => ({ title, url }));
      this.savedSessions[sessionName] = sessionTabs;
      await browserInstance.storage.sync.set({ savedSessions: this.savedSessions });
      return sessionTabs;
    } catch (error) {
      console.error("Error saving session:", error);
      throw error;
    }
  },

  async restoreSession(sessionName, browserInstance) {
    const sessionTabs = this.savedSessions[sessionName];
    if (sessionTabs) {
      for (const tab of sessionTabs) {
        await browserInstance.tabs.create({ url: tab.url });
      }
      alert(`Session "${sessionName}" restored successfully!`);
    } else {
      alert(`Session "${sessionName}" not found.`);
    }
  },

  async archiveTab(tabId, tag, browserInstance) {
    try {
      const tab = await browserInstance.tabs.get(tabId);
      this.archivedTabs[tag] = this.archivedTabs[tag] || [];
      this.archivedTabs[tag].push({
        title: tab.title,
        url: tab.url
      });
      this.actionHistory.push({ type: 'archive', tab, tag });
      await browserInstance.tabs.remove(tabId);
    } catch (error) {
      console.error(`Failed to archive tab ${tabId}:`, error);
    }
  },

  async suspendTab(tabId, browserInstance) {
    if (browserInstance.tabs.discard) {
      await browserInstance.tabs.discard(tabId);
      console.log(`Tab suspended: ${tabId}`);
    } else {
      console.warn("Tab discard API not supported.");
    }
  },

  async undoLastAction(browserInstance) {
    const lastAction = this.actionHistory.pop();
    if (lastAction && lastAction.type === 'archive') {
      const newTab = await browserInstance.tabs.create({ 
        url: lastAction.tab.url,
        active: true
      });
      
      if (this.archivedTabs[lastAction.tag]) {
        this.archivedTabs[lastAction.tag] = this.archivedTabs[lastAction.tag]
          .filter(t => t.url !== lastAction.tab.url);
      }
      
      return newTab;
    }
    return null;
  },

  async checkForInactiveTabs(browserInstance, tabLimit = 100) {
    if (!browserInstance?.tabs) {
      console.error("Invalid browser instance provided to checkForInactiveTabs");
      return;
    }
  
    try {
      const now = Date.now();
      
      const tabs = await browserInstance.tabs.query({});
      if (tabs.length > tabLimit && !this.isTaggingPromptActive) {
        const inactiveTabs = tabs.filter(tab => !tab.active);
        if (inactiveTabs.length > 0) {
          const oldestTab = inactiveTabs.reduce((oldest, current) => {
            const oldestTime = this.tabActivity[oldest.id] || now;
            const currentTime = this.tabActivity[current.id] || now;
            return currentTime < oldestTime ? current : oldest;
          });
  
          browserInstance.runtime.sendMessage(
            { action: 'promptTagging', tabId: oldestTab.id },
            () => {
              this.isTaggingPromptActive = true;
              console.log(`Prompting user to tag tab: ${oldestTab.id}`);
            }
          );
        }
      }
  
      for (const tab of tabs) {
        const lastActive = this.tabActivity[tab.id] || now;
        if (!tab.active && now - lastActive > 60 * 60 * 1000) {
          await this.suspendTab(tab.id, browserInstance);
        }
      }
    } catch (error) {
      console.error("Error during tab management:", error);
    }
  },

  initBackground(browserInstance = (typeof browser !== 'undefined' ? browser : chrome)) {
    if (!browserInstance?.tabs) {
      console.error("Invalid browser instance provided to initBackground");
      return;
    }

    console.log("Background service worker started.");

    browserInstance.runtime.onInstalled.addListener(() => {
      browserInstance.storage.sync.set({
        inactiveThreshold: 60,
        tabLimit: 100,
        rules: []
      });
    });

    if (typeof self !== 'undefined') {
      self.addEventListener('error', (event) => {
        console.error("Service Worker Error:", event.message);
      });
      self.addEventListener('unhandledrejection', (event) => {
        console.error("Unhandled Rejection:", event.reason);
      });
    }

    this.actionHistory.length = 0;
    Object.keys(this.archivedTabs).forEach(key => delete this.archivedTabs[key]);

    browserInstance.runtime.onMessage.addListener((message, sender, sendResponse) => {
      try {
        switch (message.action) {
          case 'tagAdded':
            this.isTaggingPromptActive = false;
            browserInstance.storage.local.remove('oldestTabId');
            sendResponse({ message: 'Tag processed successfully.' });
            break;
          case 'saveSession':
            this.saveSession(message.sessionName, browserInstance);
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
            sendResponse({ error: 'Unknown action' });
        }
      } catch (error) {
        console.error('Error handling message:', error);
        sendResponse({ error: error.message });
      }
    });

    browserInstance.tabs.onActivated.addListener((activeInfo) => {
      this.tabActivity[activeInfo.tabId] = Date.now();
      console.log(`Tab activated: ${activeInfo.tabId}`);
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

    browserInstance.alarms.create("checkForInactiveTabs", { periodInMinutes: 5 });
    browserInstance.alarms.onAlarm.addListener((alarm) => {
      if (alarm.name === "checkForInactiveTabs") {
        const instance = browserInstance;
        this.checkForInactiveTabs(instance);
      }
    });

    this.initSessions(browserInstance);

    this.checkForInactiveTabs(browserInstance);
  },

  async initSessions(browserInstance) {
    if (!browserInstance) return;
    
    try {
      const data = await browserInstance.storage.sync.get("savedSessions");
      this.savedSessions = data.savedSessions || {};
      
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