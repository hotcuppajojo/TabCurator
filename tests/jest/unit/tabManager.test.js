import { jest } from '@jest/globals';
import { 
  createTab, 
  updateTab, 
  discardTab,
  validateTab,
  processTabBatch,
  createTabManager
} from '../../../utils/tabManager';
import { logger } from '../../../utils/logger';
import browser from 'webextension-polyfill';

// Mock stateManager
jest.mock('../../../utils/stateManager', () => ({
  __esModule: true,
  default: {
    dispatch: jest.fn(),
    getState: jest.fn(() => ({
      tabManagement: {
        tabs: [],
        activity: {},
        oldestTab: null
      },
      settings: {
        maxTabs: 100
      }
    })),
    actions: {
      tabManagement: {
        updateTab: jest.fn(),
        removeTab: jest.fn()
      },
      archivedTabs: {
        archiveTab: jest.fn()
      }
    }
  }
}));

// Mock logger
jest.mock('../../../utils/logger', () => ({
  __esModule: true,
  logger: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    critical: jest.fn()
  }
}));

// Mock browser API
jest.mock('webextension-polyfill', () => ({
  __esModule: true,
  default: {
    tabs: {
      get: jest.fn().mockResolvedValue({ id: 1, url: 'https://example.com', title: 'Test Tab' }),
      remove: jest.fn().mockResolvedValue(undefined),
      update: jest.fn().mockResolvedValue({ id: 1 })
    },
  }
}));

describe('Tab Manager Unit Tests', () => {
  let tabManager;

  beforeEach(() => {
    jest.clearAllMocks();
    tabManager = createTabManager();
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
});
