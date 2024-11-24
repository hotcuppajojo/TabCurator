// tests/jest/mocks/browserMock.js

// Creates mock listeners with complete browser event API interface
const createMockListener = () => {
  const fn = jest.fn();
  fn.addListener = jest.fn();
  fn.removeListener = jest.fn();
  fn.hasListener = jest.fn(() => false);
  return fn;
};

const createMockBrowser = () => ({
  runtime: {
    // Simulates successful async message handling
    sendMessage: jest.fn((message, callback) => {
      if (callback) callback({ message: 'Success' });
    }),
    onMessage: {
      addListener: jest.fn(),
    },
    lastError: null,
  },
  storage: {
    sync: {
      // Provides default extension settings for consistent testing
      get: jest.fn().mockImplementation((keys, callback) => {
        const result = { inactiveThreshold: 60, tabLimit: 100 };
        callback?.(result);
        return Promise.resolve(result);
      }),
      set: jest.fn((data, callback) => {
        if (callback) callback();
      }),
    },
    local: {
      // Simulates tab state storage with predictable test data
      get: jest.fn((key, callback) => {
        callback({ oldestTabId: 1 });
      }),
      set: jest.fn((data, callback) => {
        if (callback) callback();
      }),
      remove: jest.fn((key, callback) => {
        if (callback) callback();
      }),
    },
  },
  tabs: {
    // Simulates fixed tab set for deterministic testing
    query: jest.fn().mockImplementation((queryInfo, callback) => {
      const tabs = [
        { id: 1, active: false, title: 'Tab 1' },
        { id: 2, active: false, title: 'Tab 2' },
        { id: 3, active: true, title: 'Tab 3' }
      ];
      callback?.(tabs);
      return Promise.resolve(tabs);
    }),
    // Provides minimal tab operation implementations
    get: jest.fn((tabId, callback) => {
      callback({ id: tabId, title: `Tab ${tabId}` });
    }),
    update: jest.fn((tabId, updateInfo, callback) => {
      if (callback) callback();
    }),
    discard: jest.fn().mockImplementation((tabId, callback) => {
      if (callback) {
        callback();
      }
      return Promise.resolve();
    }),
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
  // Enables testing of scheduled maintenance tasks
  alarms: {
    create: jest.fn(),
    onAlarm: {
      addListener: jest.fn()
    }
  }
});

module.exports = { createMockBrowser };