// background/background.js
import browser from 'webextension-polyfill';
import stateManager from '../utils/stateManager.js'; // Ensure default import
import { connection } from '../utils/connectionManager.js';
import { tabManager } from '../utils/tabManager.js';
import { CONFIG, MESSAGE_TYPES, SERVICE_TYPES } from '../utils/constants.js';
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
      // 1. Initialize state manager first
      await stateManager.initialize();
      logger.info('StateManager initialized', stateManager);

      // 2. Initialize tab manager with stateManager reference  
      await tabManager.initialize(stateManager);
      logger.info('TabManager initialized', tabManager);

      // 3. Initialize connection manager last
      await connection.initialize(stateManager);
      logger.info('Connection manager initialized', connection);

      // 4. Mark initialization complete
      initialized = true;

      return true;
    } catch (error) {
      logger.error('Background initialization failed:', error);
      throw error;
    }
  },

  isInitialized() {
    return initialized;
  },

  setupMessageHandling() {
    browser.runtime.onConnect.addListener((port) => {
      if (!initialized) {
        port.postMessage({ error: 'Service not initialized' });
        return;
      }
      connection.handlePort(port);
    });

    browser.runtime.onMessage.addListener(async (message, sender) => {
      try {
        // Always allow init check
        if (message.type === MESSAGE_TYPES.INIT_CHECK) {
          return { initialized };
        }

        if (!initialized) {
          return { error: 'Service not initialized' };
        }

        const response = await connection.handleMessage(message, sender);
        return response; // Ensure the response is returned
      } catch (error) {
        logger.error('Handle Message Error:', { error: error.message });
        return { error: error.message };
      }
    });
  }
};

// Initialize background and setup message handling
background.initBackground().then(() => {
  background.setupMessageHandling();
}).catch(error => {
  logger.error('Failed to initialize background:', error);
});

export { background };