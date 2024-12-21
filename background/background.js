// background/background.js
import browser from 'webextension-polyfill';
import stateManager from '../utils/stateManager.js'; // Ensure default import
import { connection } from '../utils/connectionManager.js';
import { tabManager } from '../utils/tabManager.js';
import { MESSAGE_TYPES } from '../utils/constants.js';
import { logger } from '../utils/logger.js'; // Add logger import

// Polyfill requestIdleCallback if it doesn't exist
if (typeof requestIdleCallback === 'undefined') {
  globalThis.requestIdleCallback = (callback, options) => {
    const start = Date.now();
    return setTimeout(() => {
      callback({
        didTimeout: false,
        timeRemaining: () => Math.max(0, 50 - (Date.now() - start))
      });
    }, (options && options.timeout) || 1);
  };
}

// Expose logger to Chrome's console
globalThis.tabCuratorLogger = logger;
globalThis.tabManager = tabManager;
globalThis.store = stateManager.store;

console.info('TabCurator debug objects available:');
console.info('- tabCuratorLogger: Logger interface');
console.info('- tabManager: Tab management interface');
console.info('- store: Redux store');

let initialized = false;

const background = {
  async initBackground() {
    if (initialized) return true;
    
    try {
      // Sequential initialization
      await stateManager.initialize(tabManager);
      await tabManager.initialize(stateManager);
      await connection.initialize(stateManager);
      
      this.setupMessageHandling();
      initialized = true;
      
      await this.broadcastInitialized();
      return true;
    } catch (error) {
      logger.error('Background initialization failed:', error);
      throw error;
    }
  },

  setupMessageHandling() {
    browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
      // 1. Init check handling
      if (message.type === MESSAGE_TYPES.INIT_CHECK) {
        sendResponse({ initialized });
        return true;
      }

      if (!initialized) {
        sendResponse({ error: 'Service not initialized' });
        return true;
      }

      // 2. Enhanced tab action handling with proper response flow
      if (message.type === MESSAGE_TYPES.TAB_ACTION) {
        const handleTabAction = async () => {
          try {
            logger.debug(`Processing tab action: ${message.action}`);
            const response = await connection.handleMessage(message, sender);

            if (!response) {
              throw new Error(`No response from tab action: ${message.action}`);
            }

            logger.debug('Tab action response:', response);
            sendResponse(response);
          } catch (error) {
            logger.error('Tab action failed:', error);
            sendResponse({
              error: error.message || 'Tab action failed',
              success: false
            });
          }
        };

        handleTabAction().catch(error => {
          logger.error('Unhandled tab action error:', error);
          sendResponse({
            error: 'Internal error processing tab action',
            success: false
          });
        });

        return true; // Keep message channel open
      }

      // 3. General message handling
      const handleMessage = async () => {
        try {
          const response = await connection.handleMessage(message, sender);
          sendResponse(response || { success: true });
        } catch (error) {
          logger.error('Message handling failed:', error);
          sendResponse({
            error: error.message || 'Message handling failed',
            success: false
          });
        }
      };

      handleMessage().catch(error => {
        logger.error('Unhandled message error:', error);
        sendResponse({
          error: 'Internal error processing message',
          success: false
        });
      });

      return true; // Keep message channel open
    });

    browser.runtime.onConnect.addListener((port) => {
      if (!initialized) {
        port.postMessage({ error: 'Service not initialized' });
        return;
      }
      connection.handlePort(port);
    });
  },

  async broadcastInitialized() {
    try {
      await browser.runtime.sendMessage({
        type: MESSAGE_TYPES.INIT_CHECK,
        payload: { initialized: true }
      });
    } catch (error) {
      // Ignore errors from no listeners
    }
  }
};

// Initialize and export for testing
background.initBackground().catch(error => {
  logger.error('Failed to initialize background:', error);
});

export { background };