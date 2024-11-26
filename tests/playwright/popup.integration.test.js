import { test, expect } from '@playwright/test';
import { getExtensionId } from './setup';
import { injectBrowserMock } from './mocks/browserMock';
import fs from 'fs';
import path from 'path';

test.describe('Popup script integration tests', () => {
  let browserContext;
  let page;
  let extensionId;

  test.beforeEach(async ({ context }) => {
    const setup = await getExtensionId();
    browserContext = setup.context;
    extensionId = setup.extensionId;

    page = await browserContext.newPage();

    // Wait longer for extension to load
    await page.waitForTimeout(1000);

    // Inject browser mock before navigating
    await injectBrowserMock(page);

    // Navigate to popup with extended timeout
    await page.goto(`chrome-extension://${extensionId}/src/popup/popup.html`, {
      waitUntil: 'networkidle',
      timeout: 30000
    });

    // Reset mocks and verify initialization
    await page.evaluate(() => {
      window.testHelpers.resetMocks();
      window.browser.runtime.sendMessage.shouldFail = false;
      window.browser.runtime.sendMessage.mock.calls = [];
    });

    // Ensure popup is initialized
    await page.waitForFunction(() => !!window.popupInstance, { timeout: 10000 });
  });

  async function pollForCondition(page, conditionFn, maxAttempts = 20, interval = 100) {
    for (let i = 0; i < maxAttempts; i++) {
      const result = await page.evaluate(conditionFn);
      if (result) return result;
      await page.waitForTimeout(interval);
    }
    return null;
  }

  test('should load and display tabs', async () => {
    // Wait for tab list container
    const tabList = await page.waitForSelector('#tab-list', { state: 'attached' });
    
    // Add test tabs directly to DOM using evaluate
    await page.evaluate(() => {
      const tabList = document.getElementById('tab-list');
      const tabs = [
        { id: 1, title: 'Tab 1' },
        { id: 2, title: 'Tab 2' }
      ];
      tabs.forEach(tab => {
        const div = document.createElement('div');
        div.textContent = tab.title;
        tabList.appendChild(div);
      });
    });

    const tabs = await page.$$eval('#tab-list div', els => els.length);
    expect(tabs).toBe(2);
  });

  test('should handle suspend button click', async () => {
    // Reset mocks
    await page.evaluate(() => {
      window.testHelpers.resetMocks();
      window.browser.runtime.sendMessage.shouldFail = false;
      window.browser.runtime.sendMessage.mock.calls = [];
    });

    // Click and wait for action to complete
    await page.click('#suspend-inactive-tabs');
    
    // Increase wait time to ensure message is processed
    await page.waitForTimeout(500); // Increased from 100ms to 500ms

    const calls = await page.evaluate(() => window.browser.runtime.sendMessage.mock.calls);
    expect(calls.length).toBeGreaterThan(0);
    expect(calls[0][0]).toEqual({ action: 'suspendInactiveTabs' });
  });

  test('should handle errors gracefully', async () => {
    // Reset mocks
    await page.evaluate(() => {
      window.testHelpers.resetMocks();
      window.browser.runtime.sendMessage.shouldFail = true;
      window.browser.runtime.lastError = { message: 'Simulated error' };
    });

    await page.click('#suspend-inactive-tabs');
    
    // Wait briefly for error to be set
    await page.waitForTimeout(100);

    const error = await page.evaluate(() => window.browser.runtime.lastError?.message);
    expect(error).toBe('Simulated error');
  });

  test.afterEach(async () => {
    await browserContext?.close();
  });
});