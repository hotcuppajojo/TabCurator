require('@jest/globals');
const { chromium } = require('@playwright/test');
const mockBrowser = require('./tests/jest/mocks/browserMock.js');

// Initialize browser mock with reset functionality
if (!mockBrowser._reset) {
  mockBrowser._reset = function() {
    Object.keys(this).forEach(key => {
      if (this[key] && typeof this[key] === 'object') {
        Object.keys(this[key]).forEach(method => {
          if (typeof this[key][method]?.mockReset === 'function') {
            this[key][method].mockReset();
          }
        });
      }
    });
  };
}

// Update browser mock cleanup
if (!mockBrowser._reset) {
  mockBrowser._reset = function() {
    // Clear all mock properties
    Object.keys(this).forEach(key => {
      if (this[key] && typeof this[key] === 'object') {
        // Clear event listeners
        if (this[key].listeners) {
          this[key].listeners.clear();
        }
        // Reset mock functions
        Object.keys(this[key]).forEach(method => {
          if (typeof this[key][method]?.mockReset === 'function') {
            this[key][method].mockReset();
          }
        });
      }
    });
    // Clear any stored references
    this._ports = [];
    this._connections = new Set();
  };
}

// Set up global browser mock
global.browser = mockBrowser;

// Add this at the top of the file
const activeTimers = new Set();

// Override global setTimeout and setInterval to track timers
const originalSetTimeout = global.setTimeout;
global.setTimeout = function(fn, delay, ...args) {
  const timer = originalSetTimeout(fn, delay, ...args);
  activeTimers.add(timer);
  return timer;
};

const originalSetInterval = global.setInterval;
global.setInterval = function(fn, delay, ...args) {
  const interval = originalSetInterval(fn, delay, ...args);
  activeTimers.add(interval);
  return interval;
};

// Override clearTimeout and clearInterval to remove timers from activeTimers
const originalClearTimeout = global.clearTimeout;
global.clearTimeout = function(timer) {
  activeTimers.delete(timer);
  originalClearTimeout(timer);
};

const originalClearInterval = global.clearInterval;
global.clearInterval = function(interval) {
  activeTimers.delete(interval);
  originalClearInterval(interval);
};

// Single beforeEach hook for test setup
beforeEach(async () => {
  // Clear memory before each test
  if (global.gc) {
    try {
      global.gc();
    } catch (e) {
      console.warn('Unable to force garbage collection');
    }
  }
  
  jest.clearAllMocks();
  jest.clearAllTimers();
  
  // Reset browser mock if available
  if (global.browser?._reset) {
    try {
      await global.browser._reset();
    } catch (err) {
      console.warn('Error resetting browser mock:', err);
    }
  }

  // Clear all active timers
  activeTimers.forEach(timer => {
    try {
      originalClearTimeout(timer);
      originalClearInterval(timer);
    } catch (e) {
      console.warn('Error clearing timer:', e);
    }
  });
  activeTimers.clear();
});

// Polyfill setImmediate and clearImmediate
if (typeof setImmediate === 'undefined') {
  const { setImmediate, clearImmediate } = require('timers');
  global.setImmediate = setImmediate;
  global.clearImmediate = clearImmediate;
}

// Mock console methods
global.console = {
  ...global.console,
  error: jest.fn(),
  warn: jest.fn(),
  log: jest.fn()
};

// Use real timers to prevent timers from keeping Jest open
jest.useRealTimers();

// Mock global `self` for Service Worker with proper jest mock functions
global.self = global; // Ensure 'self' refers to the global object
global.self.addEventListener = jest.fn();

// Mock requestAnimationFrame to simulate frame updates
global.requestAnimationFrame = (callback) => {
  setTimeout(callback, 0);
};

// Mock global alert to capture alert calls in tests
global.alert = jest.fn();

// Mock global prompt
global.prompt = jest.fn(() => "Morning Session");

// Set NODE_ENV to 'development' for detailed React error messages
process.env.NODE_ENV = 'development';

// Force development mode for React
process.env.NODE_ENV = 'development';

// Add root element for React rendering
document.body.innerHTML = `
  <div id="root"></div>
  ${document.body.innerHTML}
`;

