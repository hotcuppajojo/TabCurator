// tests/jest/tagUtils.test.js

// Import the mocked browser
const browser = require('./mocks/browserMock');

// Import after browser mock is set up
const { tagTab, archiveTab, applyRulesToTab } = require('../../src/utils/tagUtils.js');
const { getTab, updateTab, removeTab } = require('../../src/utils/tabManager.js');

// Mock the tabManager module
jest.mock('../../src/utils/tabManager.js');

// Mock the stateManager module since it's imported by tagUtils
jest.mock('../../src/utils/stateManager.js', () => ({
  state: {},
  store: {
    getState: jest.fn(() => ({
      archivedTabs: {}
    })),
    dispatch: jest.fn()
  }
}));

const { createMockTab, createTaggedTab, createComplexTabs, createBulkTabs } = require('./utils/testUtils');

describe("Tag Utils", () => {
  let browser;

  beforeEach(() => {
    jest.clearAllMocks();
    global.browser = browser; // Assign the mocked browser
    console.error = jest.fn(); // Mock console.error
    // Get fresh instance of the mocked browser
    // browser = require('webextension-polyfill');
  });

  afterEach(async () => {
    jest.clearAllTimers(); // Stop timers to prevent further processing
  });

  describe('tagTab', () => {
    test("should tag a tab by updating its title", async () => {
      const tabId = 1;
      const tag = 'Important';
      getTab.mockResolvedValue({ id: tabId, title: 'Original Title' });
      updateTab.mockResolvedValue();

      await tagTab(tabId, tag);

      expect(getTab).toHaveBeenCalledWith(tabId);
      expect(updateTab).toHaveBeenCalledWith(tabId, { title: `[${tag}] Original Title` });
      expect(console.error).not.toHaveBeenCalled();
    });

    test("should handle errors when getting tab fails", async () => {
      const error = new Error('Failed to get tab');
      getTab.mockRejectedValue(error);

      await expect(tagTab(1, 'Important')).rejects.toThrow(error);
      expect(console.error).toHaveBeenCalledWith('Failed to tag tab 1:', error);
      expect(updateTab).not.toHaveBeenCalled();
    });

    test("should handle errors when updating tab fails", async () => {
      const error = new Error('Failed to update tab');
      getTab.mockResolvedValue({ id: 1, title: 'Original Title' });
      updateTab.mockRejectedValue(error);

      await expect(tagTab(1, 'Important')).rejects.toThrow(error);
      expect(console.error).toHaveBeenCalledWith('Failed to tag tab 1:', error);
    });

    test('should handle special characters in tags', async () => {
      const tabId = 1;
      const tag = 'Special & Characters';
      const tab = { id: tabId, title: 'Original Title', url: 'https://example.com' };

      getTab.mockResolvedValue(tab);
      updateTab.mockResolvedValue({ ...tab, title: `[${tag}] ${tab.title}` });

      await tagTab(tabId, tag);

      expect(getTab).toHaveBeenCalledWith(tabId);
      expect(updateTab).toHaveBeenCalledWith(tabId, { title: `[${tag}] ${tab.title}` });
    });
  });

  describe('archiveTab', () => {
    test("should archive a tab by saving its data and removing it", async () => {
      const tabId = 1;
      const tag = 'Archive';
      const archivedTabs = {};
      const tab = { id: tabId, title: 'Test Tab', url: 'https://example.com' };
      
      getTab.mockResolvedValue(tab);
      removeTab.mockResolvedValue();

      await archiveTab(tabId, tag, archivedTabs);

      expect(getTab).toHaveBeenCalledWith(tabId);
      expect(archivedTabs[tag][0]).toMatchObject({
        title: tab.title,
        url: tab.url
      });
      expect(archivedTabs[tag][0]).toHaveProperty('timestamp');
      expect(typeof archivedTabs[tag][0].timestamp).toBe('number');
      expect(removeTab).toHaveBeenCalledWith(tabId);
      expect(console.error).not.toHaveBeenCalled();
    });

    test("should append to existing tag array if it exists", async () => {
      const tabId = 1;
      const tag = 'Archive';
      const existingTab = { title: 'Existing Tab', url: 'https://existing.com' };
      const archivedTabs = { [tag]: [existingTab] };
      
      getTab.mockResolvedValue({ id: tabId, title: 'Test Tab', url: 'https://example.com' });
      removeTab.mockResolvedValue();

      await archiveTab(tabId, tag, archivedTabs);

      expect(archivedTabs[tag]).toHaveLength(2);
      expect(archivedTabs[tag][0]).toEqual(existingTab);
    });

    test("should handle errors when getting tab fails", async () => {
      const error = new Error('Failed to get tab');
      getTab.mockRejectedValue(error);

      await expect(archiveTab(1, 'Archive', {})).rejects.toThrow(error);
      expect(console.error).toHaveBeenCalledWith('Failed to archive tab 1:', error);
      expect(removeTab).not.toHaveBeenCalled();
    });

    test("should handle errors when removing tab fails", async () => {
      const error = new Error('Failed to remove tab');
      getTab.mockResolvedValue({ id: 1, title: 'Test Tab', url: 'https://example.com' });
      removeTab.mockRejectedValue(error);

      await expect(archiveTab(1, 'Archive', {})).rejects.toThrow(error);
      expect(console.error).toHaveBeenCalledWith('Failed to archive tab 1:', error);
    });
  });

  test("should handle invalid inputs gracefully", async () => {
    await expect(tagTab(null, 'Important')).rejects.toThrow();
    await expect(archiveTab(null, 'Archive', {})).rejects.toThrow();
  });

  describe("Internal Integration Tests", () => {
    test("should integrate tagging and archiving", async () => {
      const tabId = 1;
      const tag = 'Important';
      const archivedTabs = {};
      
      // Initial tab state
      const initialTab = { id: tabId, title: 'Test Tab', url: 'https://example.com' };
      // Tagged tab state
      const taggedTab = { id: tabId, title: `[${tag}] Test Tab`, url: 'https://example.com' };
      
      // First call returns initial tab, second call returns tagged tab
      getTab
        .mockResolvedValueOnce(initialTab)
        .mockResolvedValueOnce(taggedTab);
        
      updateTab.mockResolvedValue();
      removeTab.mockResolvedValue();
      
      await tagTab(tabId, tag);
      await archiveTab(tabId, tag, archivedTabs);
      
      expect(archivedTabs[tag][0]).toMatchObject({
        title: `[${tag}] Test Tab`,
        url: 'https://example.com'
      });
      expect(archivedTabs[tag][0]).toHaveProperty('timestamp');
      expect(typeof archivedTabs[tag][0].timestamp).toBe('number');
    });
  });

  describe('Complex Scenarios', () => {
    test('should handle tabs with existing tags', async () => {
      const tab = createMockTab(1, { title: '[Existing] Test Tab' });
      getTab.mockResolvedValue(tab);
      
      await tagTab(1, 'New');
      expect(updateTab).toHaveBeenCalledWith(1, { title: '[New] [Existing] Test Tab' });
    });

    test('should handle special characters in tags', async () => {
      const specialChars = '!@#$%^&*()';
      const mockTab = { id: 1, title: 'Original Title', url: 'https://example.com' };
      getTab.mockResolvedValueOnce(mockTab);
      
      await tagTab(1, specialChars);
      expect(updateTab).toHaveBeenCalledWith(1, 
        expect.objectContaining({ 
          title: `[${specialChars}] ${mockTab.title}` 
        })
      );
    });
  });

  describe('Bulk Operations', () => {
    test('should handle archiving multiple tabs', async () => {
      const tabs = createBulkTabs(100);
      const archivedTabs = {};
      
      for (const tab of tabs) {
        getTab.mockResolvedValueOnce(tab);
        await archiveTab(tab.id, 'BulkTag', archivedTabs);
      }

      expect(archivedTabs['BulkTag']).toHaveLength(100);
    });
  });

  describe('Service Worker Compatibility', () => {
    test('should handle service worker termination gracefully', async () => {
      const error = new Error('Extension context invalidated');
      getTab.mockRejectedValueOnce(error);
      
      await expect(tagTab(1, 'Important')).rejects.toThrow(error);
      expect(console.error).toHaveBeenCalledWith('Failed to tag tab 1:', error);
    });

    test('should perform operations within service worker time limits', async () => {
      const tabs = createBulkTabs(50);
      const start = Date.now();
      
      for (const tab of tabs) {
        getTab.mockResolvedValueOnce(tab);
        await tagTab(tab.id, 'Performance');
      }
      
      const duration = Date.now() - start;
      expect(duration).toBeLessThan(1000); // Operations should complete within 1 second
    });
  });

  describe('Declarative Pattern Tests', () => {
    test('should apply rules declaratively', async () => {
      const mockStore = {
        getState: jest.fn(() => ({ 
          archivedTabs: {},
          rules: [{
            condition: 'example.com',
            action: 'Tag: Work'
          }]
        })),
        dispatch: jest.fn()
      };

      const testBrowser = {
        storage: {
          sync: {
            get: jest.fn().mockResolvedValue({
              rules: [{
                condition: 'example.com',
                action: 'Tag: Work'
              }]
            })
          }
        }
      };

      const tab = { 
        id: 1, 
        url: 'https://example.com', 
        title: 'Test Tab'
      };

      getTab.mockResolvedValueOnce(tab);
      removeTab.mockResolvedValueOnce();

      await applyRulesToTab(tab, testBrowser, mockStore);
      
      // Verify the dispatch was called with the correct action
      expect(mockStore.dispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'ARCHIVE_TAB',
          payload: expect.objectContaining({
            tag: 'Work',
            tabData: expect.any(Object)
          })
        })
      );
    });

    test('should handle rule application failures safely', async () => {
      const mockBrowser = {
        storage: {
          sync: {
            get: jest.fn().mockRejectedValue(new Error('Storage error'))
          }
        }
      };

      const tab = createMockTab(1);
      await applyRulesToTab(tab, mockBrowser, {});
      
      expect(console.error).toHaveBeenCalled();
    });
  });

  describe('Error Handling and Recovery', () => {
    test('should handle concurrent operations safely', async () => {
      const operations = Array.from({ length: 5 }, (_, i) => {
        getTab.mockResolvedValueOnce(createMockTab(i + 1));
        return tagTab(i + 1, 'Concurrent');
      });
      
      await expect(Promise.all(operations)).resolves.not.toThrow();
    });

    test('should validate input thoroughly', async () => {
      await expect(tagTab(null, 'Test')).rejects.toThrow('Tab ID must be a valid number');
      await expect(tagTab(1, '')).rejects.toThrow('Tag must be a non-empty string');
      await expect(tagTab('invalid', 'Test')).rejects.toThrow('Tab ID must be a valid number');
    });
  });

  describe('Performance Optimization', () => {
    test('should handle large batch operations efficiently', async () => {
      const archivedTabs = {};
      const tabs = createBulkTabs(100);
      const start = performance.now();
      
      for (const tab of tabs) {
        getTab.mockResolvedValueOnce(tab);
        await archiveTab(tab.id, 'Batch', archivedTabs);
      }
      
      const duration = performance.now() - start;
      expect(duration).toBeLessThan(2000); // Should process 100 tabs within 2 seconds
      expect(archivedTabs['Batch']).toHaveLength(100);
    });
  });
});