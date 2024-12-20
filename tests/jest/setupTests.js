// tests/jest/setupTests.js

import { jest } from '@jest/globals';
import '@testing-library/jest-dom';

// Import the browser mock
import browserMock from '../mocks/browserMock.js';

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

// Mock logger
jest.mock('../../../utils/logger.js', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
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

// Mock global `self` for Service Worker with proper jest mock functions
global.self = {
  ...global.self,
  addEventListener: jest.fn(),
  removeEventListener: jest.fn(),
};

// Initialize browser mocks
beforeAll(() => {
  // ...existing mock setups...
});

afterEach(() => {
  // ...existing cleanup code...
  jest.clearAllMocks();
});

afterAll(() => {
  jest.useRealTimers(); // Ensure real timers are used globally
  jest.clearAllTimers(); // Clear any remaining timers
  mockBrowser._testing.resetBrowserMock(); // Reset all browser mocks
});