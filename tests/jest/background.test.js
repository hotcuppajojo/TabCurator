// tests/jest/background.test.js
// Tests background service worker core functionality with isolated mock environment

const browser = require('webextension-polyfill');
const background = require('../../src/background/background.js');
const { store } = require('../../src/utils/stateManager.js');
const { createMockTab } = require('./utils/testUtils.js');
// Import createMockListener directly from browserMock instead of jest.setup.js
const { createMockListener } = require('./mocks/browserMock.js');

// Mock the necessary modules
jest.mock('webextension-polyfill');
jest.mock('../../src/utils/tabUtils.js');
jest.mock('../../src/utils/tagUtils.js');
jest.mock('../../src/utils/stateManager.js', () => ({
  store: {
    getState: jest.fn(() => ({ tabActivity: {}, archivedTabs: {}, isTaggingPromptActive: false })),
    dispatch: jest.fn(),
  },
}));

describe("Background script", () => {
  // Prevents race conditions in async tests by ensuring microtask queue is empty
  const flushPromises = () => new Promise(resolve => setTimeout(resolve, 0));

  let mockBrowser;

  // Handle module-level initialization
  beforeAll(() => {
    // Clear any existing modules
    jest.resetModules();

    // Remove or adjust global.self overrides if causing conflicts
    // global.self = {
    //   addEventListener: jest.fn(),
    //   error: jest.fn(),
    //   unhandledrejection: jest.fn()
    // };
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    console.error = jest.fn(); // Mock console.error
    
    // Setup mock event listeners first
    const messageListeners = [];
    const updatedListeners = [];
    const createdListeners = [];
    const activatedListeners = []; // Add activatedListeners array

    // Setup complete mock browser API with all required event listeners
    mockBrowser = {
      runtime: {
        onInstalled: {
          addListener: jest.fn()
        },
        onMessage: {
          addListener: jest.fn((listener) => messageListeners.push(listener))
        },
        sendMessage: jest.fn().mockResolvedValue({ success: true }),
        lastError: null
      },
      tabs: {
        onCreated: {
          addListener: jest.fn((listener) => createdListeners.push(listener))
        },
        onRemoved: createMockListener(),
        onUpdated: {
          addListener: jest.fn((listener) => {
            updatedListeners.push(listener);
            return listener; // Return listener to track calls
          })
        },
        onActivated: {
          addListener: jest.fn((listener) => {
            activatedListeners.push(listener);
            return listener; // Return listener to track calls
          })
        },
        query: jest.fn().mockResolvedValue([]),
        get: jest.fn().mockResolvedValue({}),
        create: jest.fn().mockResolvedValue({}),
        update: jest.fn().mockResolvedValue({}),
        remove: jest.fn().mockResolvedValue()
      },
      alarms: {
        create: jest.fn(),
        onAlarm: {
          addListener: jest.fn()
        }
      },
      storage: {
        sync: {
          get: jest.fn().mockResolvedValue({}),
          set: jest.fn().mockResolvedValue()
        }
      }
    };

    // Replace the mocked browser
    browser.tabs = mockBrowser.tabs;
    browser.runtime = mockBrowser.runtime;
    browser.alarms = mockBrowser.alarms;
    browser.storage = mockBrowser.storage;

    // Initialize background script
    await background.initBackground(mockBrowser);
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  test("should initialize extension with required listeners", async () => {
    // Verify the listeners were registered
    expect(mockBrowser.tabs.onActivated.addListener).toHaveBeenCalled();
    expect(mockBrowser.tabs.onUpdated.addListener).toHaveBeenCalled();
    expect(mockBrowser.tabs.onCreated.addListener).toHaveBeenCalled();
    expect(mockBrowser.runtime.onMessage.addListener).toHaveBeenCalled();
    expect(mockBrowser.alarms.create).toHaveBeenCalledWith("checkForInactiveTabs", { periodInMinutes: 5 });
  });

  test("should initialize default settings on installation", async () => {
    const onInstalledListener = mockBrowser.runtime.onInstalled.addListener.mock.calls[0][0];
    await onInstalledListener();
    
    expect(mockBrowser.storage.sync.set).toHaveBeenCalledWith({
      inactiveThreshold: 60,
      tabLimit: 100,
      rules: []
    });
  });

  test("should handle runtime messages correctly", async () => {
    // Initialize background first
    await background.initBackground(mockBrowser);
    
    const sendResponse = jest.fn();
    const sender = { url: 'https://test.com' }; // Add mock sender

    // Get the actual listener function that was registered
    const messageListener = mockBrowser.runtime.onMessage.addListener.mock.calls[0][0];
    expect(messageListener).toBeDefined();

    await messageListener({ action: 'GET_STATE' }, sender, sendResponse);
    expect(sendResponse).toHaveBeenCalledWith({ state: store.getState() });

    await messageListener({ action: 'DISPATCH_ACTION', payload: { type: 'TEST_ACTION' } }, sender, sendResponse);
    expect(store.dispatch).toHaveBeenCalledWith({ type: 'TEST_ACTION' });
    expect(sendResponse).toHaveBeenCalledWith({ success: true });
  });
});