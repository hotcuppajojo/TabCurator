// tests/playwright/extensionLoad.test.js
import { test, expect, chromium } from '@playwright/test';
import path from 'path';

test.describe('Extension Load Test', () => {
  let context;

  test.beforeAll(async () => {
    const pathToExtension = path.resolve(__dirname, '../../build/chrome');
    context = await chromium.launchPersistentContext('', {
      headless: false,
      args: [
        `--disable-extensions-except=${pathToExtension}`,
        `--load-extension=${pathToExtension}`
      ]
    });
  });

  test.afterAll(async () => {
    await context.close();
  });

  test('should load the extension in Chrome', async () => {
    // Wait for the service worker to register
    const serviceWorker = await context.waitForEvent('serviceworker', worker =>
      worker.url().includes('src/background/background.js') // Updated path
    );

    if (!serviceWorker) {
      throw new Error('Service worker not found. Extension may not have loaded properly.');
    }

    const extensionId = serviceWorker.url().split('/')[2];
    console.log(`Extension ID: ${extensionId}`);
    expect(extensionId).toBeDefined();
  });
});