// tests/jest/background.test.js

const mockBrowser = require('./mocks/browserMock.js');
const background = require('../../src/background/background.js');

// Ensure 'browser' is imported correctly
const browser = require('webextension-polyfill');
const { store } = require('../../src/utils/stateManager.js');
const { createMockTab } = require('./utils/testUtils.js');

// Mock the necessary modules
jest.mock('../../src/utils/tagUtils.js');
jest.mock('../../src/utils/stateManager.js', () => ({
  store: {
    getState: jest.fn(() => ({ tabActivity: {}, archivedTabs: {}, isTaggingPromptActive: false })),
    dispatch: jest.fn(),
  },
  initializeStateFromStorage: jest.fn().mockResolvedValue(),
}));

describe("Background script", () => {
  let mockTab;
  let handlers = {};
  
  beforeEach(async () => {
    jest.clearAllMocks();
    console.error.mockClear();
    mockBrowser._testing.clearAllListeners();
    handlers = {}; // Reset handlers
    
    mockTab = createMockTab(1, {
      title: 'Test Tab', 
      url: 'https://example.com',
      active: true
    });

    // Initialize ALL browser API mocks first with defaults
    browser.tabs = {
      onActivated: { addListener: jest.fn(fn => { handlers.activated = fn; }) },
      onUpdated: { addListener: jest.fn(fn => { handlers.updated = fn; }) },
      onCreated: { addListener: jest.fn(fn => { handlers.created = fn; }) },
      get: jest.fn().mockResolvedValue(mockTab)
    };

    browser.runtime = {
      onMessage: { addListener: jest.fn(fn => { handlers.message = fn; }) },
      onInstalled: { addListener: jest.fn(fn => { handlers.installed = fn; }) },
      onError: { addListener: jest.fn(fn => { handlers.error = fn; }) }
    };

    browser.alarms = { create: jest.fn() };
    browser.storage = { 
      sync: { 
        set: jest.fn(),
        get: jest.fn().mockResolvedValue({})
      } 
    };
    
    // Setup declarativeNetRequest with required methods and mock implementation
    browser.declarativeNetRequest = {
      updateDynamicRules: jest.fn().mockImplementation(async ({ addRules, removeRuleIds }) => {
        return Promise.resolve(true);
      }),
      getDynamicRules: jest.fn().mockResolvedValue([]),
      DEFAULT_PRIORITY: 1
    };

    // Reset store mock with empty initial state
    store.dispatch.mockClear();
    store.getState.mockReturnValue({
      tabActivity: {},
      archivedTabs: {},
      isTaggingPromptActive: false
    });

    // Wait for initialization to complete
    await background.initBackground(browser);
    
    // Simulate installation to trigger rule updates
    if (handlers.installed) {
      await handlers.installed();
    }
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
    browser._testing.clearAllListeners(); // Clear all listeners after each test
  });

  test("should initialize extension with required listeners", async () => {
    // Wait for any pending promises to resolve
    await new Promise(resolve => setTimeout(resolve, 0));
    
    // Verify listeners and API calls
    expect(browser.tabs.onActivated.addListener).toHaveBeenCalled();
    expect(browser.tabs.onUpdated.addListener).toHaveBeenCalled();
    expect(browser.tabs.onCreated.addListener).toHaveBeenCalled();
    expect(browser.runtime.onMessage.addListener).toHaveBeenCalled();
    expect(browser.alarms.create).toHaveBeenCalledWith("checkForInactiveTabs", { periodInMinutes: 5 });
    expect(browser.declarativeNetRequest.updateDynamicRules).toHaveBeenCalledWith({
      addRules: expect.arrayContaining([
        expect.objectContaining({
          id: 1,
          priority: 1,
          action: { type: 'block' },
          condition: { urlFilter: 'https://example.com/*' }
        })
      ]),
      removeRuleIds: []
    });
  });

  test("should initialize default settings on installation", async () => {
    expect(handlers.installed).toBeDefined();
    await handlers.installed();
    expect(browser.storage.sync.set).toHaveBeenCalledWith({
      inactiveThreshold: 60,
      tabLimit: 100,
      rules: [],
    });
  });

  test("should handle runtime errors correctly", async () => {
    expect(handlers.error).toBeDefined();
    const testError = new Error(`Failed to handle tab ${mockTab.id}`);
    handlers.error(testError);
    expect(console.error).toHaveBeenCalledWith('Runtime error:', testError);
  });

  test("should update tab activity on tab events", async () => {
    // Reset the dispatch mock to clear any initialization calls
    store.dispatch.mockClear();
    
    expect(handlers.activated).toBeDefined();
    await handlers.activated({ tabId: mockTab.id });
    
    expect(store.dispatch).toHaveBeenCalledWith({
      type: 'UPDATE_TAB_ACTIVITY',
      tabId: mockTab.id,
      timestamp: expect.any(Number)
    });
  });

  test("should handle message passing correctly", async () => {
    expect(handlers.message).toBeDefined();
    const sendResponse = jest.fn();
    await handlers.message(
      { action: 'getState' }, 
      { id: 'test-sender' }, 
      sendResponse
    );
    expect(sendResponse).toHaveBeenCalledWith({
      state: expect.objectContaining({
        tabActivity: {},
        archivedTabs: {},
        isTaggingPromptActive: false
      })
    });
  });
});