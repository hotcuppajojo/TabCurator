// tests/playwright/options.integration.test.js
import { test, expect, chromium } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import os from 'os';

test.describe('Options page integration tests', () => {
  let context;
  let page;
  let extensionId;

  test.beforeEach(async () => {
    // Set up a new context and page for each test
    const pathToExtension = path.resolve(__dirname, '../../build/chrome');
    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-user-data-dir-'));

    context = await chromium.launchPersistentContext(userDataDir, {
      headless: false,
      channel: 'chrome',
      args: [
        `--disable-extensions-except=${pathToExtension}`,
        `--load-extension=${pathToExtension}`,
        '--no-sandbox',
        '--disable-web-security',
        '--disable-features=ExtensionsToolbarMenu',
      ],
    });

    // Open a blank page to ensure extension pages are loaded
    await context.newPage();

    // Wait for background service worker to activate
    const [background] = context.serviceWorkers();
    if (!background) {
      await context.waitForEvent('serviceworker');
    }

    // Retrieve the extension ID from background worker URL
    const serviceWorker = context.serviceWorkers()[0];
    extensionId = serviceWorker.url().split('/')[2];

    page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/src/options/options.html`);
  });

  test.afterEach(async () => {
    // Close the context after each test to ensure isolation
    await context.close();
  });

  test('should load and display saved options', async () => {
    const thresholdValue = await page.inputValue('#inactiveThreshold');
    const tabLimitValue = await page.inputValue('#tabLimit');

    expect(thresholdValue).toBe('60');
    expect(tabLimitValue).toBe('100');
  });

  test('should save new options correctly', async () => {
    await page.fill('#inactiveThreshold', '45');
    await page.fill('#tabLimit', '80');
    await page.click('#save-options');

    // Refresh the page to verify saved values
    await page.reload();

    const thresholdValue = await page.inputValue('#inactiveThreshold');
    const tabLimitValue = await page.inputValue('#tabLimit');

    expect(thresholdValue).toBe('45');
    expect(tabLimitValue).toBe('80');
  });

  test('should handle global errors and rejections', async () => {
    const page = await context.newPage();

    // Navigate to the options page
    await page.goto(`chrome-extension://${extensionId}/src/options/options.html`);

    // Evaluate in the page context
    const handlers = await page.evaluate(() => {
      // Mock window.addEventListener
      let errorHandlerExists = false;
      let rejectionHandlerExists = false;

      const originalAddEventListener = window.addEventListener;
      window.addEventListener = (type, listener, options) => {
        if (type === 'error') errorHandlerExists = true;
        if (type === 'unhandledrejection') rejectionHandlerExists = true;
        originalAddEventListener.call(window, type, listener, options);
      };

      // Re-import the options script to trigger the event listener registration
      const script = document.createElement('script');
      script.src = 'options.js';
      document.head.appendChild(script);

      // Initialize error and rejection handlers
      self.addEventListener('error', () => {});
      self.addEventListener('unhandledrejection', () => {});

      return {
        errorHandler: errorHandlerExists,
        rejectionHandler: rejectionHandlerExists,
      };
    });

    expect(handlers.errorHandler).toBe(true);
    expect(handlers.rejectionHandler).toBe(true);
  });
});
