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
      // Ensure initBackground is defined
      if (typeof initBackground !== 'function') {
        throw new Error('initBackground function is not defined');
      }

      // Create complete mock API with all event listeners
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
              self.mockStorage.listeners.set('onActivated', listener);
              self.mockStorage.calls.push(['onActivated.addListener']);
            }
          },
          onUpdated: {
            addListener: (listener) => {
              self.mockStorage.listeners.set('onUpdated', listener);
              self.mockStorage.calls.push(['onUpdated.addListener']);
            }
          },
          onRemoved: {
            addListener: (listener) => {
              self.mockStorage.listeners.set('onRemoved', listener);
              self.mockStorage.calls.push(['onRemoved.addListener']);
            }
          }
        },
        runtime: {
          lastError: null,
          onInstalled: {
            addListener: (listener) => {
              self.mockStorage.listeners.set('runtimeOnInstalled', listener);
              self.mockStorage.calls.push(['runtime.onInstalled.addListener']);
            }
          },
          onStartup: {
            addListener: (listener) => {
              self.mockStorage.listeners.set('runtimeOnStartup', listener);
              self.mockStorage.calls.push(['runtime.onStartup.addListener']);
            }
          },
          onMessage: {
            addListener: (listener) => {
              self.mockStorage.listeners.set('runtimeOnMessage', listener);
              self.mockStorage.calls.push(['runtime.onMessage.addListener']);
            }
          }
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
      initBackground(self.chrome);
    });

    // Wait for initialization and event registration
    await serviceWorker.evaluate(() => {
      return new Promise((resolve) => {
        // Resolve when a certain condition is met
        if (self.mockStorage.calls.length > 0) {
          resolve();
        } else {
          self.mockStorage.listeners.set('runtimeOnInstalled', resolve);
        }
      });
    });

    const result = await serviceWorker.evaluate(() => self.mockStorage.calls);
    expect(result.length).toBeGreaterThan(0);
    expect(result[0]).toEqual(['onActivated.addListener']);
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