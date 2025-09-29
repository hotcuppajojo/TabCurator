// tests/jest/tabManager.test.js
/**
 * @description TabManager unit tests. These tests document why TabManager delegates
 * responsibilities to StateManager and browser APIs rather than restating implementation
 * details. The goal is to lock down delegation, validation, and recovery contracts so
 * refactors that change responsibilities fail loudly
 */

import { jest } from '@jest/globals';
import { tabManager, TabManager } from '../../utils/tabManager.js';
import { ValidationError, APIError, TabLimitExceededError } from '../../utils/core/error.js';
import { STATE } from '../../utils/core/state.js';

// Mock dependencies
/**
 * @description Provide a minimal StateManager mock to keep TabManager initialization
 * deterministic and to focus tests on TabManager behaviour rather than state plumbing
 */
jest.mock('../../utils/stateManager', () => {
  const mockDispatch = jest.fn();
  const mockGetState = jest.fn(() => ({
    tabManagement: {
      tabs: [],
      activity: {},
      oldestTab: null,
      metadata: {}
    },
    settings: {
      maxTabs: 100,
      requireTagOnClose: true
    }
  }));
  
  return {
    __esModule: true,
    default: {
      dispatch: mockDispatch,
      getState: mockGetState,
      initialized: true,
      store: {},
      actions: {
        tabManagement: {
          updateTab: jest.fn(payload => ({ type: 'tabManagement/updateTab', payload })),
          removeTab: jest.fn(id => ({ type: 'tabManagement/removeTab', payload: id })),
          updateMetadata: jest.fn(payload => ({ type: 'tabManagement/updateMetadata', payload })),
          updateOldestTab: jest.fn(tab => ({ type: 'tabManagement/updateOldestTab', payload: tab }))
        },
        archivedTabs: {
          archiveTab: jest.fn(payload => ({ type: 'archivedTabs/archiveTab', payload }))
        }
      },
      selectors: {
        selectTabActivity: jest.fn(state => state.tabManagement.activity),
        selectSettings: jest.fn(state => state.settings)
      }
    }
  };
});

/**
 * @description Mock the browser surface to make tab operations deterministic in tests
 * This allows us to verify how TabManager reacts to success and failure responses
 * without relying on a real browser environment
 */
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

/**
 * @description Logger is mocked so tests can assert that important lifecycle events
 * and error paths emit diagnostics without printing to CI logs
 */
jest.mock('../../utils/logger', () => ({
  __esModule: true,
  logger: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  }
}));

/**
 * @description Bookmark helpers are mocked to verify coordination between tagging
 * and bookmarking logic while avoiding real bookmarks creation in the test env
 */
jest.mock('../../utils/core/bookmark.js', () => ({
  __esModule: true,
  getOrCreateBookmarkFolder: jest.fn(() => Promise.resolve('folder123')),
  addBookmark: jest.fn(bookmark => Promise.resolve({ id: 'bm123', ...bookmark })),
  removeBookmark: jest.fn(() => Promise.resolve()),
  searchBookmarks: jest.fn(() => Promise.resolve([])),
  initializeBookmarkFolder: jest.fn(() => Promise.resolve('folder123'))
}));

/**
 * @description Telemetry is mocked to confirm that TabManager emits telemetry
 * events for key operations without depending on telemetry backend availability
 */
jest.mock('../../utils/core/telemetry.js', () => ({
  __esModule: true,
  recordTelemetry: jest.fn(),
  recordPerformance: jest.fn(),
  TELEMETRY_EVENTS: {
    TAB_CREATED: 'TAB_CREATED',
    TAB_REMOVED: 'TAB_REMOVED',
    TAB_SUSPENDED: 'TAB_SUSPENDED',
    TAB_TAGGED: 'TAB_TAGGED',
    ERROR: 'ERROR'
  }
}));

// Import browser, logger and dependencies after mocks are set up
import browser from 'webextension-polyfill';
import { logger } from '../../utils/logger.js';
import stateManager from '../../utils/stateManager.js';
import { recordTelemetry, recordPerformance, TELEMETRY_EVENTS } from '../../utils/core/telemetry.js';
import { getOrCreateBookmarkFolder, addBookmark, removeBookmark, searchBookmarks } from '../../utils/core/bookmark.js';

