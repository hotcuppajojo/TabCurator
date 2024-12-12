// tests/playwright/mocks/browserMock.js

/**
 * Injects the browser mock into the Playwright browser context by defining
 * mock functions directly within the browser environment.
 * @param {import('@playwright/test').Page} page - The Playwright page instance.
 */
const injectBrowserMock = async (page) => {
  // Ensure the mock is injected before any other scripts
  await page.addInitScript(() => {
    console.log('Injecting browser mock...');

    // Define mock function creator with proper tracking
    function createMockFn(defaultImplementation) {
      function mockFn(...args) {
        console.log(`Mock function called with args:`, args);
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
      
      mockFn.mock = { calls: [], listeners: [] }; // Added 'listeners' array
      mockFn.implementation = null;
      mockFn.shouldFail = false; // Added to control failure simulation
      
      return mockFn;
    }

    // Replace jest.fn with custom mock function
    function createCustomMockFn(impl) {
      const calls = [];
      const mockFn = (...args) => {
        calls.push(args);
        if (impl) {
          return impl(...args);
        }
      };
      mockFn.mock = { calls };
      mockFn.shouldFail = false; // Control failure simulation
      return mockFn;
    }

    // Initialize the browser mock with proper implementations
    window.browser = {
      storage: {
        sync: {
          get: createMockFn((keys, callback) => {
            console.log('Mock storage.sync.get called with:', keys);
            const defaultData = {
              inactiveThreshold: '60',
              tabLimit: '100',
              rules: [] // Include rules in the default data
            };
            const result = {};
            
            if (Array.isArray(keys)) {
              keys.forEach(key => {
                result[key] = defaultData[key];
              });
            } else if (typeof keys === 'object') {
              Object.keys(keys).forEach(key => {
                result[key] = defaultData[key] || keys[key];
              });
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
        onInstalled: { addListener: createMockFn() } // Add onInstalled mock
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
      }
    };

    // Ensure that alarms API is fully mocked
    window.browser.alarms = {
      create: createMockFn(),
      onAlarm: { addListener: createMockFn() }
    };

    // Remove or comment out any serviceWorkers mocks
    // window.browser.serviceWorkers = {
    //   register: createMockFn(),
    //   // ...other serviceWorker mocks...
    // };

    // Add logging to mock functions
    const originalSendMessage = window.browser.runtime.sendMessage;
    window.browser.runtime.sendMessage = (...args) => {
      console.log('runtime.sendMessage called with:', args);
      return originalSendMessage.apply(this, args);
    };

    // Ensure chrome alias
    window.chrome = window.browser;

    // Add test helpers
    window.testHelpers = {
      resetMocks() {
        console.log('Resetting mocks...');
        // Recursive function to reset mocks
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

  // **Re-enable console event handler for debugging**
  // Attach console event handler for debugging
  page.on('console', msg => {
    for (let i = 0; i < msg.args().length; ++i) {
      msg.args()[i].jsonValue().then(val => {
        console.log(`PAGE LOG: ${val}`);
      });
    }
  });

  // Remove any accidentally inserted lines unrelated to browser mocking.

  // Example:
  // Remove lines like:
  // await page.waitForFunction(() => !!window.popupInstance, { timeout: 5000 });
  // timeout: 5000, // Example reduction from a higher value to 5 seconds
};

module.exports = { injectBrowserMock };