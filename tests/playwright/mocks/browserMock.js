// tests/playwright/mocks/browserMock.js

/**
 * Injects the browser mock into the Playwright browser context by defining
 * mock functions directly within the browser environment.
 * @param {import('@playwright/test').Page} page - The Playwright page instance.
 */
const injectBrowserMock = async (page) => {
  await page.addInitScript(() => {
    // Define mock function creator with proper tracking
    function createMockFn(defaultImplementation) {
      function mockFn(...args) {
        mockFn.mock.calls.push([...args]);
        if (typeof mockFn.implementation === 'function') {
          return mockFn.implementation(...args);
        }
        return defaultImplementation?.(...args);
      }
      
      mockFn.mock = { calls: [] };
      mockFn.implementation = null;
      
      return mockFn;
    }

    // Initialize the browser mock with proper implementations
    window.browser = {
      storage: {
        sync: {
          get: createMockFn((keys, callback) => {
            const defaultData = {
              inactiveThreshold: '60',
              tabLimit: '100'
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
            setTimeout(() => {
              if (callback) callback();
            }, 0);
          })
        },
        local: {
          get: createMockFn((keys, callback) => setTimeout(() => callback({}), 0)),
          set: createMockFn((items, callback) => setTimeout(() => callback(), 0)),
          remove: createMockFn((keys, callback) => setTimeout(() => callback(), 0))
        }
      },
      runtime: {
        lastError: null,
        onMessage: { addListener: createMockFn() },
        sendMessage: createMockFn()
      },
      tabs: {
        query: createMockFn(),
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

    // Debug helper
    window.browser._debug = {
      getMockCalls: (path) => {
        const parts = path.split('.');
        let current = window.browser;
        for (const part of parts) {
          current = current?.[part];
        }
        return current?.mock?.calls;
      }
    };
  });
};

module.exports = { injectBrowserMock };