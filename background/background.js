// background/background.js
import browser from 'webextension-polyfill';
import { connection } from '../utils/connectionManager.js';
import { initializeServiceWorkerState } from '../utils/stateManager.js';
import { createTabManager } from '../utils/tabManager.js';
import { logger } from '../utils/logger.js';
import { CONFIG } from '../utils/constants.js';

// Add requestIdleCallback polyfill for tests
if (typeof requestIdleCallback === 'undefined') {
  globalThis.requestIdleCallback = (callback) => {
    const start = Date.now();
    return setTimeout(() => {
      callback({
        didTimeout: false,
        timeRemaining: () => Math.max(0, 50 - (Date.now() - start))
      });
    }, 1);
  };
}

let isInitialized = false;
const tabManager = createTabManager();

async function initialize() {
  if (isInitialized) return;
  
  try {
    await initializeServiceWorkerState();
    await connection.initialize();
    await tabManager.initialize();

    setupEventListeners();
    setupPeriodicTasks();

    isInitialized = true;
    logger.info('Background service worker initialized');
  } catch (error) {
    logger.critical('Background initialization failed', { error: error.message });
    throw error;
  }
}

function initializeState() {
  // Implement if needed: return an object with syncState() and persistState() methods.
  return {
    syncState: jest.fn(),
    persistState: jest.fn()
  };
}

function setupEventListeners() {
  if (process.env.NODE_ENV === 'test') {
    if (!browser.runtime) browser.runtime = {};
    if (!browser.runtime.onStartup) browser.runtime.onStartup = { addListener: jest.fn() };
    if (!browser.runtime.onSuspend) browser.runtime.onSuspend = { addListener: jest.fn() };
  }

  browser.runtime.onStartup.addListener(() => initializeState().syncState());
  browser.runtime.onSuspend.addListener(() => initializeState().persistState());
  
  browser.runtime.onMessage.addListener(connection.handleMessage);
  browser.runtime.onConnect.addListener(connection.handlePort);

  browser.tabs.onUpdated.addListener(tabManager.handleTabUpdate);
  browser.tabs.onRemoved.addListener(tabManager.handleTabRemove);
}

function setupPeriodicTasks() {
  const scheduleSync = () => {
    requestIdleCallback(async () => {
      try {
        await initializeState().syncState();
      } finally {
        scheduleSync();
      }
    }, { timeout: 10000 });
  };
  scheduleSync();

  setInterval(async () => {
    await tabManager.cleanupInactiveTabs();
    await tabManager.enforceTabLimits();
    await connection.cleanupConnections();
  }, CONFIG.TIMEOUTS.CLEANUP);
}

// Initialize the background script
initialize().catch(console.error);

// Export for testing
export const __testing__ = {
  initialize,
  setupEventListeners,
  setupPeriodicTasks,
  reset: () => {
    isInitialized = false;
  }
};
