// tests/playwright/popup.integration.test.js
import { test, expect, chromium } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import os from 'os';

test.describe('Popup script integration tests', () => {
  let context;
  let extensionId;

  test.beforeAll(async () => {
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
  });

  test.afterAll(async () => {
    await context.close();
  });

  test('should load and display tabs in the popup', async () => {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/src/popup/popup.html`);

    // Mock chrome.tabs.query
    await page.evaluate(() => {
      window.chrome = window.chrome || {};
      window.chrome.tabs = {
        query: (_, callback) => {
          callback([{ title: 'Tab 1' }, { title: 'Tab 2' }]);
        },
      };
    });

    await page.reload();

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

    // Mock chrome.runtime.sendMessage to throw an error
    await page.evaluate(() => {
      window.chrome = window.chrome || {};
      window.chrome.runtime = {
        sendMessage: () => {
          throw new Error('Simulated error');
        },
      };
      // Capture console errors
      window.consoleMessages = [];
      const originalError = console.error;
      console.error = (message) => {
        window.consoleMessages.push(message);
        originalError(message);
      };
    });

    await page.click('#suspend-inactive-tabs');
    const consoleMessages = await page.evaluate(() => window.consoleMessages || []);
    expect(consoleMessages.some(msg => msg.includes('Simulated error'))).toBe(true);
  });
});