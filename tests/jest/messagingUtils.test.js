// tests/jest/messagingUtils.test.js

const browser = require('webextension-polyfill');
const { 
  handleMessage, 
  initializeConnection, 
  sendMessage,
  _cleanup, // Add cleanup function import
  MAX_QUEUE_SIZE,
  RETRY_DELAY,
  MAX_RETRIES,
  MESSAGE_TIMEOUT,
  BATCH_SIZE
} = require('../../src/utils/messagingUtils.js');
const { store } = require('../../src/utils/stateManager.js');

// Remove redundant constant as it's now imported
// const MAX_QUEUE_SIZE = 100;

describe('Messaging Utils', () => {
  let mockPort;
  let mockStore;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    
    // Setup mock port
    mockPort = {
      onMessage: { 
        addListener: jest.fn(),
        removeListener: jest.fn(), // Add removeListener
      },
      onDisconnect: { 
        addListener: jest.fn(),
        removeListener: jest.fn(), // Add removeListener
      },
      postMessage: jest.fn(),
      name: 'content-connection'
    };

    // Setup mock browser API
    browser.runtime.connect = jest.fn().mockReturnValue(mockPort);
    browser.runtime.sendMessage = jest.fn().mockResolvedValue({});
    
    // Setup mock store
    mockStore = {
      getState: jest.fn().mockReturnValue({
        tabActivity: {},
        archivedTabs: {},
        savedSessions: {}
      }),
      dispatch: jest.fn()
    };

    // Mock console methods
    console.error = jest.fn();
    console.warn = jest.fn();
    console.log = jest.fn();
  });

  afterEach(async () => {
    jest.runOnlyPendingTimers(); // Run any pending timers
    jest.useRealTimers(); // Restore real timers
    jest.clearAllTimers(); // Clear all timers to prevent leaks
    await _cleanup(); // Ensure message queue and connections are cleared
    
    // Unreference any active timers explicitly if created
    // Example:
    // if (timer) {
    //   timer.unref();
    // }
  });

  describe('Connection Management', () => {
    test('should initialize connection with correct port name', () => {
      initializeConnection(jest.fn());
      expect(browser.runtime.connect).toHaveBeenCalledWith({ name: 'content-connection' });
    });   

    test('should handle connection errors and retry', async () => {
      const error = new Error('Connection failed');
      const secondMockPort = {
        onMessage: { 
          addListener: jest.fn(),
          removeListener: jest.fn(), // Add removeListener
        },
        onDisconnect: { 
          addListener: jest.fn(),
          removeListener: jest.fn(), // Add removeListener
        },
        postMessage: jest.fn(),
        name: 'content-connection'
      };

      // First connection attempt fails
      browser.runtime.connect.mockImplementationOnce(() => {
        throw error;
      });
      // Second attempt succeeds with new mock port
      browser.runtime.connect.mockImplementationOnce(() => secondMockPort);

      initializeConnection(jest.fn());
      expect(console.error).toHaveBeenCalledWith('Connection failed:', error);

      // Advance timers to trigger retry
      jest.advanceTimersByTime(1000);

      // Verify that the second connection attempt was made
      expect(browser.runtime.connect).toHaveBeenCalledTimes(2);
      
      // Verify that the message listener is added to the second mock port
      expect(secondMockPort.onMessage.addListener).toHaveBeenCalled();
      
      // Simulate successful connection
      const [[messageHandler]] = secondMockPort.onMessage.addListener.mock.calls;
      await messageHandler({ type: 'CONNECTION_ACK' });
    });

    test('should queue messages when disconnected', () => {
      const sendMessageFn = jest.fn();
      initializeConnection(sendMessageFn);

      // Simulate disconnection
      const disconnectHandler = mockPort.onDisconnect.addListener.mock.calls[0][0];
      disconnectHandler();

      // Send message while disconnected
      sendMessage({ action: 'test' });
      expect(mockPort.postMessage).not.toHaveBeenCalled();
    });
  });

  describe('Message Handling', () => {
    test('should handle state-related messages', async () => {
      const mockMessage = { action: 'getState' };
      const mockSendResponse = jest.fn();

      await handleMessage(mockMessage, {}, mockSendResponse, browser, mockStore);
      expect(mockSendResponse).toHaveBeenCalledWith({ state: expect.any(Object) });
    });

    test('should handle dispatch actions', async () => {
      const mockMessage = {
        action: 'DISPATCH_ACTION',
        payload: { type: 'TEST_ACTION', data: 'test' }
      };
      const mockSendResponse = jest.fn();

      await handleMessage(mockMessage, {}, mockSendResponse, browser, mockStore);
      expect(mockStore.dispatch).toHaveBeenCalledWith(mockMessage.payload);
      expect(mockSendResponse).toHaveBeenCalledWith({ success: true });
    });

    test('should handle unknown actions', async () => {
      const mockMessage = { action: 'UNKNOWN_ACTION' };
      const mockSendResponse = jest.fn();

      await handleMessage(mockMessage, {}, mockSendResponse, browser, mockStore);
      expect(mockSendResponse).toHaveBeenCalledWith({ error: 'Unknown action' });
      expect(console.warn).toHaveBeenCalledWith('Unknown action:', 'UNKNOWN_ACTION');
    });

    test('should handle message handler errors', async () => {
      const error = new Error('Handler error');
      mockStore.dispatch.mockImplementationOnce(() => {
        throw error;
      });

      const mockMessage = {
        action: 'DISPATCH_ACTION',
        payload: { type: 'TEST_ACTION' }
      };
      const mockSendResponse = jest.fn();

      await handleMessage(mockMessage, {}, mockSendResponse, browser, mockStore);
      expect(mockSendResponse).toHaveBeenCalledWith({ error: error.message });
      expect(console.error).toHaveBeenCalledWith('Error handling message:', error);
    });
  });

  describe('Message Queue Management', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(async () => {
      await _cleanup(); // Now _cleanup is properly imported
      jest.useRealTimers();
    });

    test('should maintain message queue size limit', async () => {
      const sendMessageFn = jest.fn();
      initializeConnection(sendMessageFn);

      // Simulate disconnection
      const disconnectHandler = mockPort.onDisconnect.addListener.mock.calls[0][0];
      disconnectHandler();

      // Fill queue beyond limit
      for (let i = 0; i <= MAX_QUEUE_SIZE + 1; i++) {
        sendMessage({ action: 'test', id: i });
      }

      expect(console.warn).toHaveBeenCalledWith('Message queue full, dropping oldest message');
    });

    test('should flush queue on reconnection', async () => {
      const sendMessageFn = jest.fn();
      initializeConnection(sendMessageFn);
      
      // Simulate disconnection and queue messages
      mockPort.onDisconnect.addListener.mock.calls[0][0]();
      await sendMessage({ action: 'test1' });
      await sendMessage({ action: 'test2' });

      // Create second port for reconnection
      const secondMockPort = {
        onMessage: { 
          addListener: jest.fn(),
          removeListener: jest.fn(), // Add removeListener
        },
        onDisconnect: { 
          addListener: jest.fn(),
          removeListener: jest.fn(), // Add removeListener
        },
        postMessage: jest.fn(),
        name: 'content-connection'
      };
      
      browser.runtime.connect.mockReturnValue(secondMockPort);
      
      // Advance timers and process microtasks
      jest.advanceTimersByTime(RETRY_DELAY);
      await Promise.resolve();

      

      // Simulate connection acknowledgment
      const messageHandler = secondMockPort.onMessage.addListener.mock.calls[0][0];
      await messageHandler({ type: 'CONNECTION_ACK' });
      
      // Verify message processing
      expect(secondMockPort.postMessage).toHaveBeenCalledTimes(2);
      expect(secondMockPort.postMessage).toHaveBeenNthCalledWith(1, { action: 'test1' });
      expect(secondMockPort.postMessage).toHaveBeenNthCalledWith(2, { action: 'test2' });
    }, 10000); // Reduced timeout
  });

  describe('Performance Tests', () => {
    test('should handle rapid message dispatching', async () => {
      const messages = Array.from({ length: 100 }, (_, i) => ({
        action: 'DISPATCH_ACTION',
        payload: { type: 'TEST_ACTION', id: i }
      }));

      const startTime = performance.now();
      await Promise.all(messages.map(msg => 
        handleMessage(msg, {}, jest.fn(), browser, mockStore)
      ));
      const endTime = performance.now();

      expect(endTime - startTime).toBeLessThan(1000); // Should complete within 1s
      expect(mockStore.dispatch).toHaveBeenCalledTimes(100);
    });
  });
});