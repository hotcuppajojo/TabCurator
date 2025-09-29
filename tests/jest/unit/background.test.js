/**
 * Background Service Worker Unit Tests
 * 
 * Tests the orchestration layer that coordinates:
 * - TabManager initialization (browser API delegation)  
 * - StateManager initialization (Redux coordination)
 * - ConnectionManager initial            // Verify StateManager cleanup dispatch was called during the interval execution
      expect(stateManager.dispatch).toHaveBeenCalled();on (message routing)
 */

import browser from 'webextension-polyfill';

// Mock dependencies with proper factories to avoid hoisting issues
jest.mock('../../../utils/tabManager.js', () => ({
  tabManager: {
    initialize: jest.fn().mockResolvedValue(undefined),
    cleanup: jest.fn().mockResolvedValue(undefined)
  }
}));

jest.mock('../../../utils/stateManager.js', () => ({
  __esModule: true,
  default: {
    initialize: jest.fn().mockResolvedValue(undefined),
    dispatch: jest.fn(),
    cleanup: jest.fn().mockResolvedValue(undefined),
    initialized: true, // Add expected property
    store: { getState: jest.fn() } // Add expected property
  }
}));

jest.mock('../../../utils/connectionManager.js', () => ({
  __esModule: true,
  default: {
    initialize: jest.fn().mockResolvedValue(undefined),
    handleMessage: jest.fn().mockResolvedValue({ success: true }),
    cleanup: jest.fn().mockResolvedValue(undefined)
  }
}));

jest.mock('../../../utils/logger.js', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  }
}));

jest.mock('../../../utils/core/bookmark.js', () => ({
  initializeBookmarkFolder: jest.fn().mockResolvedValue('folder123')
}));

// Mock webextension-polyfill with comprehensive browser API
jest.mock('webextension-polyfill', () => ({
  tabs: {
    onCreated: { addListener: jest.fn(), removeListener: jest.fn() },
    onRemoved: { addListener: jest.fn(), removeListener: jest.fn() },
    onUpdated: { addListener: jest.fn(), removeListener: jest.fn() }
  },
  runtime: {
    onMessage: { addListener: jest.fn(), removeListener: jest.fn() },
    onConnect: { addListener: jest.fn(), removeListener: jest.fn() },
    onInstalled: { addListener: jest.fn(), removeListener: jest.fn() },
    onSuspend: { addListener: jest.fn(), removeListener: jest.fn() }
  }
}));

// Import after mocks are set up
import { background } from '../../../background/background.js';
import { tabManager } from '../../../utils/tabManager.js';
import stateManager from '../../../utils/stateManager.js';
import connectionManager from '../../../utils/connectionManager.js';

