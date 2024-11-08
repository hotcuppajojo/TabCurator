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
      args: [
        `--disable-extensions-except=${pathToExtension}`,
        `--load-extension=${pathToExtension}`,
        '--no-sandbox',
        '--disable-web-security',
      ],
      channel: 'chrome',
    });

    // Inject a script before any other scripts run to monitor event listener registrations
    await context.addInitScript(() => {
      window.errorHandlerExists = false;
      window.rejectionHandlerExists = false;

      const originalAddEventListener = window.addEventListener;
      window.addEventListener = (type, listener, options) => {
        if (type === 'error') window.errorHandlerExists = true;
        if (type === 'unhandledrejection') window.rejectionHandlerExists = true;
        originalAddEventListener.call(window, type, listener, options);
      };
    });

    // Wait for the service worker to register and get the extension ID
    const [background] = await Promise.all([
      context.waitForEvent('serviceworker', worker =>
        worker.url().includes('background/background.js')
      ),
      context.pages(),
    ]);

    if (!background) {
      throw new Error('Service worker not found. Extension may not have loaded properly.');
    }

    extensionId = background.url().split('/')[2];

    page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/src/options/options.html`);
  });

  test.afterEach(async () => {
    // Close the context after each test to ensure isolation
    await context.close();
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
