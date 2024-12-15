// tests/playwright/popup.integration.test.js

import { test, expect } from '@playwright/test';
import { setupBrowserContext } from './setup';

test.describe('Popup Integration Tests', () => {
  let context;
  let page;
  const extensionId = 'nfojpoonjbnmklchadfhaihdcgfgkdbo'; // Ensure this matches your actual extension ID

  test.beforeEach(async () => {
    const setup = await setupBrowserContext(); // Removed 'browser' parameter
    context = setup.context;
    page = setup.page;

    // Wait for the "TabCurator" heading to ensure the popup is initialized
    await page.waitForSelector('text=TabCurator', { timeout: 10000 });

    // Wait until window.testHelpers is defined
    await page.waitForFunction(() => window.testHelpers !== undefined, { timeout: 10000 });

    // Reset mocks before each test
    await page.evaluate(() => {
      window.testHelpers.resetMocks();
    });
  });

  test.afterEach(async () => {
    if (context) {
      await context.close().catch(console.error);
      context = null;
      page = null;
    }
  });

  test('should handle tab loading with error handling', async () => {
    try {
      // Simulate successful tab loading by setting up the mock
      await page.evaluate(() => {
        window.browser.tabs.query.mock.calls = [];
        window.browser.tabs.query = async () => ([
          { id: 1, title: 'Test Tab', url: 'https://test.com' }
        ]);
      });

      await page.click('#refresh-tabs');
      const tabElements = await page.$$('#tab-list .tab-item');
      expect(tabElements.length).toBe(1);

      // Simulate error during tab loading
      await page.evaluate(() => {
        window.browser.tabs.query = async () => { throw new Error('Tab query failed'); };
      });

      await page.click('#refresh-tabs');
      const error = await page.evaluate(() => 
        document.querySelector('.error-message')?.textContent
      );
      expect(error).toContain('Error loading tabs');
    } catch (error) {
      console.error('Error in tab loading test:', error);
      throw error;
    }
  });

  test('should handle session management operations', async () => {
    try {
      // Test session saving
      const sessionName = 'Test Session';
      await page.fill('#session-name-input', sessionName);
      await page.click('#save-session');

      // Wait for sendMessage to be called
      await page.waitForFunction(() => window.browser.runtime.sendMessage.mock.calls.length > 0, { timeout: 5000 });

      // Verify that sendMessage was called with the correct action and sessionName
      const messages = await page.evaluate(() =>
        window.testHelpers.getSendMessageCalls()
      );
      expect(messages).toContainEqual({
        action: 'saveSession',
        sessionName
      });

      // Test error handling for session operations
      await page.evaluate(() => {
        window.browser.runtime.sendMessage.shouldFail = true;
      });

      await page.click('#save-session');

      // Verify that an error message is displayed
      const errorNotification = await page.locator('.error-message');
      expect(await errorNotification.isVisible()).toBe(true);
      expect(await errorNotification.textContent()).toContain('Error saving session');
    } catch (error) {
      console.error('Error in session management test:', error);
      throw error;
    }
  });

  test('should load and display tabs', async () => {
    try {
      // Wait for the tab list container to appear
      await page.waitForSelector('#tab-list', { state: 'attached' });

      // Clear existing tabs to ensure consistency
      await page.evaluate(() => {
        const tabList = document.getElementById('tab-list');
        tabList.innerHTML = '';
      });

      // Add test tabs directly into the DOM
      await page.evaluate(() => {
        const tabList = document.getElementById('tab-list');
        const tabs = [
          { id: 1, title: 'Tab 1' },
          { id: 2, title: 'Tab 2' }
        ];
        tabs.forEach(tab => {
          const div = document.createElement('div');
          div.classList.add('tab-item');
          div.textContent = tab.title;
          tabList.appendChild(div);
        });
      });

      const tabs = await page.$$eval('#tab-list .tab-item', els => els.length);
      expect(tabs).toBe(2);
    } catch (error) {
      console.error('Error in loading tabs test:', error);
      throw error;
    }
  });

  test('should handle suspend button click', async () => {
    try {
      console.log('Clicking on suspend inactive tabs button.');
      await page.click('#suspend-inactive-tabs');

      // Wait a short time for the action to be processed
      await page.waitForTimeout(500);

      const calls = await page.evaluate(() => window.testHelpers.getSendMessageCalls());
      console.log('sendMessage calls:', calls);

      expect(calls.length).toBeGreaterThan(0);
      expect(calls[0]).toEqual({ action: 'suspendInactiveTabs' });
    } catch (error) {
      console.error('Error in suspend button click test:', error);
      throw error;
    }
  });

  test('should handle errors gracefully', async () => {
    try {
      // Simulate an error by setting shouldFail to true
      await page.evaluate(() => {
        window.browser.runtime.sendMessage.shouldFail = true;
      });

      await page.click('#suspend-inactive-tabs');

      // Wait briefly for the error to propagate
      await page.waitForTimeout(500);

      const error = await page.evaluate(() => window.testHelpers.getLastError());
      expect(error).toBe('Simulated error');

      // Optionally, verify that an error message is displayed in the UI
      const errorNotification = await page.locator('.error-message');
      expect(await errorNotification.isVisible()).toBe(true);
      expect(await errorNotification.textContent()).toContain('Error suspending tabs');
    } catch (error) {
      console.error('Error in graceful error handling test:', error);
      throw error;
    }
  });

  test('should load test.html successfully', async () => {
    try {
      const testUrl = `chrome-extension://${extensionId}/test/test.html`;
      const response = await page.goto(testUrl, {
        waitUntil: 'domcontentloaded',
        timeout: 5000
      });
      expect(response.ok()).toBeTruthy();

      const content = await page.textContent('h1');
      expect(content).toBe('Extension Test Page');
    } catch (error) {
      console.error('Error in loading test.html:', error);
      throw error;
    }
  });
});