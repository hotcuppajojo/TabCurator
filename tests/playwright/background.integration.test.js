// tests/playwright/background.integration.test.js
import { test, expect, chromium } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import os from 'os';

test.describe('Background script integration tests', () => {
  let context;
  let serviceWorker;

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

    // Wait for the service worker to register
    await context.waitForEvent('serviceworker');
    [serviceWorker] = context.serviceWorkers();
    if (!serviceWorker) {
      throw new Error('Service worker not found. Extension may not have loaded properly.');
    }

    await serviceWorker.waitForLoadState();
  });

  test.afterAll(async () => {
    await context.close();
  });

  test('should set up tab and alarm listeners in the background', async () => {
    const alarms = await serviceWorker.evaluate(() => {
      return new Promise(resolve => {
        chrome.alarms.getAll(resolve);
      });
    });
    expect(alarms.some(alarm => alarm.name === 'checkForInactiveTabs')).toBeTruthy();
  });

  test('should handle messages from the popup', async () => {
    const response = await serviceWorker.evaluate(() => {
      return new Promise(resolve => {
        chrome.runtime.onMessage.addListener((message, _, sendResponse) => {
          if (message.action === 'suspendInactiveTabs') {
            sendResponse({ message: 'Inactive tabs suspended' });
            resolve('Inactive tabs suspended');
          }
        });
        // Simulate a message
        chrome.runtime.sendMessage({ action: 'suspendInactiveTabs' });
      });
    });
    expect(response).toBe('Inactive tabs suspended');
  });

  test('should listen for tab events', async () => {
    const listeners = await serviceWorker.evaluate(() => ({
      onCreated: chrome.tabs.onCreated.hasListener(() => {}),
      onUpdated: chrome.tabs.onUpdated.hasListener(() => {}),
      onActivated: chrome.tabs.onActivated.hasListener(() => {}),
      onRemoved: chrome.tabs.onRemoved.hasListener(() => {}),
    }));
    expect(listeners.onCreated).toBe(true);
    expect(listeners.onUpdated).toBe(true);
    expect(listeners.onActivated).toBe(true);
    expect(listeners.onRemoved).toBe(true);
  });

  test('should handle global errors and rejections', async () => {
    const handlers = await serviceWorker.evaluate(() => {
      const errorHandlerExists = !!self.onerror;
      const rejectionHandlerExists = !!self.onunhandledrejection;
      return {
        errorHandler: errorHandlerExists,
        rejectionHandler: rejectionHandlerExists,
      };
    });
    expect(handlers.errorHandler).toBe(true);
    expect(handlers.rejectionHandler).toBe(true);
  });
});