// Mock createRange for React testing
document.createRange = () => ({
  setStart: () => {},
  setEnd: () => {},
  commonAncestorContainer: {
    nodeName: 'BODY',
    ownerDocument: document,
  },
});

// Update document body with all required elements
document.body.innerHTML = `
  <div id="root"></div>
  <input id="currentTabId" />
  <input id="tagInput" />
  <button id="viewArchivesButton"></button>
  <button id="saveSessionButton"></button>
  <button id="viewSessionsButton"></button>
  <button id="archiveTabButton"></button>
  <button id="suspendButton"></button>
  <button id="addRuleButton"></button>
  <div id="save-success"></div>
  <button id="saveRulesButton">Save Rules</button>
  <ul id="archiveList"></ul>
  <ul id="sessionsList"></ul>
  <ul id="rulesList">
    <li class="rule-item">
      <input class="rule-condition" type="text" />
      <input class="rule-action" type="text" />
      <button class="delete-rule">Delete</button>
    </li>
  </ul>
`;

// Ensure `browser` is correctly mocked globally
Object.assign(global, { browser: mockBrowser });

// Mock page.goto for chrome-extension URLs
beforeAll(() => {
  const extensionMock = require('./tests/jest/mocks/extensionMock.js');
  
  global.page.goto = jest.fn((url, options) => {
    if (url.startsWith('chrome-extension://')) {
      return extensionMock.navigate(url);
    }
    return Promise.resolve();
  });
});

// Optimize afterEach cleanup
afterEach(async () => {
  // Clear any pending microtasks first
  await new Promise(resolve => setImmediate(resolve));
  
  // Clear active timers
  activeTimers.forEach(timer => {
    try {
      originalClearTimeout(timer);
      originalClearInterval(timer);
    } catch (e) {
      console.warn('Error clearing timer:', e);
    }
  });
  activeTimers.clear();

  // Run cleanup in order
  if (global._cleanup) {
    await global._cleanup();
  }

  if (global.browser?._connections) {
    global.browser._connections.clear();
  }

  // Force garbage collection
  if (global.gc) {
    try {
      global.gc();
    } catch (e) {
      console.warn('Unable to force garbage collection');
    }
  }

  // Ensure all promises are resolved
  await Promise.resolve();
});

// Import service-worker-mock with enhanced functionality
const makeServiceWorkerEnv = () => {
  const listeners = new Map();
  return {
    // Basic service worker APIs
    addEventListener: jest.fn((type, listener) => {
      listeners.set(type, listener);
    }),
    removeEventListener: jest.fn(),
    skipWaiting: jest.fn(),
    clients: {
      claim: jest.fn(),
      matchAll: jest.fn().mockResolvedValue([])
    },
    registration: {
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      pushing: false,
      active: true
    },
    
    // Cache API
    caches: {
      open: jest.fn().mockResolvedValue({
        put: jest.fn(),
        match: jest.fn(),
        delete: jest.fn()
      }),
      keys: jest.fn().mockResolvedValue([]),
      delete: jest.fn().mockResolvedValue(true)
    },

    // Storage API
    storage: {
      sync: {
        get: jest.fn().mockImplementation(() => Promise.resolve({
          inactiveThreshold: 45,
          tabLimit: 75,
          rules: []
        })),
        set: jest.fn().mockResolvedValue(undefined)
      }
    },
    
    // Add trigger helper for testing
    trigger: async (eventType, ...args) => {
      const listener = listeners.get(eventType);
      if (listener) {
        return await listener(...args);
      }
    },
    
    // Add listeners map
    listeners,
    
    // Enhanced cleanup
    _cleanup: async () => {
      listeners.clear();
      jest.clearAllMocks();
      
      // Clear any pending promises
      await Promise.resolve();
      
      // Clear any running timers
      jest.clearAllTimers();
    }
  };
};

// Export the makeServiceWorkerEnv function
global.makeServiceWorkerEnv = makeServiceWorkerEnv;

