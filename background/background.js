// background/background.js
import browser from 'webextension-polyfill';
import stateManager from '../utils/stateManager.js';
import connectionManager from '../utils/connectionManager.js';
import { tabManager } from '../utils/tabManager.js';
import { MESSAGE_TYPES, ACTION, STATE } from '../utils/core/index.js';
import { logger } from '../utils/logger.js';
import * as bookmarkUtils from '../utils/core/bookmark.js';

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

// Expose debug objects to Chrome's console
globalThis.tabCuratorLogger = logger;
globalThis.tabManager = tabManager;
globalThis.store = stateManager.store;
globalThis.connectionManager = connectionManager;

console.info('TabCurator debug objects available:');
console.info('- tabCuratorLogger: Logger interface');
console.info('- tabManager: Tab management interface');
console.info('- store: Redux store');
console.info('- connectionManager: Connection management interface');

let initialized = false;

const background = {
  async initBackground() {
    if (initialized) return true;
    
    try {
      logger.info('Initializing background script...');
      
      // Sequential initialization following dependency order:
      // 1. Initialize store within the stateManager first
      await stateManager.initializeStore();
      logger.info('Store initialized');
      
      // 2. TabManager initialize with minimal dependencies
      await tabManager.initialize(stateManager);
      logger.info('TabManager initialized');
      
      // 3. Complete StateManager initialization with TabManager
      await stateManager.initialize(tabManager);
      logger.info('StateManager initialized');
      
      // Verify stateManager is fully initialized before proceeding
      if (!stateManager.initialized || !stateManager.store) {
        throw new Error('StateManager initialization did not complete properly');
      }
      
      // 4. ConnectionManager initialize last, depends on stateManager
      await connectionManager.initialize();
      logger.info('ConnectionManager initialized');
      
      // 5. Initialize bookmarks folder
      await bookmarkUtils.initializeBookmarkFolder();
      logger.info('Bookmark folder initialized');
      
      // Setup browser-level event listeners
      this._setupEventListeners();
      
      // Mark background as fully initialized
      initialized = true;
      stateManager.dispatch({
        type: ACTION.STATE.INITIALIZE,
        payload: {
          timestamp: Date.now(),
          state: STATE.APP.INITIALIZED
        }
      });
      
      // Notify any waiting components
      await this._broadcastInitialized();
      logger.info('Background script fully initialized');
      
      return true;
    } catch (error) {
      logger.error('Background initialization failed:', error);
      throw error;
    }
  },

  _setupEventListeners() {
    // Let the connectionManager handle all messaging
    // It will route to stateManager and tabManager as needed
    
    // Tab event listeners for state tracking
    browser.tabs.onCreated.addListener(tab => {
      // Send tab created event to stateManager
      stateManager.dispatch({
        type: ACTION.TAB.CREATE,
        payload: tab
      });
    });
    
    browser.tabs.onRemoved.addListener((tabId, removeInfo) => {
      stateManager.dispatch({
        type: ACTION.TAB.REMOVE,
        payload: { tabId, removeInfo }
      });
    });
    
    browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
      stateManager.dispatch({
        type: ACTION.TAB.UPDATE,
        payload: { tabId, changeInfo, tab }
      });
    });
    
    // Listen for browser extension lifecycle events
    browser.runtime.onInstalled.addListener(details => {
      logger.info('Extension installed or updated', details);
      // Handle first install, update, etc.
    });
    
    browser.runtime.onSuspend.addListener(() => {
      logger.info('Extension suspending, cleaning up...');
      this._cleanup();
    });
  },

  async _broadcastInitialized() {
    try {
      await connectionManager.broadcastMessage({
        type: MESSAGE_TYPES.INIT_CHECK,
        payload: { initialized: true }
      });
    } catch (error) {
      // Ignore errors from no listeners
      logger.debug('No listeners for broadcast initialization message');
    }
  },
  
  async _cleanup() {
    try {
      // Proper cleanup in reverse initialization order
      await connectionManager.cleanup();
      // stateManager and tabManager cleanup if needed
      logger.info('Background script cleanup complete');
    } catch (error) {
      logger.error('Error during cleanup:', error);
    }
  }
};

// Initialize the background script
background.initBackground().catch(error => {
  logger.error('Failed to initialize background:', error);
});

export { background };