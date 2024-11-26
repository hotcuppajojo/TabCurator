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
    const serviceWorker = await context.waitForEvent('serviceworker', {
      predicate: (worker) => worker.url().includes('background/background.js'),
      timeout: 60000 // Increase timeout
    });

    expect(serviceWorker).toBeTruthy();
    expect(serviceWorker.url()).toContain('background/background.js');
  }, 60000); // Increase test timeout
});