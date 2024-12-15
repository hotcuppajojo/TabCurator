// tests/playwright/mocks/browserMock.js

/**
 * Injects the browser mock into the Playwright browser context by defining
 * mock functions directly within the browser environment.
 * @param {import('@playwright/test').Page} page - The Playwright page instance.
 */
const injectBrowserMock = async (page) => {
  // Inject the mock before other scripts run in the page
  await page.addInitScript(() => {
    console.log('Injecting browser mock...');

    // Allow chrome-extension:// requests without interference
    const originalFetch = window.fetch;
    window.fetch = async (input, init) => {
      if (typeof input === 'string' && input.startsWith('chrome-extension://')) {
        return originalFetch(input, init);
      }
      return originalFetch(input, init);
    };

    // Ensure XMLHttpRequest does not block chrome-extension:// URLs
    const originalXHR = window.XMLHttpRequest;
    window.XMLHttpRequest = function() {
      const xhr = new originalXHR();
      const originalOpen = xhr.open;
      xhr.open = function(method, url, async, user, password) {
        if (url.startsWith('chrome-extension://')) {
          return originalOpen.call(this, method, url, async, user, password);
        }
        return originalOpen.apply(this, arguments);
      };
      return xhr;
    };

    function createMockFn(defaultImplementation) {
      function mockFn(...args) {
        console.log('Mock function called with args:', args);
        mockFn.mock.calls.push([...args]);
        try {
          if (typeof mockFn.implementation === 'function') {
            return mockFn.implementation(...args);
          }
          return defaultImplementation?.(...args);
        } catch (error) {
          console.error('Mock function error:', error);
          throw error;
        }
      }
      
      mockFn.mock = { calls: [], listeners: [] };
      mockFn.implementation = null;
      mockFn.shouldFail = false;
      return mockFn;
    }

    function createCustomMockFn(impl) {
      const calls = [];
      const mockFn = (...args) => {
        calls.push(args);
        if (impl) {
          return impl(...args);
        }
      };
      mockFn.mock = { calls };
      mockFn.shouldFail = false;
      return mockFn;
    }

    // Initialize window.browser mock
    window.browser = {
      storage: {
        sync: {
          get: createMockFn((keys, callback) => {
            console.log('Mock storage.sync.get called with:', keys);
            const defaultData = {
              inactiveThreshold: '60',
              tabLimit: '100',
              rules: []
            };
            const result = {};

            if (Array.isArray(keys)) {
              keys.forEach(key => {
                result[key] = defaultData[key];
              });
            } else if (typeof keys === 'object') {
              for (const k in keys) {
                result[k] = defaultData[k] || keys[k];
              }
            }

            setTimeout(() => callback(result), 0);
          }),
          set: createMockFn((items, callback) => {
            console.log('Mock storage.sync.set called with:', items);
            setTimeout(() => {
              if (callback) callback();
            }, 0);
          })
        },
        local: {
          get: createMockFn((keys, callback) => {
            console.log('Mock storage.local.get called with:', keys);
            setTimeout(() => callback({}), 0);
          }),
          set: createMockFn((items, callback) => {
            console.log('Mock storage.local.set called with:', items);
            setTimeout(() => callback(), 0);
          }),
          remove: createMockFn((keys, callback) => {
            console.log('Mock storage.local.remove called with:', keys);
            setTimeout(() => callback(), 0);
          })
        }
      },
      runtime: {
        lastError: null,
        onMessage: { addListener: createMockFn() },
        sendMessage: createCustomMockFn((message, callback) => {
          if (window.browser.runtime.sendMessage.shouldFail) {
            window.browser.runtime.lastError = { message: 'Simulated error' };
            if (callback) {
              callback();
            }
            return Promise.reject(new Error('Simulated error'));
          }

          window.browser.runtime.lastError = null;
          if (callback) {
            callback({ success: true });
          }
          return Promise.resolve({ success: true });
        }),
        onInstalled: { addListener: createMockFn() },
        onStartup: { addListener: createMockFn() }
      },
      tabs: {
        create: createMockFn((options, callback) => {
          const tab = { id: Date.now(), ...options };
          if (callback) callback(tab);
          return tab;
        }),
        query: createMockFn((queryInfo, callback) => {
          const tabs = [
            { id: 1, title: 'Tab 1' },
            { id: 2, title: 'Tab 2' }
          ];
          if (callback) callback(tabs);
          return tabs;
        }),
        onCreated: { addListener: createMockFn() },
        onUpdated: { addListener: createMockFn() },
        onActivated: { addListener: createMockFn() },
        onRemoved: { addListener: createMockFn() },
        discard: createMockFn(),
        remove: createMockFn()
      },
      alarms: {
        create: createMockFn(),
        onAlarm: { addListener: createMockFn() }
      },
      declarativeNetRequest: {
        updateDynamicRules: createMockFn(),
        getDynamicRules: createMockFn(() => [])
      }
    };

    // Ensure alarms API is fully mocked (redundant as we redefined above, but kept for clarity)
    window.browser.alarms = {
      create: createMockFn(),
      onAlarm: { addListener: createMockFn() }
    };

    // We have already removed serviceWorker mocks

    const originalSendMessage = window.browser.runtime.sendMessage;
    window.browser.runtime.sendMessage = (...args) => {
      console.log('runtime.sendMessage called with:', args);
      return originalSendMessage.apply(window.browser.runtime, args);
    };

    // Ensure chrome alias
    window.chrome = window.browser;

    // Add test helpers
    window.testHelpers = {
      resetMocks() {
        console.log('Resetting mocks...');
        function resetMockCalls(obj) {
          for (const key in obj) {
            if (typeof obj[key] === 'function' && obj[key].mock) {
              obj[key].mock.calls = [];
              obj[key].shouldFail = false;
            } else if (typeof obj[key] === 'object' && obj[key] !== null) {
              resetMockCalls(obj[key]);
            }
          }
        }
        resetMockCalls(window.browser);
        window.browser.runtime.lastError = null;
      },
      getSendMessageCalls() {
        return window.browser?.runtime?.sendMessage?.mock?.calls || [];
      },
      getLastError() {
        return window.browser?.runtime?.lastError;
      }
    };

    // Debug helper
    window.browser._debug = {
      getMockCalls: (path) => {
        console.log(`Getting mock calls for path: ${path}`);
        const parts = path.split('.');
        let current = window.browser;
        for (const part of parts) {
          if (current[part]) {
            current = current[part];
          } else {
            return undefined;
          }
        }
        return current.mock?.calls || [];
      }
    };

    console.log('Browser mock injected successfully.');
  });

  // Setup console event handler for page logs
  page.on('console', msg => {
    for (let i = 0; i < msg.args().length; i++) {
      msg.args()[i].jsonValue().then(val => {
        console.log(`PAGE LOG: ${val}`);
      });
    }
  });

  // Log current pages and service workers for debugging
  const pages = await page.context().pages();
  console.log('Current Pages:', pages.map(p => p.url()));

  const serviceWorkers = await page.context().serviceWorkers();
  console.log('Current Service Workers:', serviceWorkers.map(sw => sw.url()));
};

export { injectBrowserMock };