// 1. Mock necessary modules first
jest.mock('../../src/utils/tagUtils.js', () => ({
  applyRulesToTab: jest.fn().mockResolvedValue(),
  archiveTab: jest.fn().mockResolvedValue(),
}));

jest.mock('../../src/utils/stateManager.js', () => ({
  store: {
    getState: jest.fn(() => ({
      tabActivity: {},
      archivedTabs: {},
      isTaggingPromptActive: false,
    })),
    dispatch: jest.fn(),
  },
  initializeStateFromStorage: jest.fn().mockResolvedValue(),
}));

// Update the tabManager mock
jest.mock('../../src/utils/tabManager.js', () => {
  const queryTabsMock = jest.fn().mockResolvedValue([{ id: 1 }, { id: 2 }]);
  const discardTabMock = jest.fn().mockResolvedValue();
  const getTabMock = jest.fn().mockImplementation(async (tabId) => ({
    id: tabId,
    url: 'https://example.com',
    title: 'Test Tab',
    active: false
  }));
  const suspendTabMock = jest.fn().mockImplementation(async (tabId) => ({
    id: tabId,
    discarded: true
  }));
  
  return {
    default: {
      queryTabs: queryTabsMock,
      discardTab: discardTabMock,
      getTab: getTabMock,
      createTab: jest.fn(),
      updateTab: jest.fn(),
      removeTab: jest.fn(),
      suspendTab: suspendTabMock
    },
    queryTabs: queryTabsMock,
    discardTab: discardTabMock,
    getTab: getTabMock,
    suspendTab: suspendTabMock,
    __queryTabsMock: queryTabsMock,
    __discardTabMock: discardTabMock,
    __getTabMock: getTabMock,
    __suspendTabMock: suspendTabMock
  };
});

// Update the messagingUtils mock
jest.mock('../../src/utils/messagingUtils.js', () => {
  const originalModule = jest.requireActual('../../src/utils/messagingUtils.js');
  return {
    ...originalModule,
    handleMessage: jest.fn(),
    createAlarm: jest.fn(),
    onAlarm: jest.fn((callback, browserInstance) => {
      // Store the callback for later use
      browserInstance.alarms.onAlarm.addListener(callback);
    }),
  };
});

// 2. Now import the modules after mocking
import { jest } from '@jest/globals';
import background from '../../src/background/background.js';
const mockBrowser = require('./mocks/browserMock.js');
import { createMockTab } from './utils/testUtils.js';
import { store } from '../../src/utils/stateManager.js';
import tagUtils from '../../src/utils/tagUtils.js';
import { CONNECTION_NAME } from '../../src/background/constants.js'; // Add this import

