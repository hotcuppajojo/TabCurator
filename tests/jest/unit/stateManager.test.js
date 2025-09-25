import { jest } from '@jest/globals';
import stateManager from '../../../utils/stateManager.js';
import {
  ACTION,
  STATE,
  MESSAGE_TYPES,
  ValidationError,
  VALIDATION_ERRORS,
  TELEMETRY_EVENTS
} from '../../../utils/core/index.js';
import { TabManager } from '../../../utils/tabManager.js';
import browser from 'webextension-polyfill';

// Mock dependencies
jest.mock('../../../utils/tabManager.js', () => ({
  __esModule: true,
  TabManager: jest.fn().mockImplementation(() => ({
    initialize: jest.fn().mockResolvedValue(true),
    getTab: jest.fn().mockImplementation((tabId) => ({
      id: tabId,
      url: 'https://example.com',
      title: 'Test Tab'
    })),
    createTab: jest.fn().mockImplementation((props) => ({ id: 123, ...props })),
    updateTab: jest.fn().mockImplementation((tabId, props) => ({ id: tabId, ...props })),
    removeTab: jest.fn(),
    discardTab: jest.fn().mockImplementation((tabId) => ({ success: true, tabId })),
    tagTab: jest.fn().mockImplementation((tabId, tag) => `[${tag}] Test Tab`),
    tagTabAndBookmark: jest.fn(),
    getOldestTab: jest.fn().mockResolvedValue({ id: 1, lastAccessed: 1000 }),
    suspendInactiveTabs: jest.fn().mockResolvedValue({
      success: true,
      suspendedCount: 2,
      results: [{ success: true, tabId: 1 }, { success: true, tabId: 2 }]
    })
  })),
  tabManager: {
    initialize: jest.fn().mockResolvedValue(true)
  }
}));

// Mock the core module imports to avoid missing functions
jest.mock('../../../utils/core/bookmark.js', () => ({
  __esModule: true,
  initializeBookmarkFolder: jest.fn().mockResolvedValue('folder123'),
  getOrCreateBookmarkFolder: jest.fn().mockResolvedValue('folder123'),
  addBookmark: jest.fn().mockResolvedValue({ id: 'bm123' }),
  searchBookmarks: jest.fn().mockResolvedValue([]),
  removeBookmark: jest.fn().mockResolvedValue()
}));

jest.mock('../../../utils/core/connection.js', () => ({
  __esModule: true,
  connectToBackground: jest.fn().mockReturnValue({ 
    onMessage: { addListener: jest.fn() },
    onDisconnect: { addListener: jest.fn() },
    postMessage: jest.fn()
  }),
  sendMessageToBackground: jest.fn().mockResolvedValue({ success: true }),
  listenForMessages: jest.fn(),
  validateMessage: jest.fn().mockReturnValue(true),
  CONNECTION_STATES: { ERROR: 'CONNECTION_ERROR' }
}));

jest.mock('webextension-polyfill', () => ({
  __esModule: true,
  default: {
    tabs: {
      query: jest.fn(() => Promise.resolve([])),
      get: jest.fn(id => Promise.resolve({ id, url: 'https://example.com', title: 'Example Tab' })),
      update: jest.fn((id, props) => Promise.resolve({ id, ...props })),
      remove: jest.fn(() => Promise.resolve()),
      discard: jest.fn(() => Promise.resolve()),
      create: jest.fn(props => Promise.resolve({ id: 123, ...props }))
    },
    bookmarks: {
      search: jest.fn(() => Promise.resolve([])),
      create: jest.fn(bookmark => Promise.resolve({ id: 'bm123', ...bookmark })),
      remove: jest.fn(() => Promise.resolve())
    },
    permissions: {
      contains: jest.fn(() => Promise.resolve(true)),
      request: jest.fn(() => Promise.resolve(true))
    }
  }
}));

jest.mock('../../../utils/core/telemetry.js', () => ({
  __esModule: true,
  recordTelemetry: jest.fn(),
  recordPerformance: jest.fn(),
  TELEMETRY_EVENTS: {
    EXTENSION_INSTALLED: 'EXTENSION_INSTALLED',
    TAB_ACTION: 'TAB_ACTION',
    SESSION_SAVED: 'SESSION_SAVED',
    ERROR: 'ERROR'
  }
}));

