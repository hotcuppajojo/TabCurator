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
const createMockBrowser = () => {
  // Create instance first to allow self-referencing
  const instance = {
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
      onInstalled: createMockListener(),
      // Error handling simulation support
      lastError: null, // Ensure lastError can be set in tests
    },
    storage: {
      sync: {
        // Implements flexible storage.sync.get with support for string, array and object keys
        // Returns predefined test data matching production schema
        get: jest.fn().mockImplementation((key) => {
          const defaultData = {
            inactiveThreshold: 60,
            tabLimit: 100,
            rules: [{ condition: 'example.com', action: 'Tag: Research' }],
            savedSessions: {}
          };
          return Promise.resolve({ [key]: defaultData[key] });
        }),
        // Simulates successful storage updates with callback support
        set: jest.fn().mockImplementation((items) => {
          // Optionally update internal state if needed
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
          { id: 1, active: false, title: 'Tab 1', url: 'https://example1.com' },
          { id: 2, active: false, title: 'Tab 2', url: 'https://example2.com' },
          { id: 3, active: true, title: 'Tab 3', url: 'https://example3.com' }
        ];
        return Promise.resolve(tabs);
      }),
      // Simulates tab creation with unique ID generation
      create: jest.fn().mockImplementation((createProperties) => {
        const tab = { id: Date.now(), ...createProperties };
        return Promise.resolve(tab);
      }),
      // Tab information retrieval simulation
      get: jest.fn().mockImplementation((tabId) => {
        const tab = { id: tabId, title: `Tab ${tabId}`, url: `https://example.com/page` };
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
      onAlarm: createMockListener(),
    }
  };

  return instance;
};

module.exports = { createMockBrowser };