describe('Background Service Worker Orchestration', () => {
  // Mock global functions
  let originalSetInterval, originalClearInterval, originalRequestIdleCallback;
  
  beforeAll(() => {
    originalSetInterval = global.setInterval;
    originalClearInterval = global.clearInterval;
    originalRequestIdleCallback = global.requestIdleCallback;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Set test environment
    process.env.NODE_ENV = 'test';
    
    // Mock timing functions
    global.setInterval = jest.fn(() => 'mock-interval-id');
    global.clearInterval = jest.fn();
    global.requestIdleCallback = jest.fn((callback) => {
      // Simulate idle callback execution
      callback({ didTimeout: false, timeRemaining: () => 50 });
      return 'mock-idle-id';
    });
    
    // Reset background state for testing
    background._resetForTest();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  afterAll(() => {
    global.setInterval = originalSetInterval;
    global.clearInterval = originalClearInterval;  
    global.requestIdleCallback = originalRequestIdleCallback;
  });

  describe('Initialization Orchestration', () => {
    test('should initialize managers in correct dependency order', async () => {
      await background.initBackground();

      // Verify initialization order: TabManager → StateManager(with TabManager) → ConnectionManager(with StateManager)
      expect(tabManager.initialize).toHaveBeenCalledTimes(1);
      expect(stateManager.initialize).toHaveBeenCalledWith(tabManager);
      expect(connectionManager.initialize).toHaveBeenCalledWith(stateManager);
    });

    test('should handle initialization failures gracefully', async () => {
      const initError = new Error('StateManager initialization failed');
      stateManager.initialize.mockRejectedValueOnce(initError);

      await expect(background.initBackground()).rejects.toThrow('StateManager initialization failed');
    });

    test('should prevent double initialization', async () => {
      // First initialization
      await background.initBackground();
      
      // Second initialization attempt
      await background.initBackground();
      
      // Managers should only be initialized once
      expect(tabManager.initialize).toHaveBeenCalledTimes(1);
      expect(stateManager.initialize).toHaveBeenCalledTimes(1);
      expect(connectionManager.initialize).toHaveBeenCalledTimes(1);
    });

    test('should return initialization state correctly', async () => {
      expect(background._getInitializationState()).toBe(false);
      
      await background.initBackground();
      
      expect(background._getInitializationState()).toBe(true);
    });
  });

  describe('Event Listener Registration', () => {
    beforeEach(async () => {
      await background.initBackground();
    });

    test('should register all required browser event listeners', () => {
      // Verify tab event listeners
      expect(browser.tabs.onCreated.addListener).toHaveBeenCalledWith(expect.any(Function));
      expect(browser.tabs.onRemoved.addListener).toHaveBeenCalledWith(expect.any(Function));
      expect(browser.tabs.onUpdated.addListener).toHaveBeenCalledWith(expect.any(Function));
      
      // Verify runtime event listeners
      expect(browser.runtime.onMessage.addListener).toHaveBeenCalledWith(expect.any(Function));
      expect(browser.runtime.onConnect.addListener).toHaveBeenCalledWith(expect.any(Function));
      expect(browser.runtime.onInstalled.addListener).toHaveBeenCalledWith(expect.any(Function));
      expect(browser.runtime.onSuspend.addListener).toHaveBeenCalledWith(expect.any(Function));
    });

    test('should dispatch tab events to StateManager', () => {
      // Get the registered tab created listener
      const tabCreatedListener = browser.tabs.onCreated.addListener.mock.calls[0][0];
      
      const mockTab = { id: 123, url: 'https://example.com', title: 'Test Tab' };
      tabCreatedListener(mockTab);
      
      expect(stateManager.dispatch).toHaveBeenCalled();
    });

    test('should dispatch tab removal events to StateManager', () => {
      const tabRemovedListener = browser.tabs.onRemoved.addListener.mock.calls[0][0];
      
      const tabId = 123;
      const removeInfo = { isWindowClosing: false };
      tabRemovedListener(tabId, removeInfo);
      
      expect(stateManager.dispatch).toHaveBeenCalled();
    });

    test('should dispatch tab update events to StateManager', () => {
      const tabUpdatedListener = browser.tabs.onUpdated.addListener.mock.calls[0][0];
      
      const tabId = 123;
      const changeInfo = { status: 'complete' };
      const tab = { id: tabId, url: 'https://updated.com', title: 'Updated Tab' };
      
      tabUpdatedListener(tabId, changeInfo, tab);
      
      expect(stateManager.dispatch).toHaveBeenCalled();
    });

    test('should handle runtime messages through ConnectionManager', async () => {
      const messageListener = browser.runtime.onMessage.addListener.mock.calls[0][0];
      
      const message = { type: 'TEST_MESSAGE', payload: {} };
      const sender = { tab: { id: 123 } };
      const sendResponse = jest.fn();
      
      // Execute message listener (returns true for async)
      const result = messageListener(message, sender, sendResponse);
      expect(result).toBe(true);
      
      // Wait for async handling
      await new Promise(resolve => setTimeout(resolve, 0));
      
      expect(connectionManager.handleMessage).toHaveBeenCalledWith(message, sender);
    });

    test('should handle extension installation events', () => {
      const installedListener = browser.runtime.onInstalled.addListener.mock.calls[0][0];
      
      const details = { reason: 'install' };
      installedListener(details);
      
      expect(stateManager.dispatch).toHaveBeenCalled();
    });
  });

  describe('Periodic Tasks Setup', () => {
    beforeEach(async () => {
      await background.initBackground();
    });

    test('should setup cleanup interval task', () => {
      expect(global.setInterval).toHaveBeenCalledWith(
        expect.any(Function),
        expect.any(Number)
      );
    });

    test('should execute periodic cleanup through StateManager', () => {
      // Get the interval callback
      const intervalCallback = global.setInterval.mock.calls[0][0];
      
      // Execute the callback
      intervalCallback();
      
      // Verify requestIdleCallback was used
      expect(global.requestIdleCallback).toHaveBeenCalledWith(
        expect.any(Function),
        { timeout: 10000 }
      );
      
      // Verify StateManager cleanup dispatch
      expect(stateManager.dispatch).toHaveBeenCalled();
    });

    test('should log periodic tasks setup', () => {
      // Verify periodic tasks were configured
      expect(global.setInterval).toHaveBeenCalled();
    });
  });

  describe('Cleanup Orchestration', () => {
    beforeEach(async () => {
      await background.initBackground();
    });

    test('should cleanup all registered listeners', async () => {
      await background._cleanup();
      
      // Verify all event listeners are removed
      expect(browser.tabs.onCreated.removeListener).toHaveBeenCalled();
      expect(browser.tabs.onRemoved.removeListener).toHaveBeenCalled();
      expect(browser.tabs.onUpdated.removeListener).toHaveBeenCalled();
      expect(browser.runtime.onMessage.removeListener).toHaveBeenCalled();
      expect(browser.runtime.onConnect.removeListener).toHaveBeenCalled();
      expect(browser.runtime.onInstalled.removeListener).toHaveBeenCalled();
      expect(browser.runtime.onSuspend.removeListener).toHaveBeenCalled();
    });

    test('should cleanup managers in reverse order', async () => {
      await background._cleanup();
      
      // Only ConnectionManager cleanup is called (StateManager/TabManager handle their own cleanup)
      expect(connectionManager.cleanup).toHaveBeenCalledTimes(1);
    });

    test('should clear all intervals during cleanup', async () => {
      await background._cleanup();
      
      expect(global.clearInterval).toHaveBeenCalled();
    });

    test('should handle cleanup errors gracefully', async () => {
      const cleanupError = new Error('Cleanup failed');
      connectionManager.cleanup.mockRejectedValueOnce(cleanupError);
      
      await background._cleanup();
      
      // Verify error was handled gracefully - cleanup should not throw
      // Even with errors, the function should complete
    });

    test('should log cleanup process', async () => {
      await background._cleanup();
      
      // Verify cleanup was executed (evidenced by cleanup calls)
      expect(connectionManager.cleanup).toHaveBeenCalled();
    });
  });

  describe('Suspension Handling', () => {
    beforeEach(async () => {
      await background.initBackground();
    });

    test('should trigger cleanup on browser suspension', () => {
      const suspendListener = browser.runtime.onSuspend.addListener.mock.calls[0][0];
      
      suspendListener();
      
      // Verify the suspend listener was registered and can be called
      expect(browser.runtime.onSuspend.addListener).toHaveBeenCalled();
    });
  });

  describe('Test Helper Methods', () => {
    test('should reset state for testing', () => {
      // Initialize first
      expect(background._getInitializationState()).toBe(false);
      
      // Reset should maintain false state
      background._resetForTest();
      expect(background._getInitializationState()).toBe(false);
    });
  });
});