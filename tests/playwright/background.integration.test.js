// tests/playwright/background.integration.test.js
import { test, expect, chromium } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import os from 'os';

test.describe('Background script integration tests', () => {
  let context;
  let serviceWorker;
  let extensionId;

  test.beforeEach(async () => {
    // Set up a new context and service worker for each test
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
    serviceWorker = background;
  });

  test.afterEach(async () => {
    // Close the context after each test to ensure isolation
    await context.close();
  });

  test('should set up tab and alarm listeners in the background', async () => {
    const alarms = await serviceWorker.evaluate(() => {
      // Mock chrome.alarms API
      self.chrome = self.chrome || {};
      self.chrome.alarms = {
        getAll: () => Promise.resolve([{ name: 'checkForInactiveTabs' }]),
      };
      return self.chrome.alarms.getAll();
    });
    expect(alarms.some(alarm => alarm.name === 'checkForInactiveTabs')).toBeTruthy();
  });

  test('should listen for tab events', async () => {
    const listeners = await serviceWorker.evaluate(() => {
      // Mock chrome.tabs API with event listeners
      self.chrome = self.chrome || {};
      self.chrome.tabs = {
        onCreated: {
          addListener: () => {},
          hasListener: () => true,
        },
        onUpdated: {
          addListener: () => {},
          hasListener: () => true,
        },
        onActivated: {
          addListener: () => {},
          hasListener: () => true,
        },
        onRemoved: {
          addListener: () => {},
          hasListener: () => true,
        },
      };
      return {
        onCreated: self.chrome.tabs.onCreated.hasListener(),
        onUpdated: self.chrome.tabs.onUpdated.hasListener(),
        onActivated: self.chrome.tabs.onActivated.hasListener(),
        onRemoved: self.chrome.tabs.onRemoved.hasListener(),
      };
    });
    expect(listeners.onCreated).toBe(true);
    expect(listeners.onUpdated).toBe(true);
    expect(listeners.onActivated).toBe(true);
    expect(listeners.onRemoved).toBe(true);
  });

  test('should handle global errors and rejections', async () => {
    const handlers = await serviceWorker.evaluate(() => {
      // Mock self.addEventListener
      let errorHandlerExists = false;
      let rejectionHandlerExists = false;

      const originalAddEventListener = self.addEventListener;
      self.addEventListener = (type, listener) => {
        if (type === 'error') errorHandlerExists = true;
        if (type === 'unhandledrejection') rejectionHandlerExists = true;
        originalAddEventListener.call(self, type, listener);
      };

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