// jest.setup.js

// Creates reusable event listener mocks with standard browser API shape
function createMockListener() {
  const listeners = [];
  const mock = jest.fn((...args) => {
    listeners.forEach(listener => listener(...args));
  });
  mock.addListener = jest.fn(listener => {
    listeners.push(listener);
  });
  return mock;
}

// Mocks Chrome API to avoid need for real browser in tests
global.chrome = {
  // Simulates extension messaging system for component communication
  runtime: {
    onMessage: createMockListener(),
    sendMessage: jest.fn(),
    lastError: null,
    onInstalled: createMockListener(),
  },
  // Mocks storage for testing data persistence scenarios
  storage: {
    sync: {
      get: jest.fn().mockImplementation((keys, callback) => {
        const defaultData = {
          inactiveThreshold: 60,
          tabLimit: 100,
          rules: [{ keyword: 'example', action: 'archive', tag: 'testTag' }]
        };
        const result = {};
        if (Array.isArray(keys)) {
          keys.forEach(key => {
            result[key] = defaultData[key];
          });
        } else if (typeof keys === 'string') {
          result[keys] = defaultData[keys];
        } else {
          Object.assign(result, defaultData);
        }
        callback && callback(result);
        return Promise.resolve(result);
      }),
      set: jest.fn((items, callback) => {
        callback && callback();
      }),
    },
    local: {
      get: jest.fn(),
      set: jest.fn(),
      remove: jest.fn(),
    },
  },
  // Provides tab management mocks for testing core functionality
  tabs: {
    onCreated: createMockListener(),
    onUpdated: createMockListener(),
    onActivated: createMockListener(),
    onRemoved: createMockListener(),
    query: jest.fn(),
    get: jest.fn().mockImplementation((tabId, callback) => {
      const tab = { id: tabId, title: `Tab ${tabId}`, url: `https://example.com` };
      callback(tab);
      return Promise.resolve(tab);
    }),
    update: jest.fn(),
    discard: jest.fn(),

    // Add mock implementation for tabs.remove
    remove: jest.fn().mockImplementation((tabId, callback) => {
      if (callback) callback();
      return Promise.resolve();
    }),
    create: jest.fn().mockImplementation((createProperties) => {
      const tab = { id: Date.now(), ...createProperties };
      return Promise.resolve(tab);
    }),
  },
  // Enables testing of scheduled tasks without timeouts
  alarms: {
    create: jest.fn(),
    onAlarm: createMockListener(),
  },
};

// Supports cross-browser compatibility testing
global.browser = global.chrome;

// Mock global `self` for Service Worker with proper jest mock functions
global.self = {
  addEventListener: jest.fn(),
};

// Mock requestAnimationFrame to simulate frame updates
global.requestAnimationFrame = (callback) => {
  setTimeout(callback, 0);
};