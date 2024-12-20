import { jest } from '@jest/globals';
import { connection } from '../../../utils/connectionManager';
import { logger } from '../../../utils/logger';
import { 
  MESSAGE_TYPES, 
  ERROR_CATEGORIES,
  CONFIG 
} from '../../../utils/constants';

// Mock stateManager
jest.mock('../../../utils/stateManager', () => ({
  stateManager: {
    updateState: jest.fn(),
    getState: jest.fn(),
    subscribe: jest.fn(),
    unsubscribe: jest.fn()
  }
}));

// Mock logger
jest.mock('../../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    logPerformance: jest.fn()
  }
}));

// Mock Ajv
jest.mock('ajv', () => {
  return jest.fn().mockImplementation(() => ({
    compile: jest.fn().mockReturnValue(() => true), // Adjust the return value as needed
  }));
});

describe('Connection Manager Unit Tests', () => {
  let originalNavigator;
  let originalStorage;
  let originalCrypto;

  beforeEach(() => {
    jest.resetAllMocks();
    jest.clearAllMocks();
    
    // Add reset for nextConnectionId
    if (connection.nextConnectionId) {
      connection.nextConnectionId = 1;
    }

    // Store originals
    originalNavigator = global.navigator;
    originalStorage = global.storage;
    originalCrypto = global.crypto;

    // Mock storage estimate
    const mockEstimate = jest.fn().mockResolvedValue({
      quota: 100 * 1024 * 1024,
      usage: 10 * 1024 * 1024,
      available: 90 * 1024 * 1024
    });

    // Mock navigator with storage
    Object.defineProperty(global, 'navigator', {
      value: {
        storage: {
          estimate: mockEstimate
        }
      },
      configurable: true,
      writable: true
    });

    // Mock storage globally
    Object.defineProperty(global, 'storage', {
      value: {
        estimate: mockEstimate
      },
      configurable: true,
      writable: true
    });

    // Mock crypto
    Object.defineProperty(global, 'crypto', {
      value: {
        randomUUID: jest.fn(() => '123e4567-e89b-12d3-a456-426614174000'),
        subtle: {},
        getRandomValues: jest.fn(arr => arr)
      },
      configurable: true,
      writable: true
    });

    // Mock browser port
    const mockPort = {
      onMessage: { 
        addListener: jest.fn(cb => cb({ type: 'CONNECTION_ACK' }))
      },
      onDisconnect: { addListener: jest.fn() },
      postMessage: jest.fn(),
      disconnect: jest.fn()
    };

    global.browser.runtime.connect.mockReset();
    global.browser.runtime.connect.mockReturnValue(mockPort);

    // Reset connection state
    connection.connectionMetrics = {
      successful: 0,
      failed: 0,
      activeConnections: new Map(),
      latencyHistory: new Map()
    };
    connection.connections = new Map();
  });

  afterEach(() => {
    // Restore originals
    Object.defineProperty(global, 'navigator', {
      value: originalNavigator,
      configurable: true,
      writable: true
    });
    Object.defineProperty(global, 'storage', {
      value: originalStorage,
      configurable: true,
      writable: true
    });
    Object.defineProperty(global, 'crypto', {
      value: originalCrypto,
      configurable: true,
      writable: true
    });
  });

  describe('validateMessage', () => {
    test('should validate correct message format', async () => {
      const validMessage = {
        type: MESSAGE_TYPES.TEST_MESSAGE,
        payload: { data: 'test' }
      };
      
      const result = await connection.validateMessage(validMessage);
      expect(result).toBe(true);
    });

    test('should reject invalid message format', async () => {
      const invalidMessage = { type: MESSAGE_TYPES.TEST_MESSAGE }; // Missing payload
      await expect(connection.validateMessage(invalidMessage))
        .rejects
        .toThrow('payload is a required field');
    });
  });

  describe('connection lifecycle', () => {
    test('should manage connection states correctly', async () => {
      const mockPort = {
        onMessage: { 
          addListener: jest.fn(cb => cb({ type: 'CONNECTION_ACK' }))
        },
        onDisconnect: { addListener: jest.fn() },
        postMessage: jest.fn(),
        disconnect: jest.fn()
      };

      global.browser.runtime.connect.mockReturnValue(mockPort);

      const connectionId = await connection.connect();
      expect(typeof connectionId).toBe('string');
      expect(connection.connectionMetrics.successful).toBe(1);
      
      // Set up the connection in the map for disconnect
      connection.connections.set(connectionId, mockPort);
      
      await connection.disconnect(connectionId);
      expect(mockPort.disconnect).toHaveBeenCalled();
      expect(connection.connectionMetrics.activeConnections.size).toBe(0);
    });
  });

  test('should handle connection errors gracefully', async () => {
    // Mock connection failure
    global.browser.runtime.connect.mockImplementation(() => {
      throw new Error('Connection failed');
    });

    await expect(async () => {
      try {
        await connection.connect();
      } catch (error) {
        expect(error.message).toBe('Connection failed');
        expect(connection.connectionMetrics.failed).toBe(1);
        expect(logger.error).toHaveBeenCalled();
        throw error;
      }
    }).rejects.toThrow('Connection failed');
  });

  describe('handlePort', () => {
    test('should assign unique connection IDs', () => {
      const mockPort1 = {
        onMessage: { addListener: jest.fn() },
        onDisconnect: { addListener: jest.fn() },
        postMessage: jest.fn()
      };
      
      const mockPort2 = {
        onMessage: { addListener: jest.fn() },
        onDisconnect: { addListener: jest.fn() },
        postMessage: jest.fn()
      };

      const connId1 = connection.handlePort(mockPort1);
      const connId2 = connection.handlePort(mockPort2);

      expect(connId1).toBeDefined();
      expect(connId2).toBeDefined();
      expect(connId1).not.toEqual(connId2);
      expect(connection.connections.get(connId1)).toBe(mockPort1);
      expect(connection.connections.get(connId2)).toBe(mockPort2);
    });
  });

  describe('message handling', () => {
    test('handleMessage does not throw if no callback is registered', async () => {
      const message = { 
        type: MESSAGE_TYPES.TEST_MESSAGE, 
        payload: { data: 'test' } 
      };

      const mockPort = {
        onMessage: { addListener: jest.fn() },
        onDisconnect: { addListener: jest.fn() },
        postMessage: jest.fn()
      };

      const expectedResult = {
        success: true,
        data: message.payload
      };

      // Set up handler BEFORE establishing connection
      connection._messageHandlers[MESSAGE_TYPES.TEST_MESSAGE] = jest.fn().mockResolvedValue(expectedResult);

      // Establish connection and set up the port
      const connectionId = '123e4567-e89b-12d3-a456-426614174000';
      connection.connectionMetrics.activeConnections.set(connectionId, {
        port: mockPort,
        established: Date.now(),
        messageCount: 0,
        lastActivity: Date.now()
      });
      connection.connections.set(connectionId, mockPort);

      // Call handleMessage and verify response
      const result = await connection.handleMessage(message, mockPort);
      expect(result).toEqual(expectedResult);

      // Verify handler was called with correct payload
      expect(connection._messageHandlers[MESSAGE_TYPES.TEST_MESSAGE])
        .toHaveBeenCalledWith(message.payload, mockPort);

      // Clean up
      connection.connectionMetrics.activeConnections.delete(connectionId);
      connection.connections.delete(connectionId);
    });

    test('should route messages to registered callback', async () => {
      const mockCallback = jest.fn();
      const message = { 
        type: MESSAGE_TYPES.TEST_MESSAGE, 
        payload: { data: 'test' } 
      };

      const mockPort = {
        onMessage: { addListener: jest.fn() },
        onDisconnect: { addListener: jest.fn() },
        postMessage: jest.fn()
      };

      // Set up the connection with the port
      const connId = connection.handlePort(mockPort);
      
      // Register callback for this connection
      connection.onMessage(connId, mockCallback);

      // Mock _findConnectionIdByPort to return our connId
      jest.spyOn(connection, '_findConnectionIdByPort').mockReturnValue(connId);

      // Wait for handleMessage to complete
      await connection.handleMessage(message, mockPort);

      // Verify callback was called with correct message
      expect(mockCallback).toHaveBeenCalledWith(message);
    });

    test('should batch process messages correctly', async () => {
      const messages = [
        { type: MESSAGE_TYPES.TEST_MESSAGE, payload: { id: 1 } },
        { type: MESSAGE_TYPES.TEST_MESSAGE, payload: { id: 2 } }
      ];

      // Mock sendMessage to return success response
      const mockSendMessage = jest.spyOn(connection, 'sendMessage')
        .mockResolvedValue({ success: true });

      const results = await connection.processBatchMessages(messages, {
        batchSize: 1,
        onProgress: jest.fn()
      });

      expect(results).toHaveLength(2);
      expect(results[0].success).toBe(true);
      expect(mockSendMessage).toHaveBeenCalledTimes(2);

      mockSendMessage.mockRestore();
    }, 10000);

    test('should handle message validation failures', async () => {
      const invalidMessage = {};
      
      await expect(connection.validateMessage(invalidMessage))
        .rejects
        .toThrow(/type is a required field/);
    });
  });

  describe('initialization and configuration', () => {
    test('should initialize with default configuration', async () => {
      await connection.initialize();
      expect(connection.dynamicConfig.size).toBeGreaterThan(0);
      expect(connection.storageQuota).toBeDefined();
    });

    test('should update dynamic configuration', async () => {
      const newTimeout = 10000;
      await connection.updateConfig('TIMEOUTS', { CONNECTION: newTimeout });
      expect(connection.getConfig('TIMEOUTS').CONNECTION).toBe(newTimeout);
    });
  });

  describe('performance monitoring', () => {
    test('should track performance metrics', async () => {
      const testOperation = async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
        return true;
      };

      await connection._trackPerformance(testOperation, 'TEST_OPERATION');
      
      const metrics = connection.metrics.performance.get('TEST_OPERATION');
      expect(metrics).toBeDefined();
      expect(metrics.count).toBe(1);
      expect(metrics.totalDuration).toBeGreaterThan(0);
    });
  });

  describe('error handling', () => {
    test('should categorize and log errors appropriately', () => {
      const error = new Error('storage quota exceeded');
      const errorLog = connection._logError(error, {
        severity: ERROR_CATEGORIES.SEVERITY.HIGH,
        context: 'test'
      });

      expect(errorLog.category).toBe(ERROR_CATEGORIES.CRITICAL.STORAGE);
      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe('state synchronization', () => {
    test('should track unsynced changes', async () => {
      const changes = { test: 'data' };
      await connection._storeUnsyncedChanges(changes);
      
      expect(connection.unsyncedChanges.size).toBe(1);
      const [firstChange] = connection.unsyncedChanges.values();
      expect(firstChange.changes).toEqual(changes);
    });
  });

  describe('shutdown and recovery', () => {
    test('should perform graceful shutdown', async () => {
      // Setup active connections
      const connectionId = await connection.connect();
      
      await connection.shutdown();
      
      expect(connection.isShuttingDown).toBe(true);
      expect(connection.connections.size).toBe(0);
    });

    test('should recover from previous crash state', async () => {
      const mockShutdownState = {
        timestamp: Date.now(),
        connections: [],
        metrics: {
          performance: [['TEST', { count: 1 }]],
          errors: []
        },
        dynamicConfig: [['TEST_CONFIG', { value: true }]]
      };

      global.browser.storage.local.get.mockResolvedValueOnce({
        shutdown_state: mockShutdownState
      });

      await connection.recoverFromCrash();
      
      expect(connection.dynamicConfig.get('TEST_CONFIG')).toEqual({ value: true });
    });
  });
});
