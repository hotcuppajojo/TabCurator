// background/background.js
import browser from 'webextension-polyfill';
import { connection } from '../utils/connectionManager.js';
import { initializeServiceWorkerState } from '../utils/stateManager.js';
import { TabManager } from '../utils/tabManager.js'; 
import { logger } from '../utils/logger.js';
import { CONFIG, MESSAGE_TYPES } from '../utils/constants.js';

const tabManager = new TabManager();

async function setupCoordination() {
  try {
    if (!browser?.runtime) {
      throw new Error('Browser APIs not available');
    }

    // Initialize core services
    await Promise.all([
      connection.initialize(),
      initializeServiceWorkerState(),
      tabManager.initialize()
    ]);

    // Set up message handling
    browser.runtime.onMessage.addListener((message, sender) => {
      return connection.handleMessage(message, sender);
    });

    // Handle port connections
    browser.runtime.onConnect.addListener(port => {
      if (!port) return;
      
      const connId = connection.handlePort(port);
      
      port.onMessage.addListener(async (message) => {
        try {
          if (message.type === MESSAGE_TYPES.TAB_ACTION) {
            const response = await tabManager[message.action]?.(message.payload);
            if (response) port.postMessage(response);
          } else {
            const response = await connection.handleMessage(message, port);
            if (response) port.postMessage(response);
          }
        } catch (error) {
          logger.error('Message handling error:', error);
          port.postMessage({ 
            type: MESSAGE_TYPES.ERROR,
            error: error.message 
          });
        }
      });

      port.onDisconnect.addListener(() => {
        connection.handleDisconnect(connId);
      });
    });

    // Tab events
    browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
      tabManager.handleTabUpdate(tabId, changeInfo, tab);
    });
    
    browser.tabs.onRemoved.addListener((tabId) => {
      tabManager.handleTabRemove(tabId);
    });

    // Periodic tasks
    setInterval(() => {
      requestIdleCallback(async () => {
        try {
          await Promise.all([
            tabManager.cleanupInactiveTabs(),
            tabManager.enforceTabLimits(),
            connection.cleanupConnections()
          ]);
        } catch (error) {
          logger.error('Periodic task failed', { error: error.message });
        }
      }, { timeout: 10000 });
    }, CONFIG.TIMEOUTS.CLEANUP);

    logger.info('Background coordination initialized');
  } catch (error) {
    logger.critical('Background coordination setup failed', { error: error.message });
    throw error;
  }
}

// Just call setupCoordination immediately; MV3 background is a service worker by default.
setupCoordination().catch(error => {
  logger.critical('Fatal background error', { error: error.message });
});

export const __testing__ = {
  setupCoordination,
  tabManager
};