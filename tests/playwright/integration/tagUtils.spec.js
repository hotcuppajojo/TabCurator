
// tests/playwright/tagUtils.integration.test.js

const { test, expect } = require('@playwright/test');
const { injectBrowserMock } = require('./mocks/browserMock');

test.describe('Tag Utilities Integration Tests', () => {
  test.beforeEach(async ({ page }) => {
    await injectBrowserMock(page);
    // ...additional setup...
  });

  test('should tag a tab successfully', async ({ page }) => {
    try {
      await page.goto('https://example.com');
      // Perform tagging action
      await page.evaluate(async () => {
        await browser.runtime.sendMessage({ action: 'tagTab', tabId: 1, tag: 'Important' });
      });
      // Verify the tag
      const taggedTitle = await page.evaluate(() => document.title);
      expect(taggedTitle).toContain('[Important]');
    } catch (error) {
      console.error('Error in tagging tab:', error);
      throw error;
    }
  });

  // ...additional tests...
});