describe('Background Service Worker', () => {
  let queryTabsMock, discardTabMock, getTabMock, suspendTabMock, consoleErrorSpy, sendResponse, handleMessage;

  beforeEach(async () => {
    jest.clearAllMocks();
    
    // Get the mocked functions differently
    const tabManager = jest.requireMock('../../src/utils/tabManager.js');
    queryTabsMock = tabManager.queryTabs;
    discardTabMock = tabManager.discardTab;
    getTabMock = tabManager.getTab; // Added line to define getTabMock
    suspendTabMock = tabManager.suspendTab; // Added line to define suspendTabMock
    
    // Get the mocked handleMessage function
    handleMessage = require('../../src/utils/messagingUtils.js').handleMessage;
    
    // Setup mocks
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    sendResponse = jest.fn();

    // Initialize background with mock browser
    await background.initBackground(mockBrowser);
  });

  test('should check for inactive tabs on alarm', async () => {
    // Reset mocks
    queryTabsMock.mockClear();
    discardTabMock.mockClear();

    // Setup test data
    const testTabs = [{ id: 1 }, { id: 2 }];
    queryTabsMock.mockResolvedValueOnce(testTabs);

    try {
      // Get the alarm handler that was registered
      const [[alarmCallback]] = mockBrowser.alarms.onAlarm.addListener.mock.calls;
      expect(alarmCallback).toBeDefined();

      // Call the alarm callback directly with the correct alarm name
      await alarmCallback({ name: 'checkForInactiveTabs' });

      // Verify expected behavior
      expect(queryTabsMock).toHaveBeenCalledTimes(1);
      expect(queryTabsMock).toHaveBeenCalledWith({});
      expect(discardTabMock).toHaveBeenCalledWith(1);
      expect(discardTabMock).toHaveBeenCalledWith(2);
      expect(discardTabMock).toHaveBeenCalledTimes(2);
    } catch (error) {
      console.error('Error in alarm test:', error);
      throw error;
    }
  });

  test('should handle connection timeouts', async () => {
    // Setup error handling test
    handleMessage.mockImplementation(() => {
      const error = new Error('Handler error');
      console.error('Error handling message:', error);
      throw error;
    });

    // Get the message handlers
    const connectHandler = mockBrowser.runtime.onConnect.addListener.mock.calls[0][0];
    const mockPort = {
      name: CONNECTION_NAME,
      onMessage: { addListener: jest.fn() },
      onDisconnect: { addListener: jest.fn() },
      postMessage: jest.fn()
    };

    // Connect and get message handler
    connectHandler(mockPort);
    const [[messageHandler]] = mockPort.onMessage.addListener.mock.calls;

    // Trigger error
    await messageHandler({ action: 'getState' });

    // Verify error handling
    expect(consoleErrorSpy).toHaveBeenCalledWith('Error handling message:', expect.any(Error));
    expect(mockPort.postMessage).toHaveBeenCalledWith({
      type: 'ERROR',
      error: 'Handler error'
    });
  });

  test('should handle fetch events for extension resources', async () => {
    const request = new Request('chrome-extension://extension-id/popup.html');
    const { handleFetch } = background; // Destructure handleFetch from background
    const response = await handleFetch(request);
    expect(response).toBeDefined();
  });

  test('should handle connection lifecycle', async () => {
    const mockPort = {
      onMessage: { addListener: jest.fn() },
      onDisconnect: { addListener: jest.fn() },
      postMessage: jest.fn(),
      name: CONNECTION_NAME
    };

    // Get the connection handler directly
    const connectHandler = mockBrowser.runtime.onConnect.addListener.mock.calls[0][0];
    connectHandler(mockPort);

    expect(mockPort.onMessage.addListener).toHaveBeenCalled();
  });

  test('should reject messages after disconnect', async () => {
    // Setup mock port
    const mockPort = {
      name: CONNECTION_NAME,
      onMessage: { addListener: jest.fn() },
      onDisconnect: { addListener: jest.fn() },
      postMessage: jest.fn()
    };

    // Connect and store message handler
    const connectHandler = mockBrowser.runtime.onConnect.addListener.mock.calls[0][0];
    connectHandler(mockPort);

    // Get message handler
    const [[messageHandler]] = mockPort.onMessage.addListener.mock.calls;

    // Reset postMessage to ignore CONNECTION_ACK
    mockPort.postMessage.mockClear();

    // Disconnect the port
    const [[disconnectHandler]] = mockPort.onDisconnect.addListener.mock.calls;
    disconnectHandler();

    // Send a message after disconnect
    await messageHandler({ action: 'getState' });

    // Verify that no messages are sent after disconnect
    expect(mockPort.postMessage).not.toHaveBeenCalled();
  });

  test('should handle tab suspension', async () => {
    const tabId = 1;
    const tab = { id: tabId, url: 'https://example.com' };
    const suspendedTab = { ...tab, discarded: true };

    // Use the existing mocks
    getTabMock.mockResolvedValueOnce(tab);
    suspendTabMock.mockResolvedValueOnce(suspendedTab);

    // Setup mock port
    const mockPort = {
      name: CONNECTION_NAME,
      onMessage: { addListener: jest.fn(cb => cb({ action: 'suspendTab', tabId })) },
      onDisconnect: { addListener: jest.fn() },
      postMessage: jest.fn()
    };

    // Connect and trigger message handler
    const connectHandler = mockBrowser.runtime.onConnect.addListener.mock.calls[0][0];
    connectHandler(mockPort);

    // Allow any asynchronous operations to complete
    await Promise.resolve();

    // Verify the operations
    expect(getTabMock).toHaveBeenCalledWith(tabId);
    expect(suspendTabMock).toHaveBeenCalledWith(tabId);
    expect(mockPort.postMessage).toHaveBeenCalledWith({
      success: true,
      tab: suspendedTab
    });
  });
});