describe('TabManager', () => {
  /**
   * @description Top-level TabManager tests. These groupings focus on responsibilities
   * such as initialization, tab lifecycle operations, tagging, and enforcement logic
   * so that behavioural contracts remain explicit and testable
   */
  let manager;
  
  beforeEach(() => {
    jest.clearAllMocks();
    manager = new TabManager();

    // Ensure critical browser API mocks exist for every test run
    // (some individual tests override behavior; keep defaults here)
    if (!browser.tabs.remove) browser.tabs.remove = jest.fn().mockResolvedValue(undefined);
    if (!browser.tabs.discard) browser.tabs.discard = jest.fn().mockResolvedValue(undefined);
    if (!browser.tabs.create) browser.tabs.create = jest.fn().mockResolvedValue({ id: 123 });
    if (!browser.tabs.update) browser.tabs.update = jest.fn().mockResolvedValue({ id: 1 });

    // Ensure bookmark helpers are defined (they are mocked above but be defensive)
    if (!getOrCreateBookmarkFolder) {
      getOrCreateBookmarkFolder.mockImplementation(() => Promise.resolve('folder123'));
    }
  });
  
  describe('Initialization', () => {
    /**
     * @description Initialization must attach a StateManager and set internal flags
     * so consumers can rely on manager.initialized instead of checking internals
     */
    test('should initialize with valid stateManager', async () => {
      await manager.initialize(stateManager);
      
      expect(manager.initialized).toBe(true);
      expect(manager.stateManager).toBe(stateManager);
      expect(logger.info).toHaveBeenCalledWith('Tab manager initialized', expect.any(Object));
    });
    
  /**
   * @description The manager requires a valid StateManager. This test ensures
   * a helpful error is thrown rather than undefined behaviour when dependency is missing
   */
  test('should throw error when initializing without stateManager', async () => {
      await expect(manager.initialize()).rejects.toThrow('Valid StateManager instance required');
    });
  });
  
  describe('Tab Operations', () => {
    beforeEach(async () => {
      await manager.initialize(stateManager);
    });
    /**
     * @description Core tab operations are delegated to the browser API. Tests check
     * that the manager forwards queries and returns the raw results for consumers
     */
    test('should query tabs', async () => {
      const mockTabs = [{ id: 1 }, { id: 2 }];
      browser.tabs.query.mockResolvedValueOnce(mockTabs);
      
      const result = await manager.queryTabs({ active: true });
      
      expect(browser.tabs.query).toHaveBeenCalledWith({ active: true });
      expect(result).toEqual(mockTabs);
    });
    
  /**
   * @description getTab validates arguments before calling the browser API so
   * invalid inputs fail fast and do not trigger expensive API calls
   */
  test('should get a tab by ID', async () => {
      const mockTab = { id: 42, url: 'https://test.com', title: 'Test Tab' };
      browser.tabs.get.mockResolvedValueOnce(mockTab);
      
      const result = await manager.getTab(42);
      
      expect(browser.tabs.get).toHaveBeenCalledWith(42);
      expect(result).toEqual(mockTab);
    });
    
  /**
   * @description Ensure argument validation prevents misuse of public APIs and
   * preserves internal invariants across callers
   */
  test('should throw validation error for invalid tab ID', async () => {
      await expect(manager.getTab('invalid-id')).rejects.toThrow(ValidationError);
    });
    
  /**
   * @description Browser API failures must be wrapped into APIError so callers
   * can distinguish network or platform errors from validation errors
   */
  test('should throw API error when browser.tabs.get fails', async () => {
      browser.tabs.get.mockRejectedValueOnce(new Error('API failure'));
      
      await expect(manager.getTab(1)).rejects.toThrow(APIError);
    });
    
  /**
   * @description Tab creation must emit telemetry and performance metrics so
   * product metrics remain accurate while the manager continues to return the tab
   */
  test('should create a new tab', async () => {
      const createProps = { url: 'https://example.com' };
      const mockTab = { id: 123, url: 'https://example.com' };
      browser.tabs.create.mockResolvedValueOnce(mockTab);
      
      const result = await manager.createTab(createProps);
      
      expect(browser.tabs.create).toHaveBeenCalledWith(createProps);
      expect(result).toEqual(mockTab);
      expect(recordTelemetry).toHaveBeenCalledWith(
        TELEMETRY_EVENTS.TAB_CREATED, 
        expect.objectContaining({ tabId: 123 })
      );
      expect(recordPerformance).toHaveBeenCalled();
    });
    
  /**
   * @description Updates must dispatch state changes after successful browser API calls
   * so UI and reducers stay in sync with the actual tab state reported by the browser
   */
  test('should update a tab', async () => {
      const updateProps = { title: 'Updated Title' };
      const mockTab = { id: 1, title: 'Updated Title' };
      browser.tabs.update.mockResolvedValueOnce(mockTab);
      
      const result = await manager.updateTab(1, updateProps);
      
      expect(browser.tabs.update).toHaveBeenCalledWith(1, updateProps);
      expect(stateManager.dispatch).toHaveBeenCalled();
      expect(result).toEqual(mockTab);
    });
    
  /**
   * @description Remove operations must both call the browser API and notify state
   * so telemetry and UI can respond to destructive actions reliably
   */
  test('should remove a tab', async () => {
      await manager.removeTab(1);
      
      expect(browser.tabs.remove).toHaveBeenCalledWith(1);
      expect(recordTelemetry).toHaveBeenCalledWith(
        TELEMETRY_EVENTS.TAB_REMOVED, 
        expect.objectContaining({ tabId: 1 })
      );
      expect(stateManager.dispatch).toHaveBeenCalled();
    });
    
  /**
   * @description Discarding is conditional. Validate the manager checks tab attributes
   * and only calls discard when appropriate to avoid disrupting active user sessions
   */
  test('should discard a tab', async () => {
      // Provide a full tab object (including url) so validateTab() passes
      const mockTab = { id: 1, url: 'https://example.com', active: false, pinned: false, audible: false, discarded: false };
      browser.tabs.get.mockResolvedValueOnce(mockTab);
      
      const result = await manager.discardTab(1);
      
      expect(browser.tabs.get).toHaveBeenCalledWith(1);
      expect(browser.tabs.discard).toHaveBeenCalledWith(1);
      expect(stateManager.dispatch).toHaveBeenCalled();
      expect(result).toEqual({ success: true, tabId: 1 });
    });
    
  /**
   * @description Guard rails prevent discarding tabs that are active or important
   * This reduces user disruption and improves the reliability of automatic suspension
   */
  test('should not discard active, pinned, or audible tabs', async () => {
      // Include url to satisfy validateTab
      const mockTab = { id: 1, url: 'https://example.com', active: true, pinned: false, audible: false, discarded: false };
      browser.tabs.get.mockResolvedValueOnce(mockTab);
      
      const result = await manager.discardTab(1);
      
      expect(browser.tabs.get).toHaveBeenCalledWith(1);
      expect(browser.tabs.discard).not.toHaveBeenCalled();
      expect(result).toEqual({ success: false, reason: 'Tab cannot be discarded' });
    });
  });
  
  describe('Tagging Operations', () => {
    beforeEach(async () => {
      await manager.initialize(stateManager);
    });
    /**
     * @description Tagging is a UX convenience that must update title and metadata
     * Tests ensure tagging writes state and emits telemetry while preserving tab shape
     */
    test('should tag a tab', async () => {
      const mockTab = { id: 1, title: 'Example Tab', url: 'https://example.com' };
      browser.tabs.get.mockResolvedValueOnce(mockTab);
      browser.tabs.update.mockResolvedValueOnce({ id: 1, title: '[test-tag] Example Tab' });
      
      const result = await manager.tagTab(1, 'test-tag');
      
      expect(browser.tabs.get).toHaveBeenCalledWith(1);
      expect(browser.tabs.update).toHaveBeenCalledWith(1, { title: '[test-tag] Example Tab' });
      expect(stateManager.dispatch).toHaveBeenCalledWith(expect.objectContaining({
        payload: expect.objectContaining({
          tabId: 1,
          metadata: expect.objectContaining({
            tags: ['test-tag']
          })
        })
      }));
      expect(recordTelemetry).toHaveBeenCalledWith(
        TELEMETRY_EVENTS.TAB_TAGGED,
        expect.objectContaining({ tabId: 1, tag: 'test-tag' })
      );
      expect(result).toBe('[test-tag] Example Tab');
    });
    
  /**
   * @description Tagging combined with bookmarking and removal is an atomic flow
   * The manager must coordinate across bookmark helpers and tab removal to avoid
   * leaving inconsistent state when one step fails
   */
  test('should tag, bookmark and remove a tab', async () => {
      const mockTab = { id: 1, title: 'Example Tab', url: 'https://example.com' };
      browser.tabs.get.mockResolvedValueOnce(mockTab);
      browser.tabs.update.mockResolvedValueOnce({ id: 1, title: '[test-tag] Example Tab' });
      getOrCreateBookmarkFolder.mockResolvedValueOnce('folder123');
      searchBookmarks.mockResolvedValueOnce([]);
      
      await manager.tagTabAndBookmark(1, 'test-tag');
      
      expect(browser.tabs.get).toHaveBeenCalledWith(1);
      expect(browser.tabs.update).toHaveBeenCalledWith(1, { title: '[test-tag] Example Tab' });
      expect(getOrCreateBookmarkFolder).toHaveBeenCalled();
      expect(searchBookmarks).toHaveBeenCalledWith({ url: 'https://example.com' });
      expect(addBookmark).toHaveBeenCalledWith({
        parentId: 'folder123',
        title: '[test-tag] Example Tab',
        url: 'https://example.com'
      });
      expect(browser.tabs.remove).toHaveBeenCalledWith(1);
      expect(stateManager.dispatch).toHaveBeenCalled();
      expect(recordTelemetry).toHaveBeenCalledWith(
        TELEMETRY_EVENTS.TAB_TAGGED,
        expect.objectContaining({ 
          tabId: 1, 
          tag: 'test-tag',
          bookmarked: true
        })
      );
    });
    
  /**
   * @description Tag names are validated to avoid unsafe titles and to keep tagging
   * machine-friendly for downstream tooling such as exports and searches
   */
  test('should throw validation error for invalid tag', async () => {
      await expect(manager.tagTab(1, 'invalid tag with spaces!')).rejects.toThrow();
    });
  });
  
  describe('Tab Management', () => {
    beforeEach(async () => {
      await manager.initialize(stateManager);
    });
    /**
     * @description Tab management operations like finding the oldest tab are used
     * by eviction policies. Tests ensure selection logic remains deterministic
     */
    test('should find oldest tab', async () => {
      const tabs = [
        { id: 1, lastAccessed: 1000 },
        { id: 2, lastAccessed: 500 },  // oldest
        { id: 3, lastAccessed: 1500 }
      ];
      
      browser.tabs.query.mockResolvedValueOnce(tabs);
      stateManager.getState.mockReturnValueOnce({
        tabManagement: {
          tabs: [],
          activity: {
            1: { lastAccessed: 1000 },
            2: { lastAccessed: 500 },
            3: { lastAccessed: 1500 }
          }
        }
      });
      
      const result = await manager.getOldestTab();
      
      expect(browser.tabs.query).toHaveBeenCalled();
      expect(result).toEqual(tabs[1]); // tab with id 2 is oldest
    });
    
  /**
   * @description Suspensions coordinate bookmarking, removal and telemetry. Tests
   * verify the count and results are reported so UI and metrics remain accurate
   */
  test('should suspend inactive tabs', async () => {
      const inactiveTabs = [
        { id: 1, active: false, pinned: false, title: 'Tab 1', url: 'https://example1.com' },
        { id: 2, active: false, pinned: false, title: 'Tab 2', url: 'https://example2.com' }
      ];
      
      browser.tabs.query.mockResolvedValueOnce(inactiveTabs);
      getOrCreateBookmarkFolder.mockResolvedValueOnce('folder123');
      
      const result = await manager.suspendInactiveTabs();
      
      expect(browser.tabs.query).toHaveBeenCalled();
      expect(addBookmark).toHaveBeenCalledTimes(2);
      expect(browser.tabs.remove).toHaveBeenCalledTimes(2);
      expect(stateManager.dispatch).toHaveBeenCalledTimes(2);
      expect(recordTelemetry).toHaveBeenCalledWith(
        TELEMETRY_EVENTS.TAB_SUSPENDED,
        expect.objectContaining({ count: 2 })
      );
      expect(result).toEqual({
        success: true,
        suspendedCount: 2,
        results: expect.any(Array)
      });
    });
    
  /**
   * @description EnforceTabLimits protects users from exceeding configured limits
   * Tests assert that when limits are exceeded the manager surfaces a specific error
   */
  test('should enforce tab limits', async () => {
      const tabs = [
        { id: 1, lastAccessed: 1000 },
        { id: 2, lastAccessed: 500 }, // oldest
        { id: 3, lastAccessed: 1500 }
      ];
      
      browser.tabs.query.mockResolvedValueOnce(tabs);
      stateManager.getState.mockReturnValueOnce({
        tabManagement: {
          tabs: [],
          activity: {
            1: { lastAccessed: 1000 },
            2: { lastAccessed: 500 },
            3: { lastAccessed: 1500 }
          }
        },
        settings: {
          maxTabs: 2 // Over the limit
        }
      });
      stateManager.selectors.selectSettings.mockReturnValueOnce({ maxTabs: 2 });
      
      await expect(manager.enforceTabLimits()).rejects.toThrow(TabLimitExceededError);
    });
    
  /**
   * @description Bookmark cleanup must discover and remove matching bookmarks so
   * session deletions do not leave orphaned bookmarks behind
   */
  test('should remove bookmarks for a tab URL', async () => {
      const bookmarks = [
        { id: 'bm1', url: 'https://example.com' },
        { id: 'bm2', url: 'https://example.com' }
      ];
      
      searchBookmarks.mockResolvedValueOnce(bookmarks);
      
      await manager.removeBookmarkForTab('https://example.com');
      
      expect(searchBookmarks).toHaveBeenCalledWith({ url: 'https://example.com' });
      expect(removeBookmark).toHaveBeenCalledTimes(2);
      expect(removeBookmark).toHaveBeenNthCalledWith(1, 'bm1');
      expect(removeBookmark).toHaveBeenNthCalledWith(2, 'bm2');
    });
  });
});
