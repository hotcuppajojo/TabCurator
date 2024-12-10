const browser = require('webextension-polyfill');
const { 
  queryTabs, 
  getTab, 
  createTab, 
  updateTab, 
  removeTab, 
  discardTab,
  suspendTab,
  suspendInactiveTabs 
} = require('../../src/utils/tabManager.js');

const { createMockTab, createBulkTabs, createComplexTabs } = require('./utils/testUtils');

describe("Tab Manager", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    console.error = jest.fn();
    console.warn = jest.fn();
    Object.assign(browser, {
      tabs: {
        query: jest.fn(),
        get: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        remove: jest.fn(),
        discard: jest.fn()
      }
    });
  });

  describe('Tab Operations', () => {
    describe('queryTabs', () => {
      test("should query tabs with provided options", async () => {
        const mockTabs = [{ id: 1 }, { id: 2 }];
        browser.tabs.query.mockResolvedValue(mockTabs);
        const result = await queryTabs({ active: true });
        expect(browser.tabs.query).toHaveBeenCalled();
        expect(result).toEqual(mockTabs);
      });

      test("should handle query errors gracefully", async () => {
        const error = new Error('Query failed');
        browser.tabs.query.mockRejectedValue(error);

        await expect(queryTabs({})).rejects.toThrow(error);
        expect(console.error).toHaveBeenCalledWith('Error querying tabs:', error);
      });
    });

    describe('getTab', () => {
      test("should get tab by id", async () => {
        const mockTab = { id: 1, title: 'Test Tab', url: 'https://example.com' };
        browser.tabs.get.mockResolvedValue(mockTab);
        const result = await getTab(1);
        expect(result).toEqual(mockTab);
      });

      test("should handle get errors gracefully", async () => {
        const error = new Error('Get failed');
        browser.tabs.get.mockRejectedValue(error);

        await expect(getTab(1)).rejects.toThrow(error);
        expect(console.error).toHaveBeenCalledWith('Error retrieving tab 1:', error);
      });

      test("should handle invalid tab id", async () => {
        await expect(getTab(null)).rejects.toThrow();
        await expect(getTab(undefined)).rejects.toThrow();
        await expect(getTab('invalid')).rejects.toThrow();
      });
    });

    describe('createTab', () => {
      test("should create tab with provided properties", async () => {
        const properties = { url: 'https://example.com' };
        const mockTab = { id: 1, ...properties };
        browser.tabs.create.mockResolvedValue(mockTab);

        const result = await createTab(properties);

        expect(browser.tabs.create).toHaveBeenCalledWith(properties);
        expect(result).toEqual(mockTab);
        expect(console.error).not.toHaveBeenCalled();
      });

      test("should handle create errors gracefully", async () => {
        const error = new Error('Create failed');
        browser.tabs.create.mockRejectedValue(error);

        await expect(createTab({})).rejects.toThrow(error);
        expect(console.error).toHaveBeenCalledWith('Error creating tab:', error);
      });
    });

    describe('updateTab', () => {
      test("should update tab with provided properties", async () => {
        const tabId = 1;
        const updateInfo = { title: 'Updated Title' };
        browser.tabs.update.mockResolvedValue({ id: tabId, ...updateInfo });

        await updateTab(tabId, updateInfo);

        expect(browser.tabs.update).toHaveBeenCalledWith(tabId, updateInfo);
        expect(console.error).not.toHaveBeenCalled();
      });

      test("should handle update errors gracefully", async () => {
        const error = new Error('Update failed');
        browser.tabs.update.mockRejectedValue(error);

        await expect(updateTab(1, {})).rejects.toThrow(error);
        expect(console.error).toHaveBeenCalledWith('Error updating tab 1:', error);
      });

      test("should validate input parameters", async () => {
        await expect(updateTab(null, {})).rejects.toThrow();
        await expect(updateTab(1, null)).rejects.toThrow();
        await expect(updateTab(undefined, {})).rejects.toThrow();
      });
    });

    describe('removeTab', () => {
      test("should remove specified tab", async () => {
        const tabId = 1;
        browser.tabs.remove.mockResolvedValue();

        await removeTab(tabId);

        expect(browser.tabs.remove).toHaveBeenCalledWith(tabId);
        expect(console.error).not.toHaveBeenCalled();
      });

      test("should handle remove errors gracefully", async () => {
        const error = new Error('Remove failed');
        browser.tabs.remove.mockRejectedValue(error);

        await expect(removeTab(1)).rejects.toThrow(error);
        expect(console.error).toHaveBeenCalledWith('Error removing tab 1:', error);
      });

      test("should validate tab id", async () => {
        await expect(removeTab(null)).rejects.toThrow();
        await expect(removeTab('invalid')).rejects.toThrow();
      });
    });
  });

  describe('Tab Suspension', () => {
    test('should suspend tab by discarding', async () => {
      const tabId = 1;
      const discardedTab = { id: tabId, discarded: true };
      browser.tabs.discard.mockResolvedValue(discardedTab);
      browser.tabs.get.mockResolvedValue({ id: tabId, url: 'https://example.com' });

      const result = await suspendTab(tabId);
      expect(result).toBe(discardedTab);
      expect(console.warn).not.toHaveBeenCalled();
    });

    test('should warn if discard is not supported', async () => {
      browser.tabs.discard = undefined;
      await suspendTab(1);
      expect(console.warn).toHaveBeenCalledWith('Tab discard is not supported by this browser.');
    });

    test('should handle invalid tab IDs', async () => {
      await expect(suspendTab('invalid')).rejects.toThrow('Invalid tab ID');
      await expect(suspendTab(null)).rejects.toThrow('Invalid tab ID');
    });
  });

  describe('Bulk Operations', () => {
    test('should handle bulk tab operations efficiently', async () => {
      const bulkTabs = createBulkTabs(100);
      browser.tabs.query.mockResolvedValue(bulkTabs);
      
      const startTime = performance.now();
      await suspendInactiveTabs(browser);
      const endTime = performance.now();
      
      expect(endTime - startTime).toBeLessThan(1000); // Should complete within 1s
      expect(browser.tabs.query).toHaveBeenCalled();
    });

    test('should handle complex tab data', async () => {
      const complexTabs = createComplexTabs();
      browser.tabs.query.mockResolvedValue(complexTabs);

      const result = await queryTabs({});
      expect(result).toEqual(complexTabs);
    });
  });

  describe('Integration Tests', () => {
    test('should support operation chaining', async () => {
      // Setup mock responses with complete tab data
      const tab = { 
        id: 1, 
        url: 'https://example.com',
        title: 'Test Tab' 
      };
      
      // Mock each operation's response
      browser.tabs.create.mockResolvedValue(tab);
      browser.tabs.get.mockResolvedValue(tab); // Add this mock for getTab validation
      browser.tabs.update.mockResolvedValue({ ...tab, title: 'Updated' });
      browser.tabs.discard.mockResolvedValue({ ...tab, discarded: true });

      const created = await createTab({ url: tab.url });
      const updated = await updateTab(created.id, { title: 'Updated' });
      const suspended = await suspendTab(updated.id);

      expect(suspended.discarded).toBe(true);
    });

    test("should support chaining operations", async () => {
      const properties = { url: 'https://example.com' };
      const createdTab = { id: 1, ...properties };
      const updatedTab = { ...createdTab, title: 'Updated Title' };
      
      browser.tabs.create.mockResolvedValue(createdTab);
      browser.tabs.update.mockResolvedValue(updatedTab);
      browser.tabs.remove.mockResolvedValue();

      const tab = await createTab(properties);
      await updateTab(tab.id, { title: 'Updated Title' });
      await removeTab(tab.id);

      expect(browser.tabs.create).toHaveBeenCalled();
      expect(browser.tabs.update).toHaveBeenCalled();
      expect(browser.tabs.remove).toHaveBeenCalled();
    });
  });

  describe('Performance Tests', () => {
    test('should handle bulk tab queries efficiently', async () => {
      const bulkTabs = createBulkTabs(1000);
      browser.tabs.query.mockResolvedValue(bulkTabs);

      const startTime = performance.now();
      const result = await queryTabs({});
      const endTime = performance.now();

      expect(result).toHaveLength(1000);
      expect(endTime - startTime).toBeLessThan(100); // Should complete within 100ms
    });

    test('should handle complex tab data', async () => {
      const complexTabs = createComplexTabs();
      browser.tabs.query.mockResolvedValue(complexTabs);

      const result = await queryTabs({});
      expect(result).toEqual(complexTabs);
    });
  });

  describe('Error Handling', () => {
    test('should handle browser API unavailability', async () => {
      const originalTabs = browser.tabs;
      browser.tabs = undefined;
      await expect(queryTabs({})).rejects.toThrow('Browser API unavailable');
      browser.tabs = originalTabs;
    });

    test('should handle malformed tab data', async () => {
      browser.tabs.get.mockResolvedValueOnce({ 
        invalid: 'data',
        // Missing required id and url fields
      });
      await expect(getTab(1)).rejects.toThrow('Invalid tab data');
    });

    test('should handle concurrent tab operations', async () => {
      const operations = Array.from({ length: 10 }, (_, i) => {
        const validTabId = i + 1; // Ensure tabId starts from 1
        browser.tabs.update.mockResolvedValueOnce({ id: validTabId, title: `Updated ${validTabId}` });
        return updateTab(validTabId, { title: `Updated ${validTabId}` });
      });
      await expect(Promise.all(operations)).resolves.not.toThrow();
    });
  });
});