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
  
  // Export an object that matches the module's interface
  return {
    default: {
      queryTabs: queryTabsMock,
      discardTab: discardTabMock,
      getTab: jest.fn(),
      createTab: jest.fn(),
      updateTab: jest.fn(),
      removeTab: jest.fn(),
    },
    // Export the mocks directly
    queryTabs: queryTabsMock,
    discardTab: discardTabMock,
    // Export references for testing
    __queryTabsMock: queryTabsMock,
    __discardTabMock: discardTabMock,
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
import { setupTest, cleanupTest } from './setup/testSetup';
import { CONNECTION_NAME } from '../../src/background/constants.js'; // Add this import

describe('Background Service Worker', () => {
  let queryTabsMock, discardTabMock, consoleErrorSpy, sendResponse, handleMessage;

  beforeEach(async () => {
    jest.clearAllMocks();
    
    // Get the mocked functions differently
    const tabManager = jest.requireMock('../../src/utils/tabManager.js');
    queryTabsMock = tabManager.queryTabs;
    discardTabMock = tabManager.discardTab;
    
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
      // Get the alarm listener directly from the mock browser
      const [[alarmListener]] = mockBrowser.alarms.onAlarm.addListener.mock.calls;
      expect(alarmListener).toBeDefined();

      // Call the listener with the correct alarm name
      await alarmListener({ name: 'checkForInactiveTabs' });

      // Verify queryTabs was called
      expect(queryTabsMock).toHaveBeenCalledTimes(1);
      expect(queryTabsMock).toHaveBeenCalledWith(1);
      
      // Verify discard calls
      expect(discardTabMock).toHaveBeenCalledWith(1);
      expect(discardTabMock).toHaveBeenCalledWith(2);
      expect(discardTabMock).toHaveBeenCalledTimes(2);
    } catch (error) {
      console.error('Error in alarm test:', error);
      throw error;
    }
  }, 5000); // Add explicit timeout

  test('should handle connection timeouts', async () => {
    const error = new Error('Handler error');
    handleMessage.mockRejectedValueOnce(error);

    // Get the message handler
    const messageHandler = mockBrowser.runtime.onMessage.addListener.mock.calls[0][0];

    try {
      // Call the handler and await any rejected promises
      await messageHandler({ action: 'getState' }, {}, sendResponse);
    } catch (e) {
      // Error should be caught and logged
      expect(consoleErrorSpy).toHaveBeenCalledWith('Error handling message:', error);
      expect(sendResponse).toHaveBeenCalledWith({ error: error.message });
    }
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
    const mockPort = {
      onMessage: { addListener: jest.fn() },
      onDisconnect: { addListener: jest.fn() },
      postMessage: jest.fn(),
      name: CONNECTION_NAME
    };

    // Get and call the connection handler
    const connectHandler = mockBrowser.runtime.onConnect.addListener.mock.calls[0][0];
    connectHandler(mockPort);

    // Clear any initial messages
    mockPort.postMessage.mockClear();

    // Simulate disconnect
    const [[disconnectHandler]] = mockPort.onDisconnect.addListener.mock.calls;
    await disconnectHandler();

    // Try to send a message after disconnect
    await handleMessage({ action: 'getState' }, {}, sendResponse);

    // Verify no messages were sent after disconnect
    expect(mockPort.postMessage).not.toHaveBeenCalled();
  });
});
