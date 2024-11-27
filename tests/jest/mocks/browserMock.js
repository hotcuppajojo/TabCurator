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
    sendMessage: jest.fn().mockImplementation((message, callback) => {
      if (callback) {
        callback({ success: true });
      }
      return Promise.resolve({ success: true });
    }),
    onMessage: {
      addListener: jest.fn(),
    },
    onInstalled: {
      addListener: jest.fn(),
    },
    lastError: null,
  },
  storage: {
    sync: {
      // Update the get method to handle keys properly
      get: jest.fn().mockImplementation((keys) => {
        const defaultData = {
          inactiveThreshold: 60,
          tabLimit: 100,
          rules: []
        };
        let result = {};
        if (typeof keys === 'string') {
          result[keys] = defaultData[keys];
        } else if (Array.isArray(keys)) {
          keys.forEach((key) => {
            result[key] = defaultData[key];
          });
        } else {
          result = defaultData;
        }
        return Promise.resolve(result);
      }),
      set: jest.fn((items, callback) => {
        callback && callback();
        return Promise.resolve();
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
      remove: jest.fn().mockImplementation((key) => {
        return Promise.resolve();
      }),
    },
  },
  tabs: {
    // Simulates fixed tab set for deterministic testing
    query: jest.fn().mockImplementation((queryInfo) => {
      const tabs = [
        { id: 1, active: false, title: 'Tab 1' },
        { id: 2, active: false, title: 'Tab 2' },
        { id: 3, active: true, title: 'Tab 3' }
      ];
      return Promise.resolve(tabs);
    }),
    create: jest.fn().mockImplementation((createProperties) => {
      const tab = { id: Date.now(), ...createProperties };
      return Promise.resolve(tab);
    }),
    // Provides minimal tab operation implementations
    get: jest.fn().mockImplementation((tabId, callback) => {
      const tab = { id: tabId, title: `Tab ${tabId}`, url: `https://example.com` };
      callback(tab);
      return Promise.resolve(tab);
    }),
    update: jest.fn((tabId, updateInfo, callback) => {
      if (callback) callback();
    }),
    discard: jest.fn().mockImplementation((tabId) => {
      return Promise.resolve();
    }),
    // Adds a mock for tabs.remove to support archiving in tests
    remove: jest.fn().mockImplementation((tabId, callback) => {
      if (callback) callback();
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