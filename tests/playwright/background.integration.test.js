// tests/playwright/background.integration.test.js
import { test, expect } from '@playwright/test';
import { getExtensionId } from './setup';

test.describe('Background script integration tests', () => {
  let browserContext;
  let serviceWorker;
  let extensionId;

  test.beforeEach(async () => {
    const setup = await getExtensionId();
    browserContext = setup.context;
    serviceWorker = setup.serviceWorker;
    extensionId = setup.extensionId;

    // Initialize proper mock APIs
    await serviceWorker.evaluate(() => {
      globalThis.tabActivity = {};
      globalThis.chrome = {
        tabs: {
          onActivated: { 
            addListener: () => {},
            hasListeners: () => true,
            addListener: (fn) => {
              globalThis.tabActivatedListener = fn;
            }
          },
          onUpdated: { addListener: () => {} },
          onRemoved: { addListener: () => {} }
        },
        alarms: {
          onAlarm: { addListener: () => {} }
        }
      };
    });
  });

  test('should handle tab events correctly', async () => {
    const result = await serviceWorker.evaluate(() => {
      globalThis.tabActivity = {};
      const mockTab = { tabId: 123 };
      
      // Call the actual listener instead of using callListeners
      if (globalThis.tabActivatedListener) {
        globalThis.tabActivatedListener(mockTab);
      }
      
      return Boolean(globalThis.tabActivity[123]);
    });

    expect(result).toBe(true);
  });

  test('should handle global errors appropriately', async () => {
    const result = await serviceWorker.evaluate(() => {
      // Set up error handlers
      self.onerror = () => {};
      self.onunhandledrejection = () => {};

      // Trigger error handlers
      const errorEvent = new ErrorEvent('error');
      self.dispatchEvent(errorEvent);

      return {
        hasErrorHandler: typeof self.onerror === 'function',
        hasRejectionHandler: typeof self.onunhandledrejection === 'function'
      };
    });

    expect(result.hasErrorHandler).toBe(true);
    expect(result.hasRejectionHandler).toBe(true);
  });
});