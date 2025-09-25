// jest.setup.js - Make it compatible with both ESM and CommonJS
import '@testing-library/jest-dom';

// Use Jest's built-in manual mocks for browser APIs
jest.mock('webextension-polyfill', () => ({
  storage: {
    local: {
      get: jest.fn().mockResolvedValue({}),
      set: jest.fn().mockResolvedValue({})
    }
  },
  runtime: {
    connect: jest.fn(),
    sendMessage: jest.fn(),
    onMessage: {
      addListener: jest.fn()
    }
  },
  tabs: {
    query: jest.fn().mockResolvedValue([]),
    get: jest.fn(),
    create: jest.fn(),
    update: jest.fn()
  },
  bookmarks: {
    search: jest.fn().mockResolvedValue([]),
    create: jest.fn()
  }
}), { virtual: true });

// Storage estimate mock
global.navigator = {
  storage: {
    estimate: jest.fn().mockResolvedValue({
      quota: 100 * 1024 * 1024,
      usage: 10 * 1024 * 1024,
      usageDetails: {
        'persistent': 8 * 1024 * 1024,
        'temporary': 2 * 1024 * 1024
      }
    })
  }
};

// Global polyfills for browser APIs
global.chrome = global.chrome || {
  runtime: {
    connect: jest.fn(),
    sendMessage: jest.fn(),
    onMessage: {
      addListener: jest.fn(),
      removeListener: jest.fn()
    }
  },
  tabs: {
    query: jest.fn().mockResolvedValue([]),
    get: jest.fn().mockResolvedValue({ id: 1 }),
    create: jest.fn().mockResolvedValue({ id: 1 }),
    update: jest.fn().mockResolvedValue({ id: 1 }),
    remove: jest.fn().mockResolvedValue(),
    discard: jest.fn().mockResolvedValue()
  },
  storage: {
    local: {
      get: jest.fn().mockResolvedValue({}),
      set: jest.fn().mockResolvedValue()
    }
  }
};

global.browser = global.chrome;

// Mock performance API
global.performance = global.performance || {
  now: jest.fn(() => Date.now())
};

// Mock requestIdleCallback
global.requestIdleCallback = global.requestIdleCallback || function(cb) {
  return setTimeout(cb, 1);
};

global.cancelIdleCallback = global.cancelIdleCallback || function(id) {
  clearTimeout(id);
};

// Setup global Jest mocks
global.jest = jest;
global.fetch = jest.fn();

// Setup localStorage mock
global.localStorage = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn()
};

// Mock logger
jest.mock('../../../utils/logger.js', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    critical: jest.fn()
  }
}));

const Module = require('module');
const originalLoad = Module._load;

Module._load = function patchedBabelRuntime(request, parent, isMain) {
  if (request.startsWith('@babel/runtime-corejs3/')) {
    const altRequest = request.replace('@babel/runtime-corejs3/', '@babel/runtime/');
    try {
      return originalLoad.call(this, altRequest, parent, isMain);
    } catch (err) {
      // fall through and retry with original request
    }
  }
  return originalLoad.call(this, request, parent, isMain);
};