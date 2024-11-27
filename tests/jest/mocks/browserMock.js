// tests/jest/mocks/browserMock.js

/**
 * Creates a complete mock browser event listener with standard Chrome extension APIs
 * Implements addListener, removeListener and hasListener for full API compatibility
 * @returns {jest.Mock} Enhanced mock function with listener capabilities
 */
const createMockListener = () => {
  const fn = jest.fn();
  fn.addListener = jest.fn();
  fn.removeListener = jest.fn();
  fn.hasListener = jest.fn(() => false);
  return fn;
};

/**
 * Creates a comprehensive mock of Chrome browser extension APIs
 * Simulates core browser functionalities for testing extension behaviors
 * @returns {Object} Mock browser object with runtime, storage, tabs and alarms APIs
 */
const createMockBrowser = () => ({
  runtime: {
    // Mock async messaging system with guaranteed success response
    // Supports both callback and Promise-based implementations
    sendMessage: jest.fn().mockImplementation((message, callback) => {
      if (callback) {
        callback({ success: true });
      }
      return Promise.resolve({ success: true });
    }),
    // Extension event listeners for background script communication
    onMessage: {
      addListener: jest.fn(),
    },
    // Lifecycle event handlers for extension state management
    onInstalled: {
      addListener: jest.fn(),
    },
    // Error handling simulation support
    lastError: null, // Ensure lastError can be set in tests
  },
  storage: {
    sync: {
      // Implements flexible storage.sync.get with support for string, array and object keys
      // Returns predefined test data matching production schema
      get: jest.fn().mockImplementation((keys, callback) => {
        // Mock data structure reflecting production configuration
        const defaultData = {
          inactiveThreshold: 60,
          tabLimit: 100,
          rules: [{ keyword: 'example', action: 'archive', tag: 'testTag' }]
        };
        // Key-specific data retrieval logic
        let result = {};
        // Handle single key string access
        if (typeof keys === 'string') {
          result[keys] = defaultData[keys];
        }
        // Handle array of keys
        else if (Array.isArray(keys)) {
          keys.forEach((key) => {
            result[key] = defaultData[key];
          });
        }
        // Handle object pattern matching
        else if (typeof keys === 'object') {
          Object.keys(keys).forEach((key) => {
            result[key] = defaultData[key];
          });
        }
        // Default to full data return
        else {
          Object.assign(result, defaultData);
        }
        callback(result);
        return Promise.resolve(result);
      }),
      // Simulates successful storage updates with callback support
      set: jest.fn((items, callback) => {
        // Merge items into defaultData if necessary
        // For simplicity, just call the callback
        callback && callback();
        return Promise.resolve();
      }),
    },
    local: {
      // Provides deterministic local storage state for tab management testing
      get: jest.fn((key, callback) => {
        callback({ oldestTabId: 1 });
        return Promise.resolve({ oldestTabId: 1 });
      }),
      // Simulates successful local storage updates
      set: jest.fn((data, callback) => {
        if (callback) callback();
        return Promise.resolve();
      }),
      // Supports cleanup operations in tests
      remove: jest.fn().mockImplementation((key) => {
        return Promise.resolve();
      }),
    },
    // Storage change notification system mock
    onChanged: {
      addListener: jest.fn(),
    },
  },
  tabs: {
    // Simulates tab queries with consistent test data set
    // Returns fixed array of tabs for predictable test scenarios
    query: jest.fn().mockImplementation((queryInfo) => {
      const tabs = [
        { id: 1, active: false, title: 'Tab 1' },
        { id: 2, active: false, title: 'Tab 2' },
        { id: 3, active: true, title: 'Tab 3' }
      ];
      return Promise.resolve(tabs);
    }),
    // Simulates tab creation with unique ID generation
    create: jest.fn().mockImplementation((createProperties) => {
      const tab = { id: Date.now(), ...createProperties };
      return Promise.resolve(tab);
    }),
    // Tab information retrieval simulation
    get: jest.fn().mockImplementation((tabId, callback) => {
      const tab = { id: tabId, title: `Tab ${tabId}`, url: `https://example.com` };
      callback(tab);
      return Promise.resolve(tab);
    }),
    // Tab state modification operations
    update: jest.fn().mockImplementation((tabId, updateInfo, callback) => {
      // Simulate successful update
      if (callback) callback();
      return Promise.resolve();
    }),
    // Memory management operation simulation
    discard: jest.fn().mockImplementation((tabId) => {
      return Promise.resolve();
    }),
    // Tab removal simulation for archive testing
    remove: jest.fn().mockImplementation((tabId, callback) => {
      if (callback) callback();
      return Promise.resolve();
    }),
    // Tab lifecycle event handlers
    onCreated: {
      addListener: jest.fn()
    },
    onUpdated: {
      addListener: jest.fn()
    },
    onActivated: {
      addListener: jest.fn()
    },
    onRemoved: {
      addListener: jest.fn()
    }
  },
  // Maintenance scheduling simulation support
  alarms: {
    // Enables testing of timed operations
    create: jest.fn(),
    onAlarm: {
      addListener: jest.fn()
    }
  }
});

module.exports = { createMockBrowser };