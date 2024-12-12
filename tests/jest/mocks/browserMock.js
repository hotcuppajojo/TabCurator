// tests/jest/mocks/browserMock.js

// Remove jest import and use global jest
const createMockFn = (implementation) => {
  return jest.fn(implementation);
};

// Define listeners array at the top level
const alarmsOnAlarmListeners = [];

const createMockPort = () => ({
  name: 'mockPort',
  onMessage: {
    addListener: createMockFn(),
    removeListener: createMockFn()
  },
  onDisconnect: {
    addListener: createMockFn(),
    removeListener: createMockFn()
  },
  postMessage: createMockFn(),
  disconnect: createMockFn()
});

/**
 * Creates a complete mock browser event listener with standard Chrome extension APIs
 */
const createMockListener = () => {
  const listeners = new Set();
  
  const addListener = createMockFn((listener) => {
    if (typeof listener === 'function') {
      listeners.add(listener);
      return true;
    }
    return false;
  });

  const removeListener = createMockFn((listener) => {
    listeners.delete(listener);
  });

  const hasListener = createMockFn((listener) => listeners.has(listener));
  const hasListeners = createMockFn(() => listeners.size > 0);
  const getListeners = createMockFn(() => Array.from(listeners));
  const trigger = async (...args) => {
    for (const listener of listeners) {
      await listener(...args);
    }
  };

  return {
    addListener,
    removeListener,
    hasListener,
    hasListeners,
    getListeners,
    trigger,
    _reset: () => {
      listeners.clear();
    }
  };
};

// Create the mocked browser object with all implementations
const mockBrowser = {
  runtime: {
    onInstalled: createMockListener(),
    onMessage: createMockListener(),
    sendMessage: createMockFn(() => Promise.resolve({ success: true })),
    lastError: {
      message: null,
      set: function(msg) { this.message = msg; }
    },
    onConnect: createMockListener(),
    onError: createMockListener(),
    onStartup: createMockListener(),
    onSuspend: createMockListener(),
    connect: createMockFn(() => createMockPort())
  },
  tabs: {
    onCreated: createMockListener(),
    onRemoved: createMockListener(),
    onUpdated: createMockListener(),
    onActivated: createMockListener(),
    query: createMockFn(() => Promise.resolve([
      { id: 1, title: 'Tab 1', url: 'https://example.com', active: false },
      { id: 2, title: 'Tab 2', url: 'https://example2.com', active: true }
    ])),
    get: createMockFn((tabId) => Promise.resolve({
      id: tabId,
      url: 'https://example.com',
      title: 'Test Tab',
      active: false,
      discarded: false
    })),
    create: createMockFn(createProperties => Promise.resolve({ id: Date.now(), ...createProperties })),
    update: createMockFn((tabId, updateProperties) => Promise.resolve({
      id: tabId,
      ...updateProperties,
      discarded: updateProperties.autoDiscardable === true
    })),
    remove: createMockFn(() => Promise.resolve()),
    discard: createMockFn(tabId => Promise.resolve({ id: tabId, discarded: true }))
  },
  alarms: {
    create: createMockFn(),
    clearAll: createMockFn(),
    onAlarm: {
      addListener: createMockFn((listener) => {
        alarmsOnAlarmListeners.push(listener);
      }),
      removeListener: createMockFn((listener) => {
        const index = alarmsOnAlarmListeners.indexOf(listener);
        if (index > -1) {
          alarmsOnAlarmListeners.splice(index, 1);
        }
      }),
      trigger: createMockFn(async (alarm) => {
        for (const listener of alarmsOnAlarmListeners) {
          await listener(alarm);
        }
      }),
    }
  },
  storage: {
    sync: {
      _data: {
        archivedTabs: {},
        tabActivity: {},
        savedSessions: {},
        isTaggingPromptActive: false,
        inactiveThreshold: 60,
        tabLimit: 100,
        rules: []
      },
      get: createMockFn(function(keys) {
        return Promise.resolve(this._data);
      }),
      set: createMockFn(function(items) {
        Object.assign(this._data, items);
        return Promise.resolve();
      }),
      remove: createMockFn(function(keys) {
        if (typeof keys === 'string') {
          delete this._data[keys];
        } else if (Array.isArray(keys)) {
          keys.forEach(key => delete this._data[key]);
        }
        return Promise.resolve();
      })
    },
    local: {
      get: createMockFn(() => Promise.resolve({})),
      set: createMockFn(() => Promise.resolve()),
      remove: createMockFn(() => Promise.resolve())
    },
    onChanged: createMockListener()
  },
  declarativeNetRequest: {
    updateDynamicRules: createMockFn(() => Promise.resolve())
  },
  _reset: function() {
    // Reset all event listeners and mocks
    Object.values(this.runtime).forEach(event => {
      if (event && typeof event._reset === 'function') event._reset();
    });
    Object.values(this.tabs).forEach(event => {
      if (event && typeof event._reset === 'function') event._reset();
    });
    
    // Reset storage
    this.storage.sync._data = {
      archivedTabs: {},
      tabActivity: {},
      savedSessions: {},
      isTaggingPromptActive: false,
      inactiveThreshold: 60,
      tabLimit: 100,
      rules: []
    };
    
    // Clear alarm listeners
    alarmsOnAlarmListeners.length = 0;
    
    // Reset global.self.listeners if needed
    if (global.self && global.self.listeners) {
      global.self.listeners.clear();
    }
    
    // Reset global.page.goto if needed
    if (global.page && global.page.goto) {
      global.page.goto.mockClear();
    }
  }
};

// Export for both Jest and non-Jest environments
if (typeof module !== 'undefined' && module.exports) {
  module.exports = mockBrowser;
}