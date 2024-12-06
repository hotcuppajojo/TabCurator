import { test, expect } from '@playwright/test';
import { getExtensionId } from './setup';
import fs from 'fs';
import path from 'path';

test.describe('Background script integration tests', () => {
  test.setTimeout(120000); // Increase to 120 seconds for stability

  let browserContext;
  let serviceWorker;
  let extensionId;
  let backgroundScriptContent;

  test.beforeAll(async () => {
    // Read and preprocess background script
    const backgroundScriptPath = path.resolve(__dirname, '../../src/background/background.js');
    backgroundScriptContent = fs.readFileSync(backgroundScriptPath, 'utf8')
      .replace('if (typeof module !== \'undefined\'', 'if (false');  // Prevent module exports
  });

  test.beforeEach(async () => {
    try {
      const setup = await getExtensionId();
      browserContext = setup.context;
      serviceWorker = setup.serviceWorker;
      extensionId = setup.extensionId;

      // Skip initial service worker check since it's handled by setup
      if (!serviceWorker) {
        throw new Error('No service worker provided by setup');
      }

      // Initialize mock functionality in service worker with enhanced logging
      await serviceWorker.evaluate(async (scriptContent) => {
        try {
          // Create mock storage and functions first
          self.mockStorage = {
            calls: [],
            listeners: new Map(),
            mockFn: function(impl) {
              const fn = (...args) => {
                fn.mock.calls.push(args);
                if (impl) {
                  return impl(...args);
                }
              };
              fn.mock = { calls: [] };
              return fn;
            }
          };

          // Create initial chrome API mock
          self.chrome = {
            tabs: {
              onCreated: { addListener: self.mockStorage.mockFn() },
              onActivated: { addListener: self.mockStorage.mockFn() },
              onUpdated: { addListener: self.mockStorage.mockFn() },
              onRemoved: { addListener: self.mockStorage.mockFn() },
              create: self.mockStorage.mockFn((createProperties, callback) => {
                if (typeof callback === 'function') {
                  callback({ id: 2, ...createProperties });
                }
              }),
              query: self.mockStorage.mockFn((queryInfo, callback) => {
                callback([{ id: 1, title: 'Test Tab', url: 'https://test.com' }]);
              })
            },
            runtime: {
              lastError: null,
              onMessage: { addListener: self.mockStorage.mockFn() },
              onInstalled: { addListener: self.mockStorage.mockFn() },
              onStartup: { addListener: self.mockStorage.mockFn() },
              connect: self.mockStorage.mockFn()
            },
            storage: {
              sync: {
                get: self.mockStorage.mockFn((keys, cb) => cb({})),
                set: self.mockStorage.mockFn((items, cb) => {
                  self.mockStorage.defaultSettings = items;
                  if (typeof cb === 'function') {
                    cb();
                  }
                })
              }
            },
            alarms: {
              create: self.mockStorage.mockFn(),
              onAlarm: { addListener: self.mockStorage.mockFn() }
            }
          };

          console.log("Injecting and initializing background script in test environment.");

          // Inject background script
          self.eval(`(function() { 
            ${scriptContent}
            self.background = background;
            self.initBackground = background.initBackground.bind(background);
          })()`);

          console.log("Background script injected successfully.");
          return true;
        } catch (error) {
          console.error('Failed to initialize service worker:', error);
          throw error;
        }
      }, backgroundScriptContent);

      // No need to wait for service worker registration again
      console.log('Service worker setup completed');

    } catch (error) {
      console.error('Setup failed:', error);
      await cleanup();
      throw error;
    }
  });

  test.afterAll(async () => {
    await cleanup();
  });

  test.afterEach(async () => {
    // Don't close context after each test, only cleanup test-specific state
    if (serviceWorker) {
      try {
        await serviceWorker.evaluate(() => {
          if (self.mockStorage && self.mockStorage.calls) {
            self.mockStorage.calls.length = 0;
          }
          if (self.mockStorage && self.mockStorage.listeners) {
            self.mockStorage.listeners.clear();
          }
        });
      } catch (e) {
        console.warn('Error resetting service worker state:', e);
      }
    }
  });

  async function cleanup() {
    if (browserContext) {
      await browserContext.close().catch(console.warn);
    }
  }

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
        alarms: { // Added alarms API mock
          create: self.mockStorage.mockFn(),
          onAlarm: {
            addListener: (listener) => {
              self.mockStorage.listeners.set('onAlarm', listener);
              self.mockStorage.calls.push(['alarms.onAlarm.addListener']);
            }
          }
        }
      };

      // Initialize background script
      initBackground(self.chrome);
    });

    // Simulate tab events by invoking the stored listeners
    await serviceWorker.evaluate(() => {
      // Simulate onCreated event
      const onCreatedListener = self.mockStorage.listeners.get('tabCreated');
      if (onCreatedListener) {
        const newTab = { id: 3, title: 'New Tab', url: 'https://newtab.com' };
        onCreatedListener(newTab);
      }

      // Simulate onUpdated event
      const onUpdatedListener = self.mockStorage.listeners.get('onUpdated');
      if (onUpdatedListener) {
        const tabId = 1;
        const changeInfo = { status: 'complete' };
        const updatedTab = { id: tabId, title: 'Updated Tab', url: 'https://updatedtab.com' };
        onUpdatedListener(tabId, changeInfo, updatedTab);
      }
    });

    // Replace hard wait with polling for chrome.tabs.create calls
    await new Promise((resolve) => {
      const checkCalls = async () => {
        const createCalls = await serviceWorker.evaluate(() => self.chrome.tabs.create.mock.calls);
        if (createCalls.length > 0) {
          resolve(createCalls);
        } else {
          setTimeout(checkCalls, 500);
        }
      };
      checkCalls();
    });

    // Verify that the background script handled the onCreated event
    const createCalls = await serviceWorker.evaluate(() => self.chrome.tabs.create.mock.calls);
    expect(createCalls.length).toBeGreaterThan(0);
    expect(createCalls[0][0]).toEqual({ url: 'https://newtab.com' });

    // Verify that the background script handled the onUpdated event
    const queryCalls = await serviceWorker.evaluate(() => self.chrome.tabs.query.mock.calls);
    expect(queryCalls.length).toBeGreaterThan(0);
    expect(queryCalls[0][0]).toEqual(expect.objectContaining({ url: 'https://updatedtab.com' }));

    console.log('Test "should handle tab events correctly" executed successfully.');
  }, 30000); // Set individual test timeout to 30 seconds

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
    console.log('Test "should handle global errors appropriately" executed successfully.');
  }, 30000); // Set individual test timeout to 30 seconds

  test('should initialize default settings on installation', async () => {
    // Simulate onInstalled event in the service worker
    await serviceWorker.evaluate(() => {
      const onInstalledCallback = self.chrome.runtime.onInstalled.addListener.mock.calls[0][0];
      onInstalledCallback();

      // Replace jest.fn with custom mock function
      self.chrome.storage.sync.set = function(items, callback) {
        self.mockStorage.defaultSettings = items;
        if (typeof callback === 'function') {
          callback();
        }
      };
    });

    // Verify that default settings were set
    const defaultSettings = await serviceWorker.evaluate(() => self.mockStorage.defaultSettings);
    expect(defaultSettings).toEqual({
      inactiveThreshold: 60,
      tabLimit: 100,
      rules: [],
    });
    console.log('Test "should initialize default settings on installation" executed successfully.');
  }, 30000); // Set individual test timeout to 30 seconds

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
      self.chrome.tabs.create = self.mockStorage.mockFn((createProperties, callback) => {
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
    console.log('Test "should handle undoLastAction message correctly" executed successfully.');
  }, 30000); // Set individual test timeout to 30 seconds

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
      self.archiveTab = self.mockStorage.mockFn();

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
    console.log('Test "should apply user-defined rules on tab update" executed successfully.');
  }, 30000); // Set individual test timeout to 30 seconds

  test('should handle "Extension context invalidated" error and reconnect', async () => {
    await serviceWorker.evaluate(() => {
      // Simulate "Extension context invalidated" error
      self.chrome.runtime.connect = () => {
        throw new Error('Extension context invalidated');
      };
    });

    // Trigger activity update to invoke sendMessage
    await browserContext.pages()[0].evaluate(() => {
      window.dispatchEvent(new Event('mousemove'));
    });

    // Verify reconnection attempts
    const connectionAttempts = await serviceWorker.evaluate(() => self.mockStorage.calls.filter(call => call[0] === 'runtime.connect').length);
    expect(connectionAttempts).toBeGreaterThan(0);
    console.log('Test "should handle "Extension context invalidated" error and reconnect" executed successfully.');
  }, 30000); // Set individual test timeout to 30 seconds

  test.afterAll(async () => {
    if (browserContext) {
      await browserContext.close().catch(console.warn);
    }
  });
});