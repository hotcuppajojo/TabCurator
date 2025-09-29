// tests/jest/setup/jest.setup.js
/**
 * @file Global test setup for Jest
 * @rationale Provide minimal, deterministic browser-like globals so unit tests
 * run consistently without a real browser environment. This reduces CI flakiness
 * and keeps test intent focused on module contracts rather than platform behavior
 */

import '@testing-library/jest-dom';

/**
 * @rationale Some codepaths query navigator.storage.estimate for quotas
 * Mock a predictable estimate so storage-dependent logic can be exercised reliably
 */
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

/**
 * @rationale Many modules interact with chrome or browser globals. Provide a
 * compact polyfill that exposes the API surface used in tests. Keep implementations
 * minimal and promise-based so async flows can be asserted deterministically
 */
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

/**
 * @rationale Expose the same surface under both global.browser and global.chrome
 * Some modules import webextension-polyfill while others rely on chrome. Keep them aligned
 */
global.browser = global.chrome;

/**
 * @rationale Performance.now is used for timing and metrics tests. Mock with a stable wrapper
 * so tests can assert timing behavior without relying on high-resolution timers
 */
global.performance = global.performance || {
  now: jest.fn(() => Date.now())
};

/**
 * @rationale requestIdleCallback is not available in node. Provide a thin shim
 * that schedules callbacks quickly so idle-based paths can be exercised in unit tests
 */
global.requestIdleCallback = global.requestIdleCallback || function(cb) {
  return setTimeout(cb, 1);
};

/**
 * @rationale Provide a matching cancelIdleCallback shim for completeness
 */
global.cancelIdleCallback = global.cancelIdleCallback || function(id) {
  clearTimeout(id);
};

/**
 * @rationale Expose jest and fetch globally to simplify test helpers that assume their presence
 * fetch is a noop by default and can be mocked per-test when needed
 */
global.jest = jest;
global.fetch = jest.fn();

/**
 * @rationale localStorage is used by some modules. Provide a simple spy based mock
 * Tests that depend on persistence should mock these methods explicitly when verifying behavior
 */
global.localStorage = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn()
};

/**
 * @rationale Replace the real logger with a no-op spy so tests can assert logging
 * without producing noisy output. The mock preserves method names used across the codebase
 */
jest.mock('../../../utils/logger.js', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    critical: jest.fn()
  }
}));