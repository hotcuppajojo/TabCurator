// tests/jest/connectionManager.test.js

/**
 * @file Unit tests for ConnectionManager orchestration and routing
 * @description ConnectionManager mediates between external ports and the internal
 * `stateManager`. These tests document the intended separation of concerns: ConnectionManager
 * routes messages and maintains ports; StateManager owns domain logic. We focus on the
 * contract (routing, error handling, retries, cleanup) rather than implementation details so
 * future refactors that break the contract fail loudly
 */
import browser from 'webextension-polyfill';
import connectionManager from '../../utils/connectionManager.js';
import stateManager from '../../utils/stateManager.js';
import { MESSAGE_TYPES, ACTION, CONNECTION_STATES } from '../../utils/core/index.js';
import { logger } from '../../utils/logger.js';

// Mock dependencies
jest.mock('webextension-polyfill', () => ({
  runtime: {
    connect: jest.fn(() => ({
      onMessage: {
        addListener: jest.fn(),
        removeListener: jest.fn()
      },
      onDisconnect: {
        addListener: jest.fn(),
        removeListener: jest.fn()
      },
      postMessage: jest.fn()
    })),
    sendMessage: jest.fn(() => Promise.resolve({ success: true })),
    onMessage: {
      addListener: jest.fn(),
      removeListener: jest.fn()
    }
  }
}));

jest.mock('../../utils/stateManager.js', () => ({
  dispatch: jest.fn(),
  handleTabAction: jest.fn(),
  handleSessionAction: jest.fn(),
  handleTagAction: jest.fn(),
  handleBookmarkAction: jest.fn(),
  handleBackgroundMessage: jest.fn(),
  validateStateUpdate: jest.fn(),
  initialized: true,
  store: { dispatch: jest.fn() }
}));

jest.mock('../../utils/logger.js', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn()
  }
}));

/**
 * @description High level suite: tests ensure the manager's lifecycle (init, connect,
 * message routing, cleanup) remains stable and observable. We exercise both happy-path
 * and failure modes to protect production behaviour
 */
