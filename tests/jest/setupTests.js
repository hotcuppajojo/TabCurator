// tests/jest/setupTests.js

import { jest } from '@jest/globals';
import '@testing-library/jest-dom';

// Import the browser mock
import browserMock from '../mocks/browserMock.js';

// Set up globals before any module imports
const mockEstimate = jest.fn().mockResolvedValue({
  quota: 100 * 1024 * 1024,
  usage: 10 * 1024 * 1024,
  available: 90 * 1024 * 1024
});

// Setup navigator.storage
Object.defineProperty(global, 'navigator', {
  value: {
    storage: {
      estimate: mockEstimate
    }
  },
  configurable: true,
  writable: true
});

// Setup global storage
Object.defineProperty(global, 'storage', {
  value: {
    estimate: mockEstimate
  },
  configurable: true,
  writable: true
});

// Setup crypto
Object.defineProperty(global, 'crypto', {
  value: {
    randomUUID: jest.fn(() => '123e4567-e89b-12d3-a456-426614174000'),
    subtle: {},
    getRandomValues: jest.fn(arr => arr)
  },
  configurable: true,
  writable: true
});

// Ensure storage is available globally
global.storage = {
  estimate: global.navigator.storage.estimate
};

const { createMockBrowser } = require('./mocks/browserMock.js');

// Update global mock setup for consolidated modules
global.mockBrowser = createMockBrowser();

// Define the global browser object
global.browser = browserMock;

// Setup localStorage mock
global.localStorage = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
};

// Mock the consolidated utils
jest.mock('../../src/utils/tabManager.js');
jest.mock('../../src/utils/stateManager.js');
jest.mock('../../src/utils/messagingUtils.js');
jest.mock('../../src/utils/tagUtils.js');

// Mock logger with all required methods
jest.mock('../../utils/logger.js', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    logPerformance: jest.fn()
  }
}));

// Mock redux-persist to bypass persistence during tests
jest.mock('redux-persist', () => ({
  persistReducer: (config, reducers) => reducers,
  persistStore: jest.fn(() => ({
    purge: jest.fn(),
    flush: jest.fn(),
  })),
}));

// Mock redux-persist/lib/storage/index.js if necessary
jest.mock('redux-persist/lib/storage/index.js', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
}));

// Configure storage estimate mock
const storageMock = {
  estimate: jest.fn().mockResolvedValue({
    quota: 100 * 1024 * 1024,
    usage: 10 * 1024 * 1024,
    available: 90 * 1024 * 1024
  })
};

// Mock storage globally
global.storage = storageMock;

// Mock global `self` for Service Worker with proper jest mock functions
global.self = {
  ...global.self,
  addEventListener: jest.fn(),
  removeEventListener: jest.fn(),
};

// Mock global navigator with storage
Object.defineProperty(global, 'navigator', {
  value: {
    storage: storageMock
  },
  writable: true,
  configurable: true
});

// Mock crypto more reliably
Object.defineProperty(global, 'crypto', {
  value: {
    randomUUID: () => '123e4567-e89b-12d3-a456-426614174000',
    subtle: {},
    getRandomValues: (arr) => arr
  },
  writable: true
});

// Ensure crypto is mocked globally
global.crypto = {
  randomUUID: jest.fn().mockReturnValue('123e4567-e89b-12d3-a456-426614174000'),
  subtle: {},
  getRandomValues: jest.fn(arr => arr)
};

// Initialize browser mocks
beforeAll(() => {
});

afterEach(() => {
  jest.clearAllMocks();
});

afterAll(() => {
  jest.useRealTimers(); // Ensure real timers are used globally
  jest.clearAllTimers(); // Clear any remaining timers
  mockBrowser._testing.resetBrowserMock(); // Reset all browser mocks
});