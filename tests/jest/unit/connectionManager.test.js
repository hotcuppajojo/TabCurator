import browser from 'webextension-polyfill';
import connectionManager from '../../../utils/connectionManager.js';
import stateManager from '../../../utils/stateManager.js';
import { MESSAGE_TYPES, ACTION, CONNECTION_STATES } from '../../../utils/core/index.js';
import { logger } from '../../../utils/logger.js';

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

jest.mock('../../../utils/stateManager.js', () => ({
  dispatch: jest.fn(),
  handleTabAction: jest.fn(),
  handleSessionAction: jest.fn(),
  handleTagAction: jest.fn(),
  handleBackgroundMessage: jest.fn(),
  validateStateUpdate: jest.fn(),
  initialized: true,
  store: { dispatch: jest.fn() }
}));

jest.mock('../../../utils/logger.js', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn()
}));

describe('ConnectionManager', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    connectionManager._resetForTest();
  });

  describe('Initialization', () => {
    test('initialize should set up the connection manager', async () => {
      await connectionManager.initialize();
      
      expect(connectionManager.initialized).toBe(true);
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('ConnectionManager initialized'));
    });

    test('initialize should handle errors gracefully', async () => {
      browser.runtime.connect.mockImplementationOnce(() => {
        throw new Error('Connection error');
      });
      
      await expect(connectionManager.initialize()).rejects.toThrow('Connection error');
      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Failed to initialize'), expect.any(Object));
    });

    test('initialize should only initialize once', async () => {
      await connectionManager.initialize();
      await connectionManager.initialize();
      
      expect(browser.runtime.connect).toHaveBeenCalledTimes(1);
    });
  });

  describe('Connection Management', () => {
    beforeEach(async () => {
      await connectionManager.initialize();
    });

    test('connect should create a port connection', () => {
      const connection = connectionManager.connect();
      
      expect(connection).toBeTruthy();
      expect(browser.runtime.connect).toHaveBeenCalled();
    });

    test('connect should handle errors', () => {
      browser.runtime.connect.mockImplementationOnce(() => {
        throw new Error('Connection failed');
      });
      
      expect(() => connectionManager.connect()).toThrow('Connection failed');
    });

    test('disconnect should clean up connection', () => {
      const connection = connectionManager.connect();
      connectionManager.disconnect(connection.connectionId);
      
      // Verify connection was removed from internal tracking
      expect(connectionManager.getConnection(connection.connectionId)).toBeUndefined();
    });
  });

  describe('Message Handling', () => {
    beforeEach(async () => {
      await connectionManager.initialize();
    });

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

    test('sendMessage should handle errors from message handlers', async () => {
      stateManager.handleTabAction.mockRejectedValueOnce(new Error('Handler error'));
      
      await expect(connectionManager.sendMessage({
        type: MESSAGE_TYPES.TAB_ACTION,
        action: ACTION.TAB.GET,
        payload: { tabId: 123 }
      })).rejects.toThrow('Handler error');
      
      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Error handling message'), expect.any(Object));
    });

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
      await connectionManager.initialize();
    });

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
    test('should handle connection errors gracefully', async () => {
      browser.runtime.connect.mockImplementationOnce(() => {
        throw new Error('Connection error');
      });
      
      await expect(connectionManager.initialize()).rejects.toThrow('Connection error');
      expect(logger.error).toHaveBeenCalled();
    });
    
    test('should handle message routing errors', async () => {
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
      await connectionManager.initialize();
    });

    test('cleanup should remove all connections and listeners', async () => {
      const connection = connectionManager.connect();
      
      await connectionManager.cleanup();
      
      expect(connection.port.onMessage.removeListener).toHaveBeenCalled();
      expect(connection.port.onDisconnect.removeListener).toHaveBeenCalled();
      expect(browser.runtime.onMessage.removeListener).toHaveBeenCalled();
    });
  });

  describe('Separation of Concerns', () => {
    beforeEach(async () => {
      await connectionManager.initialize();
    });

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

    test('ConnectionManager delegates state updates to StateManager', async () => {
      await connectionManager.sendMessage({
        type: MESSAGE_TYPES.STATE_UPDATE,
        payload: { settings: { maxTabs: 20 } }
      });
      
      expect(stateManager.validateStateUpdate).toHaveBeenCalledWith({ settings: { maxTabs: 20 } });
    });
  });
});