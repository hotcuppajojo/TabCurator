// jest.setup.js

// Update createMockListener to include callListeners helper
function createMockListener() {
  const listeners = [];
  const mock = {
    addListener: jest.fn(listener => listeners.push(listener)),
    callListeners: (...args) => listeners.forEach(listener => listener(...args)),
    hasListener: jest.fn(() => listeners.length > 0),
    removeListener: jest.fn(listener => {
      const index = listeners.indexOf(listener);
      if (index > -1) listeners.splice(index, 1);
    })
  };
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
    // Add the onChanged mock
    onChanged: {
      addListener: jest.fn(),
    },
  },
  // Provides tab management mocks for testing core functionality
  tabs: {
    onCreated: createMockListener(),
    onUpdated: createMockListener(),
    onActivated: createMockListener(),
    onRemoved: createMockListener(),
    query: jest.fn().mockImplementation((queryInfo, callback) => {
      const tabs = [
        { id: 1, active: false, title: 'Tab 1' },
        { id: 2, active: false, title: 'Tab 2' },
        { id: 3, active: true, title: 'Tab 3' }
      ];
      if (callback) callback(tabs);
      return Promise.resolve(tabs);
    }),
    get: jest.fn().mockImplementation((tabId, callback) => {
      const tab = { id: tabId, title: `Tab ${tabId}`, url: `https://example.com` };
      callback(tab);
      return Promise.resolve(tab);
    }),
    update: jest.fn().mockImplementation((tabId, updateInfo, callback) => {
      // Simulate successful update
      if (callback) callback();
      return Promise.resolve();
    }),
    discard: jest.fn().mockImplementation((tabId) => {
      return Promise.resolve();
    }),
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
global.self = global; // Ensure 'self' refers to the global object
global.self.addEventListener = jest.fn();

// Mock requestAnimationFrame to simulate frame updates
global.requestAnimationFrame = (callback) => {
  setTimeout(callback, 0);
};

// Mock global alert to capture alert calls in tests
global.alert = jest.fn();

// Mock global prompt
global.prompt = jest.fn(() => "Morning Session");

// Update document body with all required elements
document.body.innerHTML = `
  <input id="currentTabId" />
  <input id="tagInput" />
  <button id="viewArchivesButton"></button>
  <button id="saveSessionButton"></button>
  <button id="viewSessionsButton"></button>
  <button id="archiveTabButton"></button>
  <button id="suspendButton"></button>
  <button id="addRuleButton"></button>
  <ul id="archiveList"></ul>
  <ul id="sessionsList"></ul>
  <ul id="rulesList">
    <li class="rule-item">
      <input class="rule-condition" type="text" />
      <input class="rule-action" type="text" />
      <button class="delete-rule">Delete</button>
    </li>
  </ul>
`;