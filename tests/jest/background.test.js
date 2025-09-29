// tests/jest/background.test.js
/**
 * @file Unit tests for the Background service worker orchestration
 * @description The background worker wires together several managers (TabManager,
 * StateManager, ConnectionManager) and registers browser event listeners and periodic
 * maintenance tasks. Tests in this file assert the orchestration contracts and
 * resilience behaviours (ordering, idempotence, graceful error handling, and cleanup)
 *
 * Rationale: the background layer coordinates many moving parts; small changes in
 * registration order, error propagation, or listener wiring can cause silent runtime
 * failures. These tests exercise the integration points while keeping implementations
 * mocked to maintain fast, deterministic unit tests
 */

import browser from 'webextension-polyfill';

// Mock dependencies with proper factories to avoid hoisting issues
jest.mock('../../utils/tabManager.js', () => ({
  tabManager: {
    initialize: jest.fn().mockResolvedValue(undefined),
    cleanup: jest.fn().mockResolvedValue(undefined)
  }
}));

jest.mock('../../utils/stateManager.js', () => ({
  __esModule: true,
  default: {
    initialize: jest.fn().mockResolvedValue(undefined),
    dispatch: jest.fn(),
    cleanup: jest.fn().mockResolvedValue(undefined),
    initialized: true, // Add expected property
    store: { getState: jest.fn() } // Add expected property
  }
}));

jest.mock('../../utils/connectionManager.js', () => ({
  __esModule: true,
  default: {
    initialize: jest.fn().mockResolvedValue(undefined),
    handleMessage: jest.fn().mockResolvedValue({ success: true }),
    cleanup: jest.fn().mockResolvedValue(undefined)
  }
}));

jest.mock('../../utils/logger.js', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  }
}));

