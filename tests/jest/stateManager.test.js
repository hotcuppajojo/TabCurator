// tests/jest/stateManager.test.js

const browser = require('webextension-polyfill');
const { 
  store, 
  initializeStateFromStorage, 
  updateRulesHandler,
  saveSessionHandler,
  restoreSessionHandler,
  getSessions,
  deleteSessionHandler,
  getIsTaggingPromptActive, 
  getArchivedTabs, 
  getTabActivity, 
  getActionHistory, 
  getSavedSessions, 
  setIsTaggingPromptActive, 
  updateTabActivity, 
  archiveTab, 
  undoLastAction 
} = require('../../src/utils/stateManager.js');
const { createBulkTabs, createComplexTabs } = require('./utils/testUtils');
const { handleMessage, initializeConnection, sendMessage } = require('../../src/utils/messagingUtils.js');

describe("State Manager", () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    store.dispatch({ type: 'RESET_STATE' });

    // Setup default mock responses
    browser.storage.sync.get.mockResolvedValue({ archivedTabs: {} });
    
    // Initialize state
    await initializeStateFromStorage();
  });

  test("should initialize with default state", () => {
    const state = store.getState();
    expect(state).toEqual({
      archivedTabs: {},
      tabActivity: {},
      actionHistory: [],
      savedSessions: {},
      isTaggingPromptActive: false,
    });
  });

  test("should handle SET_TAGGING_PROMPT_ACTIVE action", () => {
    store.dispatch({ type: 'SET_TAGGING_PROMPT_ACTIVE', value: true });
    expect(store.getState().isTaggingPromptActive).toBe(true);

    store.dispatch({ type: 'SET_TAGGING_PROMPT_ACTIVE', value: false });
    expect(store.getState().isTaggingPromptActive).toBe(false);
  });

  test("should handle UPDATE_TAB_ACTIVITY action", () => {
    const timestamp = Date.now();
    const tabId = 1;
    store.dispatch({ type: 'UPDATE_TAB_ACTIVITY', tabId, timestamp });
    expect(store.getState().tabActivity[tabId]).toBe(timestamp);

    // Test multiple updates
    const newTimestamp = timestamp + 1000;
    store.dispatch({ type: 'UPDATE_TAB_ACTIVITY', tabId: 1, timestamp: newTimestamp });
    expect(store.getState().tabActivity[1]).toBe(newTimestamp);
  });

  test("should handle ARCHIVE_TAB action", () => {
    const tabData = { title: 'Test Tab', url: 'https://example.com' };
    store.dispatch({ type: 'ARCHIVE_TAB', tag: 'Work', tabData });
    
    const state = store.getState();
    expect(state.archivedTabs['Work']).toContainEqual(tabData);
    expect(state.actionHistory).toHaveLength(1);
    expect(state.actionHistory[0]).toEqual({
      type: 'archive',
      tab: tabData,
      tag: 'Work'
    });

    // Test multiple tabs under same tag
    const tabData2 = { title: 'Test Tab 2', url: 'https://example2.com' };
    store.dispatch({ type: 'ARCHIVE_TAB', tag: 'Work', tabData: tabData2 });
    expect(store.getState().archivedTabs['Work']).toHaveLength(2);
  });

  test("should handle UNDO_LAST_ACTION action", () => {
    const tabData = { title: 'Stored Tab', url: 'https://stored.com' };
    store.dispatch({ type: 'ARCHIVE_TAB', tag: 'Work', tabData });
    undoLastAction(); 

    const state = store.getState();
    expect(state.archivedTabs['Work']).toEqual([]);
    expect(state.actionHistory).toHaveLength(0);
  });

  test("should handle multiple UNDO_LAST_ACTION actions", () => {
    const tabData1 = { title: 'Stored Tab', url: 'https://stored.com' };
    const tabData2 = { title: 'Test Tab 1', url: 'https://example1.com' };
    const tabData3 = { title: 'Test Tab 2', url: 'https://example2.com' };
    
    store.dispatch({ type: 'ARCHIVE_TAB', tag: 'Work', tabData: tabData2 });
    store.dispatch({ type: 'ARCHIVE_TAB', tag: 'Work', tabData: tabData3 });
    
    undoLastAction(); 
    
    let state = store.getState();
    expect(state.archivedTabs['Work']).toContainEqual(tabData2);
    expect(state.archivedTabs['Work']).not.toContainEqual(tabData3);
    expect(state.actionHistory).toHaveLength(1);
    
    undoLastAction(); 
    
    state = store.getState();
    expect(state.archivedTabs['Work']).toEqual([]);
    expect(state.actionHistory).toHaveLength(0);
  });

  test("should handle subscribers", () => {
    const mockListener = jest.fn();
    const unsubscribe = store.subscribe(mockListener);

    store.dispatch({ type: 'SET_TAGGING_PROMPT_ACTIVE', value: true });
    expect(mockListener).toHaveBeenCalled();

    unsubscribe();
    store.dispatch({ type: 'SET_TAGGING_PROMPT_ACTIVE', value: false });
    expect(mockListener).toHaveBeenCalledTimes(1);
  });

  test("should ignore unknown action types", () => {
    const initialState = store.getState();
    // Use test_ prefix to avoid warning
    store.dispatch({ type: 'test_UNKNOWN_ACTION' });
    expect(store.getState()).toEqual(initialState);
  });

  test("should handle invalid inputs gracefully", () => {
    expect(() => setIsTaggingPromptActive(null)).toThrow('Value must be a boolean');
    expect(() => setIsTaggingPromptActive('true')).toThrow('Value must be a boolean');
    expect(() => updateTabActivity(null, Date.now())).toThrow('Tab ID must be a valid number');
    expect(() => updateTabActivity(1, null)).toThrow('Timestamp must be a valid number');
    expect(() => archiveTab(null, 'Work', {})).toThrow('Tab ID must be a valid number');
    expect(() => archiveTab(1, '', {})).toThrow('Tag must be a non-empty string');
    expect(() => archiveTab(1, 'Work', null)).toThrow('Tab data must be a valid object');
  });

  test("should handle race conditions in asynchronous workflows", async () => {
    const timestamp = Date.now();
    const tabData = { title: 'Test Tab', url: 'https://example.com' };
    const promise1 = updateTabActivity(1, timestamp);
    const promise2 = archiveTab(1, 'Work', tabData);
    await Promise.all([promise1, promise2]);
    expect(getTabActivity()[1]).toBe(timestamp);
    expect(getArchivedTabs()['Work']).toContainEqual(tabData);
  });

  describe("Utility Functions", () => {
    test("getters should return correct state slices", () => {
      const tabData = { title: 'Test Tab', url: 'https://example.com' };
      store.dispatch({ type: 'ARCHIVE_TAB', tag: 'Work', tabData });
      store.dispatch({ type: 'SET_TAGGING_PROMPT_ACTIVE', value: true });
      
      expect(getIsTaggingPromptActive()).toBe(true);
      expect(getArchivedTabs()).toEqual({ 'Work': [tabData] });
      expect(getTabActivity()).toEqual({});
      expect(getActionHistory()).toHaveLength(1);
      expect(getSavedSessions()).toEqual({});
    });

    test("setters should update state correctly", () => {
      setIsTaggingPromptActive(true);
      expect(getIsTaggingPromptActive()).toBe(true);

      const timestamp = Date.now();
      updateTabActivity(1, timestamp);
      expect(getTabActivity()[1]).toBe(timestamp);

      const tabData = { title: 'Test', url: 'https://test.com' };
      archiveTab(1, 'Work', tabData);
      expect(getArchivedTabs()['Work']).toContainEqual(tabData);
    });
  });

  describe("Storage Integration", () => {
    test("should initialize state from storage", async () => {
      browser.storage.sync.get.mockResolvedValueOnce({
        archivedTabs: { Work: [{ title: 'Stored Tab', url: 'https://stored.com' }] }
      });

      // Re-initialize state to apply the new mock data
      await initializeStateFromStorage();

      // Verify the state was updated correctly
      expect(getArchivedTabs()).toEqual({
        Work: [{ title: 'Stored Tab', url: 'https://stored.com' }]
      });
    });

    test("should handle storage initialization errors", async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      // Mock the storage get method to reject with an error
      browser.storage.sync.get.mockRejectedValueOnce(new Error('Storage error'));

      // Initialize state from storage, which should handle the error internally
      await initializeStateFromStorage();

      // Verify that the error was logged
      expect(consoleSpy).toHaveBeenCalledWith(
        'Error initializing state from storage:',
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });
  });

  describe("Multiple Subscribers", () => {
    test("should notify all subscribers of state changes", () => {
      const listener1 = jest.fn();
      const listener2 = jest.fn();
      
      store.subscribe(listener1);
      store.subscribe(listener2);
      
      store.dispatch({ type: 'SET_TAGGING_PROMPT_ACTIVE', value: true });
      
      expect(listener1).toHaveBeenCalledTimes(1);
      expect(listener2).toHaveBeenCalledTimes(1);
    });
  });

  describe("Integration Tests", () => {
    test("should integrate state updates correctly", async () => {
      const tabData = { title: 'Stored Tab', url: 'https://stored.com' };
      store.dispatch({ type: 'ARCHIVE_TAB', tag: 'Work', tabData });
      expect(getArchivedTabs()['Work']).toContainEqual(tabData);
      undoLastAction();
      expect(getArchivedTabs()['Work']).toEqual([]);
    });
  });

  describe('Performance Tests', () => {
    test('should handle large state updates efficiently', () => {
      const bulkTabs = createBulkTabs(1000);
      const startTime = performance.now();
      
      bulkTabs.forEach(tab => {
        store.dispatch({ 
          type: 'ARCHIVE_TAB', 
          tag: 'BulkTest', 
          tabData: tab 
        });
      });
      
      const endTime = performance.now();
      expect(endTime - startTime).toBeLessThan(1000); // Should complete within 1s
      expect(getArchivedTabs()['BulkTest']).toHaveLength(1000);
    });
  });

  describe('Complex State Interactions', () => {
    test('should handle concurrent state updates', async () => {
      const updates = Array.from({ length: 100 }, (_, i) => 
        new Promise(resolve => {
          store.dispatch({ 
            type: 'UPDATE_TAB_ACTIVITY', 
            tabId: i, 
            timestamp: Date.now() 
          });
          resolve();
        })
      );

      await Promise.all(updates);
      expect(Object.keys(getTabActivity())).toHaveLength(100);
    });
  });

  test("should initialize with predefined archivedTabs", async () => {
    browser.storage.sync.get.mockResolvedValueOnce({
      archivedTabs: { Work: [{ title: 'Predefined Tab', url: 'https://predefined.com' }] }
    });

    // Re-initialize state to apply the new mock
    await initializeStateFromStorage();

    const state = store.getState();
    expect(state.archivedTabs).toEqual({
      Work: [{ title: 'Predefined Tab', url: 'https://predefined.com' }]    });
  });

  describe('Session Management', () => {
    test('should save session', async () => {
      browser.tabs.query.mockResolvedValue([
        { title: 'Test Tab', url: 'https://example.com' }
      ]);

      await saveSessionHandler('test-session', browser);
      
      expect(store.getState().savedSessions['test-session']).toBeDefined();
      expect(browser.storage.sync.set).toHaveBeenCalled();
    });

    // ...add more session tests...
  });

  describe("Messaging Integration", () => {
    beforeEach(() => {
      browser.runtime.connect = jest.fn().mockReturnValue({
        onMessage: { addListener: jest.fn() },
        onDisconnect: { addListener: jest.fn() },
        postMessage: jest.fn()
      });
    });

    test('should initialize messaging connection', () => {
      initializeConnection(jest.fn());
      expect(browser.runtime.connect).toHaveBeenCalledWith({ name: 'content-connection' });
    });

    test('should handle state-related messages correctly', async () => {
      const mockStore = { getState: jest.fn(), dispatch: jest.fn() };
      const mockMessage = { action: 'getState' };
      const mockSendResponse = jest.fn();

      await handleMessage(mockMessage, {}, mockSendResponse, browser, mockStore);
      expect(mockSendResponse).toHaveBeenCalled();
      expect(mockStore.getState).toHaveBeenCalled();
    });

    test('should handle dispatch actions', async () => {
      const mockMessage = { 
        action: 'DISPATCH_ACTION',
        payload: { type: 'SET_TAGGING_PROMPT_ACTIVE', value: true }
      };
      const mockSendResponse = jest.fn();

      await handleMessage(mockMessage, {}, mockSendResponse, browser, store);
      expect(store.getState().isTaggingPromptActive).toBe(true);
      expect(mockSendResponse).toHaveBeenCalledWith({ success: true });
    });
  });
});