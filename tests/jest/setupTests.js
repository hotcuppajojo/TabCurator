// tests/jest/setupTests.js

// Mock the chrome APIs globally for all tests
global.chrome = {
  runtime: {
    onMessage: {
      addListener: jest.fn(),
    },
    sendMessage: jest.fn(),
    onInstalled: {
      addListener: jest.fn(),
    },
  },
  tabs: {
    onCreated: createMockListener(),
    onUpdated: createMockListener(), // Ensure onUpdated is correctly mocked
    onActivated: createMockListener(),
    onRemoved: createMockListener(),
    query: jest.fn().mockResolvedValue([]), // Keep only this definition
    get: jest.fn().mockImplementation((tabId, callback) => {
      const tab = { id: tabId, title: `Tab ${tabId}`, url: `https://example.com` };
      callback(tab);
      return Promise.resolve(tab);
    }),
    update: jest.fn(),
    discard: jest.fn(),
    remove: jest.fn(),
  },
  alarms: {
    create: jest.fn(),
    onAlarm: { addListener: jest.fn() },
  },
  storage: {
    sync: {
      get: jest.fn().mockImplementation((keys, callback) => {
        const defaultData = {
          inactiveThreshold: 60,
          tabLimit: 100,
          rules: [], // Ensure rules are included
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
        callback(result);
      }),
      set: jest.fn((items, callback) => {
        callback && callback();
      }),
    },
  },
};

// Alias `browser` to `chrome` for compatibility
global.browser = global.chrome;

// Mock global `self` for Service Worker
global.self = {
  addEventListener: jest.fn(),
};

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