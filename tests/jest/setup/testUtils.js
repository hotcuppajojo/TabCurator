import background from '../../../src/background/background.js';
import mockBrowser from '../mocks/browserMock.js';

// Add utility functions or mocks as needed
// For example, mock navigation in extensionMock

export const cleanupTest = async () => {
  if (background && background._cleanup) {
    await background._cleanup();
  }
  jest.clearAllTimers();
  jest.clearAllMocks();
  await new Promise(resolve => setImmediate(resolve));
};

export const initializeTest = async () => {
  jest.clearAllMocks();
  if (mockBrowser._reset) {
    mockBrowser._reset();
  }
  await new Promise(resolve => setImmediate(resolve));
};