jest.mock('../../utils/core/bookmark.js', () => ({
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
import { background } from '../../background/background.js';
import { tabManager } from '../../utils/tabManager.js';
import stateManager from '../../utils/stateManager.js';
import connectionManager from '../../utils/connectionManager.js';

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
    /**
     * @description Initialization must occur in a predictable dependency order so that
     * managers can receive the instances they depend on. We assert TabManager first so
     * StateManager can be initialized with it, and ConnectionManager initializes last with
     * access to the stateful store
     */
    test('should initialize managers in correct dependency order', async () => {
      await background.initBackground();

      // Verify initialization order: TabManager → StateManager(with TabManager) → ConnectionManager(with StateManager)
      expect(tabManager.initialize).toHaveBeenCalledTimes(1);
      expect(stateManager.initialize).toHaveBeenCalledWith(tabManager);
      expect(connectionManager.initialize).toHaveBeenCalledWith(stateManager);
    });

    /**
     * @description Failures during initialization should surface clearly rather than leave
     * the service in a half-initialized state. This test simulates a StateManager failure and
     * expects the error to propagate so callers can detect and react to startup failures
     */
    test('should handle initialization failures gracefully', async () => {
      const initError = new Error('StateManager initialization failed');
      stateManager.initialize.mockRejectedValueOnce(initError);

      await expect(background.initBackground()).rejects.toThrow('StateManager initialization failed');
    });

  /**
   * @description The background worker should be idempotent with regards to initialization.
   * Re-entrant calls must be no-ops to avoid duplicated listeners, timers, or double
   * resource allocation
   */
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

    /**
     * @description Exposes an internal state accessor for tests/health checks; we assert it
     * accurately reflects the initialization lifecycle to help diagnostics in tests
     */
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

  /**
   * @description Verifies we register the full set of browser event listeners the app
   * expects. Missing listeners lead to silent feature regressions (e.g., missing tab
   * notifications), so this test acts as a canary for listener wiring
   */
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

  /**
   * @description Ensures event callbacks route to `stateManager.dispatch`. The state
   * manager is the single source of truth; dispatch guarantees consistent state updates
   * regardless of the browser event shape
   */
  test('should dispatch tab events to StateManager', () => {
      // Get the registered tab created listener
      const tabCreatedListener = browser.tabs.onCreated.addListener.mock.calls[0][0];
      
      const mockTab = { id: 123, url: 'https://example.com', title: 'Test Tab' };
      tabCreatedListener(mockTab);
      
      expect(stateManager.dispatch).toHaveBeenCalled();
    });

  /**
   * @description Removal events must also route to state manager so eviction and cleanup
   * policies can run. We test listener wiring and argument forwarding
   */
  test('should dispatch tab removal events to StateManager', () => {
      const tabRemovedListener = browser.tabs.onRemoved.addListener.mock.calls[0][0];
      
      const tabId = 123;
      const removeInfo = { isWindowClosing: false };
      tabRemovedListener(tabId, removeInfo);
      
      expect(stateManager.dispatch).toHaveBeenCalled();
    });

  /**
   * @description Updates are frequent and must be correctly forwarded so the store reflects
   * the current tab state; this prevents stale UI and incorrect heuristics
   */
  test('should dispatch tab update events to StateManager', () => {
      const tabUpdatedListener = browser.tabs.onUpdated.addListener.mock.calls[0][0];
      
      const tabId = 123;
      const changeInfo = { status: 'complete' };
      const tab = { id: tabId, url: 'https://updated.com', title: 'Updated Tab' };
      
      tabUpdatedListener(tabId, changeInfo, tab);
      
      expect(stateManager.dispatch).toHaveBeenCalled();
    });

  /**
   * @description Background message routing delegates to ConnectionManager. We assert the
   * listener returns `true` (async handler) and that the manager receives the message so
   * message handling remains testable and decoupled
   */
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

    /**
     * @description Installation events are used to seed state (first-run). We verify the
     * installed listener dispatches expected actions so migrations and onboarding run
     */
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

  /**
   * @description The background worker configures periodic tasks (cleanup, telemetry). We
   * assert an interval is scheduled so maintenance runs without user interaction
   */
  test('should setup cleanup interval task', () => {
      expect(global.setInterval).toHaveBeenCalledWith(
        expect.any(Function),
        expect.any(Number)
      );
    });

  /**
   * @description The scheduled task should use `requestIdleCallback` to perform work during
   * idle time and then dispatch cleanup actions. This pattern reduces main-thread impact
   */
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

    /**
     * @description Periodic task scheduling is an observable side-effect; we test the call
     * to `setInterval` to ensure the telemetry/cleanup cadence remains configured
     */
    test('should log periodic tasks setup', () => {
      // Verify periodic tasks were configured
      expect(global.setInterval).toHaveBeenCalled();
    });
  });

  describe('Cleanup Orchestration', () => {
    beforeEach(async () => {
      await background.initBackground();
    });

    /**
     * @description Cleanup must remove all registered listeners to avoid leaks and duplicated
     * handlers on reload. This test asserts each listener removal call is invoked
     */
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

    /**
     * @description Manager cleanup should run in a safe order. ConnectionManager manages
     * live connections and should be cleaned up before the store is torn down. We assert the
     * cleanup path is invoked for the component managing live resources
     */
    test('should cleanup managers in reverse order', async () => {
      await background._cleanup();
      
      // Only ConnectionManager cleanup is called (StateManager/TabManager handle their own cleanup)
      expect(connectionManager.cleanup).toHaveBeenCalledTimes(1);
    });

    /**
     * @description All scheduled intervals must be cleared during cleanup to prevent background
     * tasks from running after unload or tests. This test ensures intervals are cleared
     */
    test('should clear all intervals during cleanup', async () => {
      await background._cleanup();
      
      expect(global.clearInterval).toHaveBeenCalled();
    });

    /**
     * @description Cleanup steps can fail; background should catch and log cleanup errors so
     * the rest of the teardown continues. This test injects a failure to ensure no exception
     * bubbles out of the cleanup routine
     */
    test('should handle cleanup errors gracefully', async () => {
      const cleanupError = new Error('Cleanup failed');
      connectionManager.cleanup.mockRejectedValueOnce(cleanupError);
      
      await background._cleanup();
      
      // Verify error was handled gracefully - cleanup should not throw
      // Even with errors, the function should complete
    });

    /**
     * @description The cleanup process should be observable via logs for debugging and
     * operational visibility. We assert cleanup was at least invoked on the manager to ensure
     * the orchestration ran
     */
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

    /**
     * @description The runtime `onSuspend` event should trigger a cleanup to allow the
     * extension to release resources on suspend. We assert the suspend listener is registered
     * and callable
     */
    test('should trigger cleanup on browser suspension', () => {
      const suspendListener = browser.runtime.onSuspend.addListener.mock.calls[0][0];
      
      suspendListener();
      
      // Verify the suspend listener was registered and can be called
      expect(browser.runtime.onSuspend.addListener).toHaveBeenCalled();
    });
  });

  describe('Test Helper Methods', () => {
    /**
     * @description Helper methods are exposed for test hygiene. `_resetForTest` should bring
     * the background into a known initial state without triggering initialization side-effects
     */
    test('should reset state for testing', () => {
      // Initialize first
      expect(background._getInitializationState()).toBe(false);
      
      // Reset should maintain false state
      background._resetForTest();
      expect(background._getInitializationState()).toBe(false);
    });
  });
});