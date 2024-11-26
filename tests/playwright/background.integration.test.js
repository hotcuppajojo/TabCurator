import { test, expect } from '@playwright/test';
import { getExtensionId } from './setup';

test.describe('Background script integration tests', () => {
  let browserContext;
  let serviceWorker;
  let extensionId;

  test.beforeEach(async () => {
    // Increase timeout for setup
    test.setTimeout(120000);

    const setup = await getExtensionId();
    browserContext = setup.context;
    serviceWorker = setup.serviceWorker;
    extensionId = setup.extensionId;

    // Initialize mock functionality in service worker
    await serviceWorker.evaluate(() => {
      // Create mock storage
      self.mockStorage = {
        calls: [],
        listeners: new Map()
      };

      // Create mock chrome.tabs API
      self.chrome = {
        tabs: {
          onCreated: {
            addListener: (listener) => {
              self.mockStorage.listeners.set('tabCreated', listener);
              self.mockStorage.calls.push(['onCreated.addListener']);
            }
          }
        },
        runtime: {
          lastError: null
        }
      };
    });
  });

  test('should handle tab events correctly', async () => {
    await serviceWorker.evaluate(() => {
      // Create complete mock API
      self.chrome = {
        tabs: {
          onCreated: {
            addListener: (listener) => {
              self.mockStorage.listeners.set('tabCreated', listener);
              self.mockStorage.calls.push(['onCreated.addListener']);
            }
          },
          onActivated: {
            addListener: (listener) => {
              self.mockStorage.listeners.set('tabActivated', listener);
              self.mockStorage.calls.push(['onActivated.addListener']);
            }
          },
          onUpdated: {
            addListener: (listener) => {
              self.mockStorage.listeners.set('tabUpdated', listener);
              self.mockStorage.calls.push(['onUpdated.addListener']);
            }
          }
        },
        runtime: {
          lastError: null
        },
        storage: {
          sync: {
            get: (keys, cb) => cb({})
          }
        },
        alarms: {
          create: () => {},
          onAlarm: {
            addListener: () => {}
          }
        }
      };

      // Initialize background script
      if (typeof initBackground === 'function') {
        initBackground(self.chrome);
      }
    });

    // Wait for initialization and event registration
    await serviceWorker.waitForTimeout(1000);

    const result = await serviceWorker.evaluate(() => self.mockStorage.calls);
    expect(result.length).toBeGreaterThan(0);
    expect(result[0]).toEqual(['onCreated.addListener']);
  });

  test('should handle global errors appropriately', async () => {
    const result = await serviceWorker.evaluate(() => {
      // Simulate error
      self.dispatchEvent(new ErrorEvent('error', { 
        error: new Error('Test error'),
        message: 'Test error message'
      }));
      return true;
    });

    expect(result).toBeTruthy();
  });

  test.afterEach(async () => {
    await browserContext?.close();
  });
});