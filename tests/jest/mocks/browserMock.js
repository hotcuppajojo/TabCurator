// tests/jest/mocks/browserMock.js

/**
 * Creates a complete mock browser event listener with standard Chrome extension APIs
 * Implements addListener, removeListener and hasListener for full API compatibility
 * @returns {jest.Mock} Enhanced mock function with listener capabilities
 */
const createMockListener = () => {
  const listeners = [];
  const mock = {
    addListener: jest.fn(listener => listeners.push(listener)),
    removeListener: jest.fn(listener => {
      const index = listeners.indexOf(listener);
      if (index > -1) listeners.splice(index, 1);
    }),
    hasListener: jest.fn((listener) => listeners.includes(listener)),
    callListeners: (...args) => listeners.forEach(listener => listener(...args)),
  };
  return mock;
};

/**
 * Creates a comprehensive mock of Chrome browser extension APIs
 * Includes mocking for webextension-polyfill
 * @returns {Object} Mock browser object with runtime, storage, tabs and alarms APIs
 */
const createMockBrowser = () => {
  const mockBrowser = {
    runtime: {
      onMessage: createMockListener(),
      onInstalled: createMockListener(),
      sendMessage: jest.fn(),
      lastError: null,
    },
    tabs: {
      onActivated: createMockListener(),
      onCreated: createMockListener(),
      onRemoved: createMockListener(),
      onUpdated: createMockListener(),
      query: jest.fn(),
      get: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
      discard: jest.fn().mockImplementation((tabId) => {
        if (!tabId || typeof tabId !== 'number') {
          return Promise.reject(new Error('Invalid tab ID'));
        }
        return Promise.resolve({ 
          id: tabId, 
          discarded: true,
          title: `Tab ${tabId}`,
          url: 'https://example.com',
          windowId: 1,
          active: false,
          status: 'complete'
        });
      }),
    },
    storage: {
      sync: {
        get: jest.fn((keys) => {
          const defaultData = {
            inactiveThreshold: 60,
            tabLimit: 100,
            rules: [{ condition: 'example.com', action: 'Tag: Research' }],
            savedSessions: {}
          };
          if (typeof keys === 'string') {
            return Promise.resolve({ [keys]: defaultData[keys] });
          } else if (Array.isArray(keys)) {
            const result = {};
            keys.forEach(key => {
              result[key] = defaultData[key];
            });
            return Promise.resolve(result);
          } else {
            return Promise.resolve(defaultData);
          }
        }),
        set: jest.fn((items) => Promise.resolve()),
        remove: jest.fn((keys) => Promise.resolve()),
      },
      local: {
        get: jest.fn(),
        set: jest.fn(),
        remove: jest.fn(),
      },
      onChanged: createMockListener(),
    },
    alarms: {
      create: jest.fn(),
      onAlarm: createMockListener(),
    },
    declarativeNetRequest: {
      updateDynamicRules: jest.fn(),
    },
    // ...other necessary browser API mocks...
  };

  return mockBrowser;
};

// Export createMockListener as a named export
const browserMock = {
  createMockBrowser,
  createMockListener
};

// Export createMockBrowser as a named export
export { createMockBrowser };

// Use default export as the browser mock
export default createMockBrowser();