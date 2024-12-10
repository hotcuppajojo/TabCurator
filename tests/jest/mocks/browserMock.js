// tests/jest/mocks/browserMock.js

/**
 * Creates a complete mock browser event listener with standard Chrome extension APIs
 * @returns {object} Mock event listener implementation
 */
const createMockListener = () => {
  const listeners = new Set();

  // Create a mock function that adds listeners to the Set
  const addListenerMock = jest.fn((listener) => {
    if (typeof listener === 'function') {
      listeners.add(listener);
      return true;
    }
    return false;
  });

  const hasListenersMock = jest.fn(() => listeners.size > 0);
  const getListenersMock = jest.fn(() => Array.from(listeners));

  return {
    addListener: addListenerMock,
    removeListener: jest.fn((listener) => {
      const result = listeners.delete(listener);
      return result;
    }),
    hasListener: jest.fn((listener) => listeners.has(listener)),
    hasListeners: hasListenersMock,
    getListeners: getListenersMock,
    trigger: jest.fn((...args) => {
      listeners.forEach(listener => listener(...args));
      return true;
    }),
    _reset: () => {
      listeners.clear();
      addListenerMock.mockClear();
      hasListenersMock.mockClear();
      getListenersMock.mockClear();
    }
  };
};

// Create the mocked browser object with all implementations
const mockBrowser = {
  runtime: {
    onInstalled: createMockListener(),
    onMessage: createMockListener(),
    sendMessage: jest.fn((message) => Promise.resolve({ success: true })),
    lastError: null,
    onConnect: createMockListener(),
    onError: createMockListener(),
    onStartup: createMockListener(),
    onSuspend: createMockListener()
  },
  tabs: {
    onCreated: createMockListener(),
    onRemoved: createMockListener(),
    onUpdated: createMockListener(),
    onActivated: createMockListener(),
    query: jest.fn().mockResolvedValue([
      { id: 1, title: 'Tab 1', url: 'https://example.com', active: false },
      { id: 2, title: 'Tab 2', url: 'https://example2.com', active: true }
    ]),
    get: jest.fn().mockResolvedValue({
      id: 1,
      url: 'https://example.com',
      title: 'Test Tab'
    }),
    create: jest.fn().mockImplementation(createProperties => 
      Promise.resolve({ id: Date.now(), ...createProperties })),
    update: jest.fn().mockImplementation((tabId, updateProperties) =>
      Promise.resolve({ id: tabId, ...updateProperties })),
    remove: jest.fn().mockResolvedValue(),
    discard: jest.fn().mockImplementation(tabId =>
      Promise.resolve({ id: tabId, discarded: true }))
  },
  alarms: {
    create: jest.fn(),
    onAlarm: createMockListener()
  },
  storage: {
    sync: {
      get: jest.fn().mockImplementation((keys) => {
        const defaultData = {
          archivedTabs: {},
          tabActivity: {},
          savedSessions: {},
          isTaggingPromptActive: false,
          inactiveThreshold: 60,
          tabLimit: 100,
          rules: []
        };
        if (typeof keys === 'string') {
          return Promise.resolve({ [keys]: defaultData[keys] });
        }
        return Promise.resolve(defaultData);
      }),
      set: jest.fn().mockResolvedValue(),
      remove: jest.fn().mockResolvedValue()
    },
    local: {
      get: jest.fn().mockResolvedValue({}),
      set: jest.fn().mockResolvedValue(),
      remove: jest.fn().mockResolvedValue()
    },
    onChanged: createMockListener()
  }
};

// Add support for state operations in storage mock
mockBrowser.storage.sync = {
  ...mockBrowser.storage.sync,
  get: jest.fn().mockImplementation(() => Promise.resolve({
    archivedTabs: {},
    tabActivity: {},
    savedSessions: {},
    isTaggingPromptActive: false
  }))
};

// Add declarativeNetRequest mocks
mockBrowser.declarativeNetRequest = {
  updateDynamicRules: jest.fn().mockResolvedValue(),
};

// Update exports to include testing utilities
module.exports = {
  ...mockBrowser,
  _testing: {
    createMockListener,
    clearAllListeners: () => {
      const clearListeners = (obj) => {
        Object.values(obj).forEach(val => {
          if (val && typeof val === 'object' && val._reset) {
            val._reset();
          }
        });
      };
      clearListeners(mockBrowser.tabs);
      clearListeners(mockBrowser.runtime);
      clearListeners(mockBrowser.alarms);
    }
  },
  default: mockBrowser, // Ensure 'default' export for 'webextension-polyfill'
};