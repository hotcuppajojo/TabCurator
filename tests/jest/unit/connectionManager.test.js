import { jest } from '@jest/globals';
import { connection } from '../../../utils/connectionManager';
import { logger } from '../../../utils/logger';

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

describe('Connection Manager Unit Tests', () => {
  let originalNavigator;
  let originalStorage;
  let originalCrypto;

  beforeEach(() => {
    jest.clearAllMocks();
    
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
        type: 'TEST_ACTION',
        payload: { data: 'test' }
      };
      
      const result = await connection.validateMessage(validMessage)
        .catch(error => {
          console.error('Validation error:', error);
          throw error;
        });
      expect(result).toBe(true);
      expect(logger.logPerformance).toHaveBeenCalled();
    });

    test('should reject invalid message format', async () => {
      const invalidMessage = { type: 'TEST_ACTION' }; // Missing payload
      await expect(async () => {
        try {
          await connection.validateMessage(invalidMessage);
        } catch (error) {
          expect(logger.error).toHaveBeenCalled();
          throw error;
        }
      }).rejects.toThrow(/Message validation failed/);
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
      expect(connectionId).toBe('123e4567-e89b-12d3-a456-426614174000');
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
});
