// tests/playwright/popup.integration.test.js
import { test, expect, chromium } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import os from 'os';

test.describe('Popup script integration tests', () => {
  let context;
  let page;
  let extensionId;

  test.beforeEach(async () => {
    // Set up a new context and page for each test
    const pathToExtension = path.resolve(__dirname, '../../build/chrome');
    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-user-data-dir-'));

    context = await chromium.launchPersistentContext(userDataDir, {
      headless: false,
      args: [
        `--disable-extensions-except=${pathToExtension}`,
        `--load-extension=${pathToExtension}`
      ],
    });

    // Wait for the service worker to register and get the extension ID
    await context.waitForEvent('serviceworker');
    const [background] = context.serviceWorkers();
    if (!background) {
      throw new Error('Service worker not found. Extension may not have loaded properly.');
    }

    extensionId = background.url().split('/')[2];

    page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/src/popup/popup.html`);
  });

  test.afterEach(async () => {
    // Close the context after each test
    await context.close();
  });

  test('should load and display tabs in the popup', async () => {
    const page = await context.newPage();
  
    // Mock chrome.tabs.query before navigating to the popup
    await page.addInitScript(() => {
      window.chrome = window.chrome || {};
      chrome.tabs = {
        query: (queryInfo, callback) => {
          callback([{ title: 'Tab 1' }, { title: 'Tab 2' }]);
        },
      };
    });
  
    await page.goto(`chrome-extension://${extensionId}/src/popup/popup.html`);
  
    const tabListItems = await page.$$('#tab-list div');
    expect(tabListItems.length).toBe(2);
    const tabs = await Promise.all(tabListItems.map(item => item.textContent()));
    expect(tabs).toEqual(['Tab 1', 'Tab 2']);
  });

  test('should handle suspend button click in the popup', async () => {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/src/popup/popup.html`);

    // Mock chrome.runtime.sendMessage
    await page.evaluate(() => {
      window.chrome = window.chrome || {};
      window.chrome.runtime = {
        sendMessage: (message, callback) => {
          window.suspendActionPerformed = true;
          if (callback) callback({ message: 'Inactive tabs suspended' });
        },
      };
    });

    await page.click('#suspend-inactive-tabs');
    const actionPerformed = await page.evaluate(() => window.suspendActionPerformed || false);
    expect(actionPerformed).toBe(true);
  });

  test('should handle errors gracefully', async () => {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/src/popup/popup.html`);
  
    // Mock chrome.runtime.sendMessage to simulate an error
    await page.evaluate(() => {
      window.chrome = window.chrome || {};
      window.chrome.runtime = {
        sendMessage: (message, callback) => {
          chrome.runtime.lastError = { message: 'Simulated error' };
          if (callback) callback();
        },
      };
      window.consoleMessages = [];
      const originalError = console.error;
      console.error = (message) => {
        window.consoleMessages.push(message);
        originalError(message);
      };
    });
  
    await page.click('#suspend-inactive-tabs');
  
    const consoleMessages = await page.evaluate(() => window.consoleMessages || []);
    console.log(consoleMessages); // For debugging
  
    expect(consoleMessages.some(msg => msg.includes('Simulated error'))).toBe(true);
  });
});