// Modify the Jest setup
beforeEach(() => {
  jest.useFakeTimers();
  
  // Reset all mocks
  jest.clearAllMocks();
  
  // Reset browser mock
  if (global.browser?._reset) {
    global.browser._reset();
  }
  
  // Clear any pending timers
  jest.clearAllTimers();
  
  const serviceWorkerEnv = makeServiceWorkerEnv();

  // Make service worker methods enumerable
  Object.keys(serviceWorkerEnv).forEach(key => {
    Object.defineProperty(serviceWorkerEnv, key, {
      value: serviceWorkerEnv[key],
      enumerable: true,
      configurable: true,
      writable: true
    });
  });

  Object.assign(global, serviceWorkerEnv);

  jest.resetModules();
  
  // Safely reset browser mock if available
  if (global.browser?._reset) {
    global.browser._reset();
  }
});

// Add global cleanup
afterAll(async () => {
  if (playwrightBrowser) {
    try {
      await Promise.all([
        page?.close().catch(console.warn),
        context?.close().catch(console.warn),
        playwrightBrowser?.close().catch(console.warn)
      ]);
    } catch (e) {
      console.warn('Error closing Playwright resources:', e);
    }
  }
  
  // Clear all remaining timers
  jest.clearAllTimers();
  jest.clearAllMocks();
  
  // Final garbage collection
  if (global.gc) global.gc();
});

// Ensure proper isolation and reset of mocks between tests to prevent cross-test interference.
beforeEach(async () => {
  // Reset all mocks before each test
  jest.clearAllMocks();
  jest.clearAllTimers();
  if (global.browser && typeof global.browser._reset === 'function') {
    global.browser._reset();
  }

  // Ensure no other assignments to global.browser occur here or in tests

  // Ensure service worker mocks are correctly reset
  if (global.makeServiceWorkerEnv) {
    const serviceWorkerEnv = global.makeServiceWorkerEnv();
    Object.assign(global, serviceWorkerEnv);
  }

  // Reset memory monitoring
  if (global.memoryUsage) {
    global.memoryUsage.reset();
  }

  // Ensure all pending promises are resolved
  await Promise.resolve();
});

// Keep the global setTimeout/clearTimeout implementation
const timeouts = new Set();
// const originalSetTimeout = global.setTimeout;
// const originalClearTimeout = global.clearTimeout;

global.setTimeout = function(fn, delay) {
  const id = originalSetTimeout(fn, delay);
  timeouts.add(id);
  return id;
};

global.clearTimeout = function(id) {
  timeouts.delete(id);
  originalClearTimeout(id);
};

let playwrightBrowser;
let context;
let page;

// Only initialize Playwright if explicitly requested
if (process.env.USE_PLAYWRIGHT) {
  beforeAll(async () => {
    if (process.env.USE_PLAYWRIGHT) {
      playwrightBrowser = await chromium.launch();
      context = await playwrightBrowser.newContext();
      page = await context.newPage();
      global.page = page;
    }
  });

  afterAll(async () => {
    if (playwrightBrowser) {
      await page?.close();
      await context?.close();
      await playwrightBrowser?.close();
    }
  });
}

afterEach(async () => {
  // Service worker cleanup
  if (global._cleanup) {
    await global._cleanup();
  }
  
  // Clear timeouts and intervals
  activeTimers.forEach(timer => {
    originalClearTimeout(timer);
    originalClearInterval(timer);
  });
  activeTimers.clear();

  // Reset mocks
  jest.clearAllMocks();
  jest.clearAllTimers();

  // Ensure all promises are resolved
  await Promise.resolve();
});

// Ensure proper cleanup on exit
process.on('exit', () => {
  if (global._cleanup) {
    global._cleanup();
  }
  jest.clearAllTimers();
});

// Ensure all asynchronous operations are completed before tests proceed
afterEach(async () => {
  await Promise.resolve();
  jest.clearAllMocks();
  jest.clearAllTimers();
});

beforeEach(() => {
  jest.useFakeTimers();
  
  // Reset all mocks
  jest.clearAllMocks();
  
  // Reset browser mock
  if (global.browser?._reset) {
    global.browser._reset();
  }
  
  // Clear any pending timers
  jest.clearAllTimers();
});

afterEach(async () => {
  // Run all pending timers
  jest.runAllTimers();
  
  // Clear any remaining microtasks
  await new Promise(resolve => setImmediate(resolve));
  
  // Force garbage collection if available
  if (global.gc) {
    global.gc();
  }
  
  // Restore real timers
  jest.useRealTimers();
});