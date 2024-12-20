// jest.setup.js
import '@testing-library/jest-dom';
import browserMock from '../mocks/browserMock';
import { createNavigatorMock } from '../mocks/storageEstimateMock';

// Setup global mocks
global.browser = browserMock;
global.navigator = createNavigatorMock();

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
    critical: jest.fn(), // Added critical method mock
  }
}));