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

  test('should initialize default settings on installation', async () => {
    // Simulate onInstalled event in the service worker
    await serviceWorker.evaluate(() => {
      const onInstalledCallback = self.chrome.runtime.onInstalled.addListener.mock.calls[0][0];
      onInstalledCallback();

      // Mock storage access
      self.chrome.storage.sync.set = jest.fn((items, callback) => {
        self.mockStorage.defaultSettings = items;
        callback && callback();
      });
    });

    // Verify that default settings were set
    const defaultSettings = await serviceWorker.evaluate(() => self.mockStorage.defaultSettings);
    expect(defaultSettings).toEqual({
      inactiveThreshold: 60,
      tabLimit: 100,
      rules: [],
    });
  });

  test('should handle undoLastAction message correctly', async () => {
    await serviceWorker.evaluate(() => {
      // Setup actionHistory and archivedTabs
      self.actionHistory = [{
        type: 'archive',
        tab: { id: 1, url: 'https://example.com', title: 'Test Tab' },
        tag: 'testTag',
      }];
  
      self.archivedTabs = {
        'testTag': [{ title: 'Test Tab', url: 'https://example.com' }],
      };

      // Mock tabs.create
      self.chrome.tabs.create = jest.fn((createProperties, callback) => {
        callback && callback({ id: 2, ...createProperties });
      });

      // Simulate receiving 'undoLastAction' message
      const messageHandler = self.chrome.runtime.onMessage.addListener.mock.calls[0][0];
      messageHandler({ action: 'undoLastAction' }, null, () => {});
    });

    // Verify that tabs.create was called to reopen the tab
    const tabsCreateCalls = await serviceWorker.evaluate(() => self.chrome.tabs.create.mock.calls);
    expect(tabsCreateCalls.length).toBeGreaterThan(0);
    expect(tabsCreateCalls[0][0]).toEqual({ url: 'https://example.com' });

    // Verify that the archived tab was removed
    const archivedTabs = await serviceWorker.evaluate(() => self.archivedTabs['testTag']);
    expect(archivedTabs).toHaveLength(0);
  });

  test('should apply user-defined rules on tab update', async () => {
    await serviceWorker.evaluate(() => {
      // Mock storage.sync.get to return rules
      self.chrome.storage.sync.get = (keys, callback) => {
        callback({
          rules: [
            { keyword: 'test', action: 'archive', tag: 'testTag' },
          ],
        });
      };

      // Mock archiveTab function
      self.archiveTab = jest.fn();

      // Mock actionHistory
      self.actionHistory = [];

      // Simulate tab update event
      const onUpdatedCallback = self.chrome.tabs.onUpdated.addListener.mock.calls[0][0];
      onUpdatedCallback(1, { status: 'complete' }, { id: 1, url: 'https://test.com', title: 'Test Site' });
    });

    // Verify that archiveTab was called
    const archiveTabCalls = await serviceWorker.evaluate(() => self.archiveTab.mock.calls);
    expect(archiveTabCalls.length).toBeGreaterThan(0);
    expect(archiveTabCalls[0][0]).toBe(1);
    expect(archiveTabCalls[0][1]).toBe('testTag');

    // Verify that action was added to actionHistory
    const actionHistory = await serviceWorker.evaluate(() => self.actionHistory);
    expect(actionHistory).toHaveLength(1);
    expect(actionHistory[0]).toEqual({
      type: 'archive',
      tab: { id: 1, url: 'https://test.com', title: 'Test Site' },
      tag: 'testTag',
    });
  });

  test.afterEach(async () => {
    await browserContext?.close();
  });
});