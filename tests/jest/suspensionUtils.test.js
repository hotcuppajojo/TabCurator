// tests/jest/suspensionUtils.test.js

const { createMockBrowser } = require('./mocks/browserMock.js');
const mockBrowser = createMockBrowser(); // Initialize the mocked browser

// Mock webextension-polyfill before importing suspendTab
jest.mock('webextension-polyfill', () => mockBrowser);

// Import suspendTab after mock is set up
const { suspendTab } = require('../../src/utils/suspensionUtils.js');

describe('Suspension Utils', () => {
  let browser;
  
  beforeEach(() => {
    jest.clearAllMocks();
    console.warn = jest.fn();
    console.error = jest.fn();
    // Get fresh instance of the mocked browser
    browser = require('webextension-polyfill');
  });

  test('should suspend a tab by discarding it if supported', async () => {
    const tabId = 1;
    const discardedTab = { id: tabId, discarded: true };
    browser.tabs.discard = jest.fn().mockResolvedValue(discardedTab);

    const result = await suspendTab(tabId);

    expect(browser.tabs.discard).toHaveBeenCalledWith(tabId);
    expect(result).toBe(discardedTab);
    expect(console.warn).not.toHaveBeenCalled();
    expect(console.error).not.toHaveBeenCalled();
  });

  test('should warn if discard is not supported', async () => {
    browser.tabs.discard = undefined;
    
    const result = await suspendTab(1);
    
    expect(result).toBeUndefined();
    expect(console.warn).toHaveBeenCalledWith('Tab discard is not supported by this browser.');
    expect(console.error).not.toHaveBeenCalled();
  });

  test('should handle and throw errors during tab suspension', async () => {
    const tabId = 1;
    const error = new Error('Failed to discard');
    browser.tabs.discard = jest.fn().mockRejectedValue(error);

    await expect(suspendTab(tabId)).rejects.toThrow(error);
    expect(console.error).toHaveBeenCalledWith(`Failed to suspend tab ${tabId}:`, error);
  });

  test('should handle null or undefined tabId', async () => {
    await expect(suspendTab(null)).rejects.toThrow('Invalid tab ID');
    await expect(suspendTab(undefined)).rejects.toThrow('Invalid tab ID');
    expect(browser.tabs.discard).not.toHaveBeenCalled();
  });

  test('should handle non-numeric tabId', async () => {
    await expect(suspendTab('string-id')).rejects.toThrow('Invalid tab ID');
    expect(browser.tabs.discard).not.toHaveBeenCalled();
  });

  test('should handle invalid inputs gracefully', async () => {
    await expect(suspendTab(null)).rejects.toThrow('Invalid tab ID');
    await expect(suspendTab('string-id')).rejects.toThrow('Invalid tab ID');
  });

  describe("Internal Integration Tests", () => {
    test("should integrate suspension with other utilities", async () => {
      const tabId = 1;
      const discardedTab = { id: tabId, discarded: true };
      browser.tabs.discard = jest.fn().mockResolvedValue(discardedTab);
      const result = await suspendTab(tabId);
      expect(result).toBe(discardedTab);
    });
  });
});