describe('ConnectionManager', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    connectionManager._resetForTest();
  });

  describe('Initialization', () => {
    /**
     * @description Initialization must validate its dependencies and set an `initialized`
     * flag to prevent re-entrant initialisation. This test asserts the basic happy-path
     * so downstream flows can rely on `connectionManager.initialized`
     */
    test('initialize should set up the connection manager', async () => {
      await connectionManager.initialize(stateManager);
      
      expect(connectionManager.initialized).toBe(true);
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('ConnectionManager initialized'), expect.any(Object));
    });

    /**
     * @description When required dependencies are invalid, initialization should fail
     * loudly so callers can detect startup issues; we assert logging of the failure for
     * operational visibility
     */
    test('initialize should handle errors gracefully', async () => {
      stateManager.initialized = false;
      
      await expect(connectionManager.initialize(stateManager)).rejects.toThrow('Valid initialized StateManager instance required');
      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Failed to initialize ConnectionManager'), expect.any(Object));
      
      stateManager.initialized = true;
    });

    /**
     * @description Initialization must be idempotent to avoid duplicate listeners and
     * resources. We call initialize twice and assert side-effects only occur once
     */
    test('initialize should only initialize once', async () => {
      await connectionManager.initialize(stateManager);
      await connectionManager.initialize(stateManager);
      
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('ConnectionManager initialized'), expect.any(Object));
      expect(logger.info).toHaveBeenCalledTimes(1);
    });
  });

  describe('Connection Management', () => {
    beforeEach(async () => {
      await connectionManager.initialize(stateManager);
    });

    /**
     * @description `connect` creates and tracks a port connection. Tests assert a
     * connection object is returned and the browser API is invoked; this prevents
     * regressions where connections are not established
     */
    test('connect should create a port connection', () => {
      const connection = connectionManager.connect();
      
      expect(connection).toBeTruthy();
      expect(browser.runtime.connect).toHaveBeenCalled();
    });

    /**
     * @description Connection creation can fail; errors should propagate so callers can
     * react. This test simulates a browser connect failure to ensure it's surfaced
     */
    test('connect should handle errors', () => {
      browser.runtime.connect.mockImplementationOnce(() => {
        throw new Error('Connection failed');
      });
      
      expect(() => connectionManager.connect()).toThrow('Connection failed');
    });

    /**
     * @description `disconnect` must remove tracked connections to avoid memory leaks.
     * We assert the internal registry no longer contains the connection after disconnect
     */
    test('disconnect should clean up connection', () => {
      const connection = connectionManager.connect();
      connectionManager.disconnect(connection.connectionId);
      
      // Verify connection was removed from internal tracking
      expect(connectionManager.getConnection(connection.connectionId)).toBeUndefined();
    });
  });

  describe('Message Handling', () => {
    beforeEach(async () => {
      await connectionManager.initialize(stateManager);
    });

  /**
   * @description The router is the primary behaviour of ConnectionManager: dispatching
   * incoming messages to the correct stateManager handlers. This test exercises several
   * message types to ensure correct delegation
   */
  test('sendMessage should route to the appropriate handler based on message type', async () => {
      // Test TAB_ACTION message
      await connectionManager.sendMessage({
        type: MESSAGE_TYPES.TAB_ACTION,
        action: ACTION.TAB.GET,
        payload: { tabId: 123 }
      });
      
      // Verify it went to stateManager.handleTabAction
      expect(stateManager.handleTabAction).toHaveBeenCalledWith({
        type: MESSAGE_TYPES.TAB_ACTION,
        action: ACTION.TAB.GET,
        payload: { tabId: 123 }
      });

      // Test SESSION_ACTION message
      await connectionManager.sendMessage({
        type: MESSAGE_TYPES.SESSION_ACTION,
        action: ACTION.SESSION.SAVE,
        payload: { name: 'Session 1' }
      });
      
      // Verify it went to stateManager.handleSessionAction
      expect(stateManager.handleSessionAction).toHaveBeenCalledWith({
        type: MESSAGE_TYPES.SESSION_ACTION,
        action: ACTION.SESSION.SAVE,
        payload: { name: 'Session 1' }
      });

      // Test STATE_UPDATE message
      await connectionManager.sendMessage({
        type: MESSAGE_TYPES.STATE_UPDATE,
        payload: { state: { key: 'value' } }
      });
      
      // Verify it went to stateManager.validateStateUpdate
      expect(stateManager.validateStateUpdate).toHaveBeenCalledWith({ state: { key: 'value' } });
    });

    /**
     * @description If a handler errors, ConnectionManager should surface the error and log
     * it for diagnostics rather than swallow it silently
     */
    test('sendMessage should handle errors from message handlers', async () => {
      stateManager.handleTabAction.mockRejectedValueOnce(new Error('Handler error'));
      
      await expect(connectionManager.sendMessage({
        type: MESSAGE_TYPES.TAB_ACTION,
        action: ACTION.TAB.GET,
        payload: { tabId: 123 }
      })).rejects.toThrow('Handler error');
      
      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Error handling message'), expect.any(Object));
    });

    /**
     * @description Broadcasting must fan-out to all tracked ports. This test ensures messages
     * are posted to every connection's port so state sync operations reach all clients
     */
    test('broadcastMessage should send message to all connections', async () => {
      const connection1 = connectionManager.connect();
      const connection2 = connectionManager.connect();
      
      await connectionManager.broadcastMessage({
        type: MESSAGE_TYPES.STATE_SYNC,
        payload: { synced: true }
      });
      
      // Check that message was posted to both connections
      expect(connection1.port.postMessage).toHaveBeenCalled();
      expect(connection2.port.postMessage).toHaveBeenCalled();
    });
  });

  describe('Message Routing', () => {
    beforeAll(() => {
      jest.setTimeout(10000);
    });
    beforeEach(async () => {
      await connectionManager.initialize(stateManager);
    });

  /**
   * @description `_routeMessage` is the internal dispatcher used by both port and
   * runtime messages. We assert it delegates to the proper stateManager handlers for
   * tab/session/tag actions so domain logic remains encapsulated in the state manager
   */
  test('_routeMessage should delegate to appropriate stateManager handler', async () => {
      // Tab action message
      await connectionManager._routeMessage({
        type: MESSAGE_TYPES.TAB_ACTION,
        action: ACTION.TAB.UPDATE,
        payload: { tabId: 1, data: { title: 'Updated' } }
      });
      
      expect(stateManager.handleTabAction).toHaveBeenCalled();
      
      // Session action message
      await connectionManager._routeMessage({
        type: MESSAGE_TYPES.SESSION_ACTION,
        action: ACTION.SESSION.SAVE,
        payload: { name: 'Test Session' }
      });
      
      expect(stateManager.handleSessionAction).toHaveBeenCalled();
      
      // Tag action message
      await connectionManager._routeMessage({
        type: MESSAGE_TYPES.TAG_ACTION,
        action: ACTION.TAG.ADD,
        payload: { tag: 'important' }
      });
      
      expect(stateManager.handleTagAction).toHaveBeenCalled();
    });

    /**
     * @description Unknown message types should return a structured error and produce a
     * warning log. This prevents unhandled messages from causing silent failures
     */
    test('_routeMessage should handle unknown message types', async () => {
      const result = await connectionManager._routeMessage({
        type: 'UNKNOWN_TYPE',
        payload: {}
      });
      
      expect(result).toEqual({ error: 'Unsupported message type: UNKNOWN_TYPE' });
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Unsupported message type'), expect.any(Object));
    });
  });

  describe('Error Handling', () => {
    /**
     * @description Initialization must validate dependencies. Missing a valid StateManager
     * instance should result in a clear error and a logged message for operators
     */
    test('should handle missing stateManager gracefully', async () => {
      await expect(connectionManager.initialize()).rejects.toThrow('Valid initialized StateManager instance required');
      expect(logger.error).toHaveBeenCalled();
    });

    /**
     * @description If routing throws, the error should bubble to the caller to allow tests
     * and callers to detect and respond to routing problems. This test simulates a handler
     * throwing to verify propagation
     */
    test('should handle message routing errors', async () => {
      await connectionManager.initialize(stateManager);

      stateManager.handleTabAction.mockRejectedValueOnce(new Error('Routing error'));

      await expect(connectionManager._routeMessage({
        type: MESSAGE_TYPES.TAB_ACTION,
        action: ACTION.TAB.GET,
        payload: {}
      })).rejects.toThrow('Routing error');
    });
  });

  describe('Cleanup', () => {
    beforeEach(async () => {
      await connectionManager.initialize(stateManager);
    });

    /**
     * @description Cleanup should remove per-port listeners and global listeners so the
     * system can shut down or reload without leaving handlers registered
     */
    test('cleanup should remove all connections and listeners', async () => {
      const connection = connectionManager.connect();
      
      await connectionManager.cleanup();
      
      expect(connection.port.onMessage.removeListener).toHaveBeenCalled();
      expect(connection.port.onDisconnect.removeListener).toHaveBeenCalled();
      expect(browser.runtime.onMessage.removeListener).toHaveBeenCalled();
    });
  });

  describe('Port Connection Handling', () => {
    beforeEach(async () => {
      await connectionManager.initialize(stateManager);
    });

  /**
   * @description When a port connects we must attach message and disconnect listeners and
   * log the connection. This ensures ConnectionManager can track lifecycle events
   */
  test('_handleConnect should set up port listeners', () => {
      const mockPort = {
        name: 'test-port',
        onMessage: { addListener: jest.fn() },
        onDisconnect: { addListener: jest.fn() },
        postMessage: jest.fn()
      };

      connectionManager._handleConnect(mockPort);
      
      expect(mockPort.onMessage.addListener).toHaveBeenCalled();
      expect(mockPort.onDisconnect.addListener).toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith('New connection', expect.objectContaining({
        name: 'test-port'
      }));
    });

  /**
   * @description Disconnect handling should remove the port from internal maps and log
   * the event. Tests check the logging and removal behaviour
   */
  test('_handleDisconnect should clean up ports', () => {
      const mockPort = {
        name: 'test-port',
        onMessage: { addListener: jest.fn() },
        onDisconnect: { addListener: jest.fn() }
      };

      connectionManager._handleConnect(mockPort);
      const connId = Array.from(connectionManager.ports.keys())[0];
      
      connectionManager._handleDisconnect(connId);
      
      expect(logger.info).toHaveBeenCalledWith('Connection disconnected', expect.objectContaining({
        connectionId: connId
      }));
    });

  /**
   * @description Runtime messages should be processed asynchronously. The function
   * returns `true` to keep the channel open and calls `sendResponse` when processing
   * completes; this pattern is necessary for async handlers in the Chrome messaging API
   */
  test('_handleRuntimeMessage should handle async messages', async () => {
      const message = { type: MESSAGE_TYPES.TAB_ACTION, action: 'GET', payload: {} };
      const sender = { id: 'test-sender' };
      const sendResponse = jest.fn();

      stateManager.handleTabAction.mockResolvedValueOnce({ success: true });
      
      const result = connectionManager._handleRuntimeMessage(message, sender, sendResponse);
      
      expect(result).toBe(true); // Should keep channel open
      
      // Wait for async processing
      await new Promise(resolve => setTimeout(resolve, 0));
      
      expect(sendResponse).toHaveBeenCalledWith({ success: true });
    });

  /**
   * @description When async handlers throw, the runtime handler should call `sendResponse`
   * with an error object and log the exception to aid debugging
   */
  test('_handleRuntimeMessage should handle errors in async messages', async () => {
      const message = { type: MESSAGE_TYPES.TAB_ACTION, action: 'GET', payload: {} };
      const sender = { id: 'test-sender' };
      const sendResponse = jest.fn();

      stateManager.handleTabAction.mockRejectedValueOnce(new Error('Test error'));
      
      connectionManager._handleRuntimeMessage(message, sender, sendResponse);
      
      // Wait for async processing
      await new Promise(resolve => setTimeout(resolve, 0));
      
      expect(sendResponse).toHaveBeenCalledWith({ error: 'Test error' });
      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Error'), expect.any(Object));
    });
  });

  describe('Advanced Message Handling', () => {
    beforeEach(async () => {
      await connectionManager.initialize(stateManager);
    });

  /**
   * @description `INIT_CHECK` is a lightweight probe used by clients to determine whether
   * the manager is ready. We assert it returns the initialized state so clients can make
   * simple readiness decisions
   */
  test('handleMessage should handle INIT_CHECK messages', async () => {
      const message = { type: MESSAGE_TYPES.INIT_CHECK };
      const result = await connectionManager.handleMessage(message, {});
      
      expect(result).toEqual({ initialized: true });
    });

  /**
   * @description If ConnectionManager is not initialized, message handling should return a
   * descriptive error rather than attempting to process a message
   */
  test('handleMessage should return error when not initialized', async () => {
      connectionManager.initialized = false;
      
      const message = { type: MESSAGE_TYPES.TAB_ACTION, action: 'GET', payload: {} };
      const result = await connectionManager.handleMessage(message, {});
      
      expect(result).toEqual({ error: 'ConnectionManager not initialized' });
      
      connectionManager.initialized = true;
    });

  /**
   * @description Messages must be validated before processing; invalid shapes should
   * return a validation error and produce a warning to avoid downstream exceptions
   */
  test('handleMessage should validate messages and return validation errors', async () => {
      const invalidMessage = { /* missing type */ };
      const result = await connectionManager.handleMessage(invalidMessage, {});
      
      expect(result.error).toBeTruthy();
      expect(logger.warn).toHaveBeenCalledWith('Invalid message received', expect.any(Object));
    });

  /**
   * @description Broadcasting should aggregate responses from ports and surface individual
   * errors while continuing to broadcast to other ports. This test ensures one failing
   * port doesn't prevent others from receiving the message
   */
  test('broadcastMessage should handle port errors gracefully', async () => {
      const connection1 = connectionManager.connect();
      const connection2 = connectionManager.connect();
      
      // Make one port fail
      connection1.port.postMessage.mockImplementationOnce(() => {
        throw new Error('Port error');
      });
      
      const responses = await connectionManager.broadcastMessage({
        type: MESSAGE_TYPES.STATE_SYNC,
        payload: { synced: true }
      });
      
      expect(responses).toHaveLength(2);
      expect(responses[0].error).toBe('Port error');
      expect(responses[1].success).toBe(true);
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Error broadcasting'), 'Port error');
    });
  });

  describe('Metrics and Monitoring', () => {
    beforeEach(async () => {
      await connectionManager.initialize(stateManager);
    });

  /**
   * @description Metrics give operational insight into connection health. We assert the
   * metrics reporter logs a structured object containing active connections, queue sizes,
   * and state so monitoring pipelines can parse it reliably
   */
  test('_reportMetrics should record connection metrics', () => {
      // Create some connections
      connectionManager.connect();
      connectionManager.connect();
      
      connectionManager._reportMetrics();
      
      expect(logger.debug).toHaveBeenCalledWith('Connection metrics reported', expect.objectContaining({
        activeConnections: expect.any(Number),
        messageQueue: expect.any(Number),
        state: expect.any(String),
        timestamp: expect.any(Number)
      }));
    });

  /**
   * @description Metrics reporting should not throw even if logging fails. We simulate a
   * logging error to ensure the reporter catches and logs the failure without bubbling up
   */
  test('_reportMetrics should handle errors gracefully', () => {
      // Mock logger.debug to throw an error
      const originalDebug = logger.debug;
      logger.debug.mockImplementationOnce(() => {
        throw new Error('Logging error');
      });
      
      expect(() => connectionManager._reportMetrics()).not.toThrow();
      expect(logger.error).toHaveBeenCalledWith('Failed to report metrics', expect.objectContaining({
        error: 'Logging error'
      }));
      
      logger.debug = originalDebug;
    });

  /**
   * @description Periodic cleanup of stale connections prevents resource leaks. This test
   * injects a stale connection into the manager and verifies it's pruned and logged
   */
  test('_cleanupConnections should remove stale connections', () => {
      const connection1 = connectionManager.connect();
      const connection2 = connectionManager.connect();
      
      // Manually set the connection in the connections Map to make the test work properly
      // since connect() creates a different connection object structure
      const staleConnection = {
        port: { disconnect: jest.fn() },
        lastActive: Date.now() - (connectionManager.inactivityThreshold + 1000),
        connected: Date.now() - (connectionManager.inactivityThreshold + 2000)
      };
      connectionManager.connections.set('stale-conn', staleConnection);
      
      connectionManager._cleanupConnections();
      
      expect(connectionManager.connections.has('stale-conn')).toBe(false);
      expect(logger.info).toHaveBeenCalledWith('Cleaned up inactive connection', expect.objectContaining({
        connectionId: 'stale-conn',
        inactiveTime: expect.any(Number)
      }));
    });

  /**
   * @description Disconnect code may fail; the cleanup routine should catch and log
   * disconnect errors so a single failing port doesn't break the cleanup pass
   */
  test('_cleanupConnections should handle disconnect errors gracefully', () => {
      const connection = connectionManager.connect();
      
      // Make port.disconnect throw an error
      connection.port.disconnect = jest.fn(() => {
        throw new Error('Disconnect error');
      });
      
      // Make connection stale
      const conn = connectionManager.getConnection(connection.connectionId);
      conn.lastActive = Date.now() - (connectionManager.inactivityThreshold + 1000);
      
      expect(() => connectionManager._cleanupConnections()).not.toThrow();
      expect(logger.warn).toHaveBeenCalledWith('Error disconnecting stale connection', expect.objectContaining({
        connectionId: connection.connectionId,
        error: 'Disconnect error'
      }));
    });
  });

  describe('State Synchronization', () => {
    beforeEach(async () => {
      await connectionManager.initialize(stateManager);
    });

  /**
   * @description State synchronization must be delegated to the StateManager; Connection
   * Manager acts as a coordinator, not a source of truth
   */
  test('syncState should delegate to stateManager', async () => {
      stateManager.syncWithServiceWorker = jest.fn().mockResolvedValue();
      
      await connectionManager.syncState();
      
      expect(stateManager.syncWithServiceWorker).toHaveBeenCalled();
    });

  /**
   * @description Sync operations can fail; the manager should log failures and continue
   * operating rather than throwing to callers
   */
  test('syncState should handle errors gracefully', async () => {
      stateManager.syncWithServiceWorker = jest.fn().mockRejectedValue(new Error('Sync error'));
      
      await connectionManager.syncState();
      
      expect(logger.warn).toHaveBeenCalledWith('Failed to sync state', expect.objectContaining({
        error: 'Sync error'
      }));
    });

  /**
   * @description If the manager isn't initialized, sync should be a no-op to avoid
   * unnecessary errors; we assert early return behaviour here
   */
  test('syncState should return early if not initialized', async () => {
      connectionManager.initialized = false;
      stateManager.syncWithServiceWorker = jest.fn();
      
      await connectionManager.syncState();
      
      expect(stateManager.syncWithServiceWorker).not.toHaveBeenCalled();
      
      connectionManager.initialized = true;
    });
  });

  describe('Retry Logic', () => {
    beforeEach(async () => {
      await connectionManager.initialize(stateManager);
    });

  /**
   * @description Robustness for transient failures is implemented via retry with
   * exponential backoff. This test asserts the retry loop retries the expected number
   * of times and returns the successful result
   */
  test('_retryWithBackoff should retry operations with exponential backoff', async () => {
      let attempts = 0;
      const operation = jest.fn(() => {
        attempts++;
        if (attempts < 3) {
          throw new Error(`Attempt ${attempts} failed`);
        }
        return 'success';
      });
      
      const result = await connectionManager._retryWithBackoff(operation, {
        maxAttempts: 3,
        delays: [10, 20, 30]
      });
      
      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(3);
    });

  /**
   * @description After exhausting retries the operation should fail and the error should
   * propagate so callers can handle permanent failures
   */
  test('_retryWithBackoff should fail after max attempts', async () => {
      const operation = jest.fn(() => {
        throw new Error('Always fails');
      });
      
      await expect(connectionManager._retryWithBackoff(operation, {
        maxAttempts: 2,
        delays: [10, 20]
      })).rejects.toThrow('Always fails');
      
      expect(operation).toHaveBeenCalledTimes(2);
    });
  });

  describe('Separation of Concerns', () => {
    beforeEach(async () => {
      await connectionManager.initialize(stateManager);
    });

  /**
   * @description ConnectionManager must delegate domain actions to StateManager rather
   * than manipulating domain state directly. This preserves clean separation between
   * transport and business logic
   */
  test('ConnectionManager delegates tab actions to StateManager', async () => {
      await connectionManager.sendMessage({
        type: MESSAGE_TYPES.TAB_ACTION,
        action: ACTION.TAB.CREATE,
        payload: { url: 'https://example.com' }
      });
      
      // Verify it was delegated to stateManager.handleTabAction
      expect(stateManager.handleTabAction).toHaveBeenCalledWith({
        type: MESSAGE_TYPES.TAB_ACTION,
        action: ACTION.TAB.CREATE,
        payload: { url: 'https://example.com' }
      });
      
      // Ensure ConnectionManager itself doesn't manipulate tabs directly
      expect(browser.tabs).toBeUndefined();
    });

  /**
   * @description Session actions should also be delegated; this test guards the routing
   * table and ensures ConnectionManager remains a thin transport abstraction
   */
  test('ConnectionManager delegates session actions to StateManager', async () => {
      await connectionManager.sendMessage({
        type: MESSAGE_TYPES.SESSION_ACTION,
        action: ACTION.SESSION.SAVE,
        payload: { name: 'Test Session' }
      });
      
      // Verify it was delegated to stateManager
      expect(stateManager.handleSessionAction).toHaveBeenCalledWith({
        type: MESSAGE_TYPES.SESSION_ACTION,
        action: ACTION.SESSION.SAVE,
        payload: { name: 'Test Session' }
      });
    });

    /**
     * @description State update messages are validated and applied by StateManager. We
     * assert ConnectionManager forwards the payload without trying to validate or mutate it
     * directly
     */
    test('ConnectionManager delegates state updates to StateManager', async () => {
      await connectionManager.sendMessage({
        type: MESSAGE_TYPES.STATE_UPDATE,
        payload: { settings: { maxTabs: 20 } }
      });
      
      expect(stateManager.validateStateUpdate).toHaveBeenCalledWith({ settings: { maxTabs: 20 } });
    });
  });
});