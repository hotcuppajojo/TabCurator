// tests/playwright/options.integration.test.js
import { test, expect, chromium } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import os from 'os';

test.describe('Options page integration tests', () => {
  let context;
  let extensionId;

  test.beforeAll(async () => {
    const pathToExtension = path.resolve(__dirname, '../../build/chrome');
    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-user-data-dir-'));

    context = await chromium.launchPersistentContext(userDataDir, {
      headless: false,
      args: [
        `--disable-extensions-except=${pathToExtension}`,
        `--load-extension=${pathToExtension}`,
      ],
      channel: 'chrome',
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

  test('should handle errors gracefully', async () => {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/src/options/options.html`);
    await page.evaluate(() => {
      // Simulate error in chrome.storage.sync.set
      const originalSet = chrome.storage.sync.set;
      chrome.storage.sync.set = (_, __) => {
        throw new Error('Simulated error');
      };
      // Capture console errors
      window.consoleMessages = [];
      const originalError = console.error;
      console.error = (message) => {
        window.consoleMessages.push(message);
        originalError(message);
      };
    });
    await page.click('#save-options');
    const consoleMessages = await page.evaluate(() => window.consoleMessages || []);
    expect(consoleMessages.some(msg => msg.includes('Simulated error'))).toBe(true);
  });
});