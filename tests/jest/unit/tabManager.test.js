import { jest } from '@jest/globals';
import { 
  createTab, 
  updateTab, 
  discardTab,
  validateTab,
  processTabBatch,
  TabManager,
  tagTabAndBookmark
} from '../../../utils/tabManager';
import stateManager from '../../../utils/stateManager';

// Mock modules with internal definitions
jest.mock('../../../utils/stateManager', () => {
  const getMockState = jest.fn(() => ({
    tabManagement: {
      tabs: [],
      activity: {},
      oldestTab: null
    },
    settings: {
      maxTabs: 100
    }
  }));

  const mockActions = {
    tabManagement: {
      updateTab: jest.fn(),
      removeTab: jest.fn(),
      updateMetadata: jest.fn((payload) => ({
        type: 'UPDATE_METADATA',
        payload // Return the payload as part of the action object
      })),
      updateOldestTab: jest.fn()
    },
    archivedTabs: {
      archiveTab: jest.fn()
    }
  };

  return {
    __esModule: true,
    default: {
      dispatch: jest.fn(),
      getState: getMockState,
      actions: mockActions
    }
  };
});

jest.mock('../../../utils/logger', () => ({
  __esModule: true,
  logger: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    critical: jest.fn(),
    logPerformance: jest.fn() // Add this line
  }
}));

jest.mock('webextension-polyfill', () => ({
  __esModule: true,
  default: {
    tabs: {
      get: jest.fn().mockResolvedValue({ id: 1, url: 'https://example.com', title: 'Test Tab' }),
      remove: jest.fn().mockResolvedValue(undefined),
      update: jest.fn().mockResolvedValue({ id: 1 }),
      query: jest.fn().mockResolvedValue([])
    },
    bookmarks: {
      search: jest.fn().mockResolvedValue([]),
      create: jest.fn()
    }
  }
}));

// Import browser and logger after mocks are set up
import browser from 'webextension-polyfill';
import { logger } from '../../../utils/logger';

describe('Tab Manager Unit Tests', () => {
  let tabManager;

  beforeEach(() => {
    jest.clearAllMocks();
    tabManager = new TabManager();
  });

  describe('validateTab', () => {
    test('should validate correct tab object', () => {
      const validTab = { id: 1, url: 'https://example.com' };
      expect(() => validateTab(validTab)).not.toThrow();
    });

    test('should throw on invalid tab object', () => {
      const invalidTab = { url: 'https://example.com' };
      expect(() => validateTab(invalidTab)).toThrow('Invalid tab ID');
    });
  });

  describe('processTabBatch', () => {
    test('should process tab batches correctly', async () => {
      const tabs = [{ id: 1 }, { id: 2 }, { id: 3 }];
      const batchSize = 2;
      const generator = processTabBatch(tabs, batchSize);
      
      const results = [];
      for await (const batch of generator) {
        results.push(batch);
      }
      
      expect(results).toHaveLength(2);
      expect(results[0]).toHaveLength(2);
      expect(results[1]).toHaveLength(1);
    });
  });

  test('should initialize tab manager', async () => {
    await tabManager.initialize();
    expect(logger.info).toHaveBeenCalledWith(
      'Tab manager initialized',
      expect.any(Object)
    );
  });

  test('should handle tab updates', async () => {
    const mockTab = { id: 1, url: 'https://example.com' };
    await tabManager.handleTabUpdate(1, { status: 'complete' }, mockTab);
    
    expect(browser.tabs.get).toHaveBeenCalledWith(1);
  });

  test('should handle tab removal', async () => {
    await tabManager.handleTabRemove(1);
    expect(browser.tabs.get).toHaveBeenCalledWith(1);
  });

  describe('tagTabAndBookmark', () => {
    let mockTab;

    beforeEach(() => {
      // Reset mocks
      jest.clearAllMocks();

      // Setup mock tab data
      mockTab = {
        id: 1,
        url: 'https://example.com',
        title: 'Test Tab'
      };

      // Mock browser.tabs.get to return our mock tab
      browser.tabs.get.mockResolvedValue(mockTab);

      // Mock folder creation and bookmark creation
      browser.bookmarks.search.mockResolvedValue([]);
      browser.bookmarks.create
        .mockResolvedValueOnce({ id: 'folder123', title: 'TabCurator' })
        .mockResolvedValueOnce({ id: 'bookmark123' });
    });

    test('should tag, bookmark, and close the tab', async () => {
      await tagTabAndBookmark(mockTab.id, 'test-tag');

      // Verify each operation was called with correct parameters
      expect(browser.tabs.update).toHaveBeenCalledWith(
        mockTab.id, 
        { title: '[test-tag] Test Tab' }
      );

      expect(browser.bookmarks.search).toHaveBeenCalledWith({ 
        title: 'TabCurator' 
      });

      expect(browser.bookmarks.create).toHaveBeenNthCalledWith(1, {
        title: 'TabCurator'
      });

      expect(browser.bookmarks.create).toHaveBeenNthCalledWith(2, {
        parentId: 'folder123',
        title: '[test-tag] Test Tab',
        url: mockTab.url
      });

      expect(browser.tabs.remove).toHaveBeenCalledWith(mockTab.id);

      expect(logger.logPerformance).toHaveBeenCalled(); // Add this verification

      // Verify state updates
      expect(stateManager.dispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          payload: expect.objectContaining({
            tabId: mockTab.id,
            metadata: expect.objectContaining({
              tags: ['test-tag'],
              lastTagged: expect.any(Number)
            })
          })
        })
      );
    });
  });

  describe('enforceTabLimits', () => {
    test('should set oldestTab if limit exceeded', async () => {
      // Mock more tabs than the limit
      stateManager.getState.mockReturnValueOnce({
        tabManagement: {
          tabs: [],
          activity: {
            1: { lastAccessed: 1000 },
            2: { lastAccessed: 500 },
            3: { lastAccessed: 2000 }
          }
        },
        settings: { maxTabs: 2 }
      });

      browser.tabs.query.mockResolvedValueOnce([
        { id: 1, url: 'https://a.com' },
        { id: 2, url: 'https://b.com' },
        { id: 3, url: 'https://c.com' }
      ]);

      await tabManager.enforceTabLimits();

      // The oldest tab based on lastAccessed = (lowest lastAccessed) is tabId=2
      expect(stateManager.actions.tabManagement.updateOldestTab).toBeCalled();
    });
  });
});
