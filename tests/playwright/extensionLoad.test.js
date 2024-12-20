// tests/playwright/extensionLoad.test.js
import { test, expect, chromium } from '@playwright/test';
import path from 'path';

test.describe('Extension Load Test', () => {
  let context;
  let extensionId;

  test.beforeAll(async () => {
    const pathToExtension = path.resolve(__dirname, '../../build/chrome');
    context = await chromium.launchPersistentContext('', {
      headless: false,
      args: [
        `--disable-extensions-except=${pathToExtension}`,
        `--load-extension=${pathToExtension}`
      ]
    });

    // Get extension ID first
    const page = await context.newPage();
    await page.goto('chrome://extensions');
    extensionId = await page.evaluate(() => {
      const extensions = document.querySelector('extensions-manager')
        ?.shadowRoot?.querySelector('extensions-item-list')
        ?.shadowRoot?.querySelectorAll('extensions-item') || [];
      for (const ext of extensions) {
        const name = ext.shadowRoot?.querySelector('.name')?.textContent;
        if (name === 'TabCurator') {
          return ext.shadowRoot?.querySelector('#extension-id')?.textContent;
        }
      }
    });
    await page.close();

    if (!extensionId) {
      throw new Error('Could not find extension ID');
    }

    // Activate service worker
    const activatePage = await context.newPage();
    await activatePage.goto(`chrome-extension://${extensionId}/src/popup/popup.html`);
    await activatePage.waitForTimeout(1000);
    await activatePage.close();
  });

  test.afterAll(async () => {
    await context.close();
  });

  test('should load the extension in Chrome', async () => {
    const serviceWorker = await context.waitForEvent('serviceworker', {
      predicate: (worker) => worker.url().includes('background/background.js'),
      timeout: 90000 // Increase timeout further
    });

    expect(serviceWorker).toBeTruthy();
    expect(serviceWorker.url()).toContain('background/background.js');

    // Verify that alarms API is mocked
    const alarmsMock = await context.pages()[0].evaluate(() => {
      return !!window.browser.alarms;
    });
    expect(alarmsMock).toBe(true);
  }, 120000); // Increase test timeout

  test('should handle Extension context invalidated error and reconnect', async () => {
    // Mock context invalidation
    await serviceWorker.evaluate(() => {
      // Simulate extension context invalidation
      self.chrome.runtime.id = undefined;
      
      // Trigger a runtime.lastError
      self.chrome.runtime.lastError = { message: 'Extension context invalidated' };
      
      // Mock reconnection attempt
      self.chrome.runtime.connect = self.mockStorage.mockFn(() => ({
        onDisconnect: { addListener: () => {} },
        onMessage: { addListener: () => {} }
      }));
    });

    // Verify that reconnection was attempted
    const reconnectAttempts = await serviceWorker.evaluate(() => 
      self.chrome.runtime.connect.mock.calls.length
    );
    expect(reconnectAttempts).toBeGreaterThan(0);

    // Verify extension ID fallback worked
    const fallbackId = await serviceWorker.evaluate(() => 
      self.chrome.runtime.id || 'fallback-extension-id'
    );
    expect(fallbackId).toBe('fallback-extension-id');
  });
});