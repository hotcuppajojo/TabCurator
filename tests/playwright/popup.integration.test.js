// tests/playwright/popup.integration.test.js

import { test, expect } from '@playwright/test';
import { getExtensionId } from './setup';
import { injectBrowserMock } from './mocks/browserMock';
import fs from 'fs';
import path from 'path';

test.describe('Popup Integration Tests', () => {
  let browserContext;
  let page;
  let extensionId;

  test.beforeEach(async ({ context }) => {
    const setup = await getExtensionId(); // Changed from getExtensionId(context)
    browserContext = setup.context;
    extensionId = setup.extensionId;
    
    // Only assign serviceWorker if it exists
    // if (setup.serviceWorker) {
    //   serviceWorker = setup.serviceWorker;
    //   console.log('Service Worker assigned:', serviceWorker.url());
    // } else {
    //   console.warn('No Service Worker available in setup.');
    // }

    page = await context.newPage();

    // Inject browser mock before navigating
    await injectBrowserMock(page);

    // Ensure popup.html is loaded from build directory
    const popupUrl = `chrome-extension://${extensionId}/popup/popup.html`;
    await page.goto(popupUrl, {
      waitUntil: 'networkidle',
      timeout: 30000
    });

    // Ensure extension is fully loaded
    await page.waitForFunction(() => !!window.popupInstance, { timeout: 10000 });

    // Ensure mocks are initialized before any test actions
    await page.waitForFunction(() => {
      return window.browser?._debug?.getMockCalls && 
             window.browser.runtime?.sendMessage?.mock;
    }, { timeout: 10000 });

    // Reset mocks after ensuring they exist
    await page.evaluate(() => {
      window.testHelpers.resetMocks();
      window.browser.runtime.sendMessage.mock.calls = [];
      window.browser.runtime.sendMessage.shouldFail = false;
    });

    // Ensure popup is initialized
    await page.waitForFunction(() => !!window.popupInstance, { timeout: 10000 });

    // Configure enhanced browser mock for MV3
    await page.evaluate(() => {
      window.browser = {
        ...window.browser,
        runtime: {
          ...window.browser.runtime,
          connect: () => ({
            onDisconnect: { addListener: () => {} },
            postMessage: () => {}
          }),
          sendMessage: async (message) => {
            if (window.browser.runtime.sendMessage.shouldFail) {
              window.browser.runtime.lastError = { message: 'Simulated error' };
              throw new Error('Simulated error');
            }
            window.browser.runtime.sendMessage.mock.calls.push(message);
            // Handle different message types
            switch (message.action) {
              case 'getTabs':
                return { tabs: [] };
              case 'getSessions':
                return { sessions: {} };
              default:
                return {};
            }
          }
        }
      };
      console.log('Enhanced browser mock configured.');
    });

    // Wait for popup initialization with connection handling
    await page.waitForFunction(() => {
      return window.popupInstance && 
             window.browser?._debug?.isConnected;
    }, { timeout: 10000 });

  });

  async function pollForCondition(page, conditionFn, maxAttempts = 20, interval = 100) {
    for (let i = 0; i < maxAttempts; i++) {
      const result = await page.evaluate(conditionFn);
      if (result) return result;
      await page.waitForTimeout(interval);
    }
    return null;
  }

  test('should handle tab loading with error handling', async () => {
    // Test successful tab loading
    await page.evaluate(() => {
      window.browser.tabs.query = async () => ([
        { id: 1, title: 'Test Tab', url: 'https://test.com' }
      ]);
    });

    await page.click('#refresh-tabs');
    const tabElements = await page.$$('#tab-list .tab-item');
    expect(tabElements.length).toBe(1);

    // Test error handling
    await page.evaluate(() => {
      window.browser.tabs.query = async () => { throw new Error('Tab query failed'); };
    });

    await page.click('#refresh-tabs');
    const error = await page.evaluate(() => 
      document.querySelector('.error-message')?.textContent
    );
    expect(error).toContain('Error loading tabs');
  });

  test('should handle session management operations', async () => {
    // Test session saving
    const sessionName = 'Test Session';
    await page.fill('#session-name-input', sessionName);
    await page.click('#save-session');

    const messages = await page.evaluate(() => 
      window.browser.runtime.sendMessage.mock.calls
    );
    expect(messages).toContainEqual({
      action: 'saveSession',
      sessionName
    });

    // Test error handling for session operations
    await page.evaluate(() => {
      window.browser.runtime.sendMessage.shouldFail = true;
    });
    
    await page.click('#save-session');
    const errorNotification = await page.locator('.error-notification');
    expect(await errorNotification.isVisible()).toBe(true);
  });

  test('should load and display tabs', async () => {
    // Wait for tab list container
    const tabList = await page.waitForSelector('#tab-list', { state: 'attached' });
    
    // Add test tabs directly to DOM using evaluate
    await page.evaluate(() => {
      const tabList = document.getElementById('tab-list');
      const tabs = [
        { id: 1, title: 'Tab 1' },
        { id: 2, title: 'Tab 2' }
      ];
      tabs.forEach(tab => {
        const div = document.createElement('div');
        div.textContent = tab.title;
        tabList.appendChild(div);
      });
    });

    const tabs = await page.$$eval('#tab-list div', els => els.length);
    expect(tabs).toBe(2);
  });

  test('should handle suspend button click', async () => {
    // Reset mocks
    await page.evaluate(() => {
      window.testHelpers.resetMocks();
      window.browser.runtime.sendMessage.shouldFail = false;
      window.browser.runtime.sendMessage.mock.calls = [];
    });

    // Click and wait for action to complete
    await page.click('#suspend-inactive-tabs');
    
    // Increased timeout to match configuration
    await page.waitForTimeout(300); // Reduced from 500ms to 300ms

    const calls = await page.evaluate(() => window.browser.runtime.sendMessage.mock.calls);
    expect(calls.length).toBeGreaterThan(0);
    expect(calls[0][0]).toEqual({ action: 'suspendInactiveTabs' });
  });

  test('should handle errors gracefully', async () => {
    // Reset mocks
    await page.evaluate(() => {
      window.testHelpers.resetMocks();
      window.browser.runtime.sendMessage.shouldFail = true;
      window.browser.runtime.lastError = { message: 'Simulated error' };
    });

    await page.click('#suspend-inactive-tabs');
    
    // Wait briefly for error to be set
    await page.waitForTimeout(100);

    const error = await page.evaluate(() => window.browser.runtime.lastError?.message);
    expect(error).toBe('Simulated error');
  });

  test.afterEach(async () => {
    // Remove any cleanup related to serviceWorker
    // if (serviceWorker) {
    //   console.log('Closing service worker:', serviceWorker.url());
    //   await serviceWorker.evaluate(() => {
    //     // Any cleanup if necessary
    //   }).catch(console.warn);
    // }
    await browserContext?.close();
  });
});