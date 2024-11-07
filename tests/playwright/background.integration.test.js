// tests/playwright/background.integration.test.js
import { test, expect } from '@playwright/test';

test.describe("Background script integration tests", () => {
  let serviceWorker;

  test.beforeEach(async ({ context }) => {
    context.on('serviceworker', worker => {
      worker.on('console', msg => console.log(`SW LOG: ${msg.text()}`));
      worker.on('pageerror', err => console.error(`SW ERROR: ${err.message}`));
    });

    await context.newPage();
    serviceWorker = await context.waitForEvent('serviceworker');
    if (!serviceWorker) {
      throw new Error('Service Worker not found after maximum retries.');
    }
  });

  test("should set up tab and alarm listeners in the background", async () => {
    const alarms = await serviceWorker.evaluate(async () => {
      return await new Promise(resolve => {
        chrome.alarms.getAll(alarms => resolve(alarms));
      });
    });

    expect(alarms.some(alarm => alarm.name === 'checkForInactiveTabs')).toBeTruthy();
  });

  test("should handle messages from the popup", async () => {
    const response = await serviceWorker.evaluate(async () => {
      return await new Promise(resolve => {
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
          if (message.action === "suspendInactiveTabs") {
            resolve({ message: "Inactive tabs suspended" });
          }
        });
      });
    });

    expect(response.message).toBe("Inactive tabs suspended");
  });

  test("should listen for tab events", async () => {
    const listeners = await serviceWorker.evaluate(() => ({
      onCreated: chrome.tabs.onCreated.hasListeners(),
      onUpdated: chrome.tabs.onUpdated.hasListeners(),
      onActivated: chrome.tabs.onActivated.hasListeners(),
      onRemoved: chrome.tabs.onRemoved.hasListeners(),
    }));

    expect(listeners.onCreated).toBe(true);
    expect(listeners.onUpdated).toBe(true);
    expect(listeners.onActivated).toBe(true);
    expect(listeners.onRemoved).toBe(true);
  });

  test("should handle global errors and rejections", async () => {
    const handlers = await serviceWorker.evaluate(() => ({
      errorHandler: self.listeners('error').length > 0,
      rejectionHandler: self.listeners('unhandledrejection').length > 0,
    }));

    expect(handlers.errorHandler).toBe(true);
    expect(handlers.rejectionHandler).toBe(true);
  });
});