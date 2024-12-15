// tests/jest/setupTests.js

import { jest } from '@jest/globals';
import '@testing-library/jest-dom/extend-expect';

const { createMockBrowser } = require('./mocks/browserMock.js');

// Update global mock setup for consolidated modules
global.mockBrowser = createMockBrowser();

// Mock the consolidated utils
jest.mock('../../src/utils/tabManager.js');
jest.mock('../../src/utils/stateManager.js');
jest.mock('../../src/utils/messagingUtils.js');
jest.mock('../../src/utils/tagUtils.js');

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