describe('StateManager', () => {
	let tabManagerMock;

	beforeEach(() => {
		jest.clearAllMocks();
		tabManagerMock = new TabManager();
		// Reset stateManager between tests
		stateManager.initialized = false;
		stateManager.store = {
			dispatch: jest.fn(),
			getState: jest.fn().mockReturnValue({
				tabManagement: {
					tabs: [],
					activity: {},
					oldestTab: null,
					metadata: {}
				},
				sessions: [],
				settings: {
					maxTabs: 30,
					requireTagOnClose: true
				}
			})
		};
		stateManager.tabManager = null;
	});
	
	describe('Initialization', () => {
		test('should initialize with valid tabManager', async () => {
			const result = await stateManager.initialize(tabManagerMock);
			
			expect(result).toBe(true);
			expect(stateManager.initialized).toBe(true);
			expect(stateManager.tabManager).toBe(tabManagerMock);
			expect(stateManager.store).toBeDefined();
		});
		
		test('should reject initialization without tabManager', async () => {
			await expect(stateManager.initialize()).rejects.toThrow('Valid StateManager instance required');
			expect(stateManager.initialized).toBe(false);
		});
		
		test('should initialize store', async () => {
			const originalStore = stateManager.store;
			stateManager.store = null;
			
			const result = await stateManager.initializeStore();
			
			expect(result).toBeDefined();
			expect(stateManager.store).toBeDefined();
			
			// Restore for other tests
			stateManager.store = originalStore;
		});
		
		test('should check storage permissions on init', async () => {
			await stateManager.initialize(tabManagerMock);
			
			expect(browser.permissions.contains).toHaveBeenCalledWith({ permissions: ['storage'] });
			expect(browser.permissions.contains).toHaveBeenCalledWith({ permissions: ['tabs'] });
		});
	});
	
	describe('State Access', () => {
		beforeEach(async () => {
			await stateManager.initialize(tabManagerMock);
		});
		
		test('getState returns current state', () => {
			const state = stateManager.getState();
			
			expect(state).toBeDefined();
			expect(state).toHaveProperty('tabManagement');
			expect(state).toHaveProperty('settings');
			expect(state).toHaveProperty('sessions');
		});
		
		test('dispatch forwards action to store', () => {
			const action = { type: 'TEST_ACTION', payload: { test: true } };
			
			stateManager.dispatch(action);
			
			expect(stateManager.store.dispatch).toHaveBeenCalledWith(action);
		});
	});
	
	describe('Message Handling', () => {
		beforeEach(async () => {
			await stateManager.initialize(tabManagerMock);
		});
		
		test('handleBackgroundMessage processes STATE_SYNC', async () => {
			jest.spyOn(stateManager, 'syncWithServiceWorker').mockResolvedValue({ success: true });
			
			const message = { type: MESSAGE_TYPES.STATE_SYNC };
			const result = await stateManager.handleBackgroundMessage(message);
			
			expect(stateManager.syncWithServiceWorker).toHaveBeenCalled();
			expect(result).toEqual({ success: true });
		});
		
		test('handleBackgroundMessage processes STATE_UPDATE', async () => {
			jest.spyOn(stateManager, 'validateStateUpdate').mockResolvedValue({ valid: true });
			
			const message = { 
				type: MESSAGE_TYPES.STATE_UPDATE, 
				payload: { tabManagement: { tabs: [] } } 
			};
			const result = await stateManager.handleBackgroundMessage(message);
			
			expect(stateManager.validateStateUpdate).toHaveBeenCalledWith(message.payload);
			expect(result).toEqual({ valid: true });
		});
		
		test('handleBackgroundMessage handles errors', async () => {
			// Clear any previous calls to dispatch so assertions target only error recovery
			stateManager.store.dispatch.mockClear();

			jest.spyOn(stateManager, 'syncWithServiceWorker')
				.mockRejectedValue(new Error('Sync error'));

			const message = { type: MESSAGE_TYPES.STATE_SYNC };

			await expect(stateManager.handleBackgroundMessage(message))
				.rejects.toThrow('Sync error');

			// Check that the error recovery action was dispatched
			expect(stateManager.store.dispatch).toHaveBeenCalledWith(expect.objectContaining({
				type: ACTION.STATE.RECOVER,
				payload: expect.objectContaining({
					type: STATE.APP.ERROR
				})
			}));
		});
	});
	
	describe('Tab Action Handling', () => {
		beforeEach(async () => {
			await stateManager.initialize(tabManagerMock);
		});
		
		test('handleTabAction delegates to tabManager', async () => {
			const message = {
				action: 'createTab',
				payload: { url: 'https://example.com' }
			};
			
			const result = await stateManager.handleTabAction(message);
			
			expect(tabManagerMock.createTab).toHaveBeenCalledWith(message.payload);
			expect(result).toEqual({ id: 123, url: 'https://example.com' });
		});
		
		test('handleTabAction handles special case TAG_AND_CLOSE', async () => {
			const message = {
				action: ACTION.TAB.TAG_AND_CLOSE,
				payload: { tabId: 1, tag: 'test-tag' }
			};
			
			tabManagerMock.getTab.mockResolvedValueOnce({ id: 1, url: 'https://example.com', title: 'Test Tab' });
			
			const result = await stateManager.handleTabAction(message);
			
			expect(tabManagerMock.getTab).toHaveBeenCalledWith(1);
			expect(tabManagerMock.tagTabAndBookmark).toHaveBeenCalledWith(1, 'test-tag');
			expect(result).toEqual({ success: true, message: expect.any(String) });
		});
		
		test('handleTabAction handles special case SUSPEND_INACTIVE', async () => {
			const message = {
				action: ACTION.TAB.SUSPEND_INACTIVE,
				payload: {}
			};
			
			const result = await stateManager.handleTabAction(message);
			
			expect(tabManagerMock.suspendInactiveTabs).toHaveBeenCalled();
			expect(result).toEqual({
				success: true,
				suspendedCount: 2,
				results: expect.any(Array)
			});
		});
		
		test('handleTabAction handles special case GET_OLDEST', async () => {
			const message = {
				action: ACTION.TAB.GET_OLDEST,
				payload: {}
			};
			
			const result = await stateManager.handleTabAction(message);
			
			expect(tabManagerMock.getOldestTab).toHaveBeenCalled();
			expect(result).toEqual({ id: 1, lastAccessed: 1000 });
		});
		
		test('handleTabAction handles errors', async () => {
			tabManagerMock.createTab.mockRejectedValueOnce(new Error('Tab creation error'));
			
			const message = {
				action: 'createTab',
				payload: { url: 'https://example.com' }
			};
			
			const result = await stateManager.handleTabAction(message);
			
			expect(result).toEqual({ error: 'Tab creation error' });
		});
	});
	
	describe('Session Action Handling', () => {
		beforeEach(async () => {
			await stateManager.initialize(tabManagerMock);
		});
		
		test('handleSessionAction saves session', async () => {
			const message = {
				action: ACTION.SESSION.SAVE,
				payload: {
					name: 'Test Session',
					tabs: [{ id: 1, url: 'https://example.com', title: 'Example' }],
					timestamp: 1234567890
				}
			};
			
			const result = await stateManager.handleSessionAction(message);
			
			expect(stateManager.store.dispatch).toHaveBeenCalled();
			expect(result).toEqual({ success: true, message: expect.any(String) });
		});
		
		test('handleSessionAction validates permissions', async () => {
			browser.permissions.contains.mockResolvedValueOnce(false);
			
			const message = {
				action: ACTION.SESSION.SAVE,
				payload: {
					name: 'Test Session',
					tabs: []
				}
			};
			
			await stateManager.handleSessionAction(message);
			
			expect(browser.permissions.contains).toHaveBeenCalledWith({ permissions: ['storage'] });
			expect(browser.permissions.request).toHaveBeenCalledWith({ permissions: ['storage'] });
		});
		
		test('handleSessionAction handles errors', async () => {
			jest.spyOn(stateManager.store, 'dispatch').mockImplementationOnce(() => {
				throw new Error('Session save error');
			});
			
			const message = {
				action: ACTION.SESSION.SAVE,
				payload: { name: 'Test Session', tabs: [] }
			};
			
			const result = await stateManager.handleSessionAction(message);
			
			expect(result).toEqual({ error: 'Session save error' });
		});
		
		test('handleSessionAction handles unknown actions', async () => {
			const message = {
				action: 'UNKNOWN_ACTION',
				payload: {}
			};
			
			const result = await stateManager.handleSessionAction(message);
			
			expect(result).toEqual({ error: 'Unknown session action' });
		});
	});
	
	// Ensure tabManagerMock exists in nested describes that call initialize
	describe('State Sync and Validation', () => {
		beforeEach(async () => {
			if (!tabManagerMock) tabManagerMock = new TabManager();
			await stateManager.initialize(tabManagerMock);
		});
		
		test('syncWithServiceWorker syncs state', async () => {
			const { recordTelemetry } = require('../../../utils/core/telemetry.js');
			
			await stateManager.syncWithServiceWorker();
			
			expect(recordTelemetry).toHaveBeenCalledWith(
				TELEMETRY_EVENTS.PERFORMANCE, 
				expect.objectContaining({ operation: 'STATE_SYNC' })
			);
			
			expect(browser.permissions.contains).toHaveBeenCalledWith({ permissions: ['storage'] });
		});
		
		test('validateStateUpdate validates payload', async () => {
			// Test with truly invalid payload that should fail validation
			const payload = null; // This will definitely fail validation
			
			await expect(stateManager.validateStateUpdate(payload)).rejects.toThrow(ValidationError);
		});
	});
	
	// Selectors
	describe('Selectors', () => {
		beforeEach(async () => {
			if (!tabManagerMock) tabManagerMock = new TabManager();
			await stateManager.initialize(tabManagerMock);
		});
		
		test('getSettings uses selectSettings selector', () => {
			const settings = stateManager.getSettings();
			
			expect(settings).toEqual({
				maxTabs: 30,
				requireTagOnClose: true
			});
		});
		
		test('getSessions uses selectSessions selector', () => {
			stateManager.store.getState.mockReturnValueOnce({
				sessions: ['session1', 'session2']
			});
			
			const sessions = stateManager.getSessions();
			
			expect(sessions).toEqual(['session1', 'session2']);
		});
		
		test('getTabActivity uses selectTabActivity selector', () => {
			stateManager.store.getState.mockReturnValueOnce({
				tabManagement: {
					activity: {
						1: { lastAccessed: 1000 }
					}
				}
			});
			
			const activity = stateManager.getTabActivity(1);
			
			expect(activity).toEqual({ lastAccessed: 1000 });
		});
		
		test('getOldestTab uses selectOldestTab selector', () => {
			stateManager.store.getState.mockReturnValueOnce({
				tabManagement: {
					oldestTab: { id: 2, lastAccessed: 500 }
				}
			});
			
			const oldestTab = stateManager.getOldestTab();
			
			expect(oldestTab).toEqual({ id: 2, lastAccessed: 500 });
		});
	});
    
    test('getSettings uses selectSettings selector', () => {
      const settings = stateManager.getSettings();
      
      expect(settings).toEqual({
        maxTabs: 30,
        requireTagOnClose: true
      });
    });
    
    test('getSessions uses selectSessions selector', () => {
      stateManager.store.getState.mockReturnValueOnce({
        sessions: ['session1', 'session2']
      });
      
      const sessions = stateManager.getSessions();
      
      expect(sessions).toEqual(['session1', 'session2']);
    });
    
    test('getTabActivity uses selectTabActivity selector', () => {
      stateManager.store.getState.mockReturnValueOnce({
        tabManagement: {
          activity: {
            1: { lastAccessed: 1000 }
          }
        }
      });
      
      const activity = stateManager.getTabActivity(1);
      
      expect(activity).toEqual({ lastAccessed: 1000 });
    });
    
    test('getOldestTab uses selectOldestTab selector', () => {
      stateManager.store.getState.mockReturnValueOnce({
        tabManagement: {
          oldestTab: { id: 2, lastAccessed: 500 }
        }
      });
      
      const oldestTab = stateManager.getOldestTab();
      
      expect(oldestTab).toEqual({ id: 2, lastAccessed: 500 });
    });
  });
