// tests/jest/background.test.js
// Tests background service worker core functionality with isolated mock environment

const { createMockBrowser } = require("./mocks/browserMock");
const background = require('../../src/background/background.js');
const { store } = require('../../src/utils/stateManager.js');

// Mock the fs module to prevent fs related errors during tests
jest.mock('fs-extra', () => ({
  copySync: jest.fn(),
}));

const createMockListener = () => {
  return {
    addListener: jest.fn()
  };
};

// Mock browser APIs
const mockBrowser = {
  runtime: {
    lastError: null,
    onMessage: createMockListener(),
    onConnect: createMockListener(),
    sendMessage: jest.fn(),
    connect: jest.fn()
  },
  // ...existing code...
};

import browser from 'webextension-polyfill';

describe("Background script", () => {
  // Prevents race conditions in async tests by ensuring microtask queue is empty
  const flushPromises = () => new Promise(resolve => setTimeout(resolve, 0));

  let mockBrowser;

  // Handle module-level initialization
  beforeAll(() => {
    // Clear any existing modules
    jest.resetModules();

    // Ensure global.self exists and has proper event listener capabilities
    global.self = {
      addEventListener: jest.fn(),
      error: jest.fn(),
      unhandledrejection: jest.fn()
    };
  });

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockBrowser = createMockBrowser();

    background.savedSessions = {}; // Reset savedSessions

    // Mock runtime.onMessage to store listeners
    const messageListeners = [];
    mockBrowser.runtime.onMessage = {
      addListener: jest.fn((listener) => messageListeners.push(listener)),
      callListeners: (...args) => messageListeners.forEach(listener => listener(...args))
    };

    // Mock onUpdated to store listeners
    const updatedListeners = [];
    mockBrowser.tabs.onUpdated = {
      addListener: jest.fn((listener) => updatedListeners.push(listener)),
      callListeners: (...args) => updatedListeners.forEach(listener => listener(...args))
    };

    // Store listeners for other events
    const createdListeners = [];
    mockBrowser.tabs.onCreated = {
      addListener: jest.fn((listener) => createdListeners.push(listener)),
      callListeners: (...args) => createdListeners.forEach(listener => listener(...args))
    };

    // Initialize background with mocks
    background.initBackground(mockBrowser);

    // Make listeners accessible in tests
    background.messageListeners = messageListeners;
    background.updatedListeners = updatedListeners;
    background.createdListeners = createdListeners;

    // Reset test state
    background.actionHistory.length = 0;
    Object.keys(background.archivedTabs).forEach(key => delete background.archivedTabs[key]);
    background.setIsTaggingPromptActive(false);
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  test("should initialize extension with required listeners", () => {
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
    const sendResponse = jest.fn();
    const testCases = [
      {
        message: { action: 'GET_STATE' },
        expectedResponse: { state: store.getState() }
      },
      {
        message: { action: 'DISPATCH_ACTION', payload: { type: 'TEST' } },
        expectedResponse: { success: true }
      },
      {
        message: { action: 'UNKNOWN' },
        expectedResponse: { error: 'Unknown action' }
      }
    ];

    for (const { message, expectedResponse } of testCases) {
      mockBrowser.runtime.onMessage.addListener.mock.calls[0][0](
        message, null, sendResponse
      );
      await flushPromises();
      expect(sendResponse).toHaveBeenCalledWith(expectedResponse);
    }
  });

  // Continue with other background-specific tests...
});