// tests/jest/tagUtils.test.js

// Import the mocked browser
const browser = require('webextension-polyfill');

// Import after browser mock is set up
const { tagTab, archiveTab } = require('../../src/utils/tagUtils.js');
const { getTab, updateTab, removeTab } = require('../../src/utils/tabUtils.js');

// Mock the tabUtils module
jest.mock('../../src/utils/tabUtils.js');

// Mock the stateManager module since it's imported by tagUtils
jest.mock('../../src/utils/stateManager.js', () => ({
  state: {},
}));

const { createMockTab, createTaggedTab, createComplexTabs, createBulkTabs } = require('./utils/testUtils');

describe("Tag Utils", () => {
  let browser;

  beforeEach(() => {
    jest.clearAllMocks();
    console.error = jest.fn(); // Mock console.error
    // Get fresh instance of the mocked browser
    // browser = require('webextension-polyfill');
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
      expect(archivedTabs[tag]).toContainEqual({
        title: tab.title,
        url: tab.url
      });
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
      
      expect(archivedTabs[tag]).toContainEqual({
        title: `[${tag}] Test Tab`,
        url: 'https://example.com'
      });
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
      await tagTab(1, specialChars);
      expect(updateTab).toHaveBeenCalledWith(1, 
        expect.objectContaining({ 
          title: expect.stringContaining(specialChars) 
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
});