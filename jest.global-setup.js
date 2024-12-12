// jest.global-teardown.js
module.exports = async () => {
  // Force garbage collection if available
  if (global.gc) {
    global.gc();
  }
};

// jest.global-setup.js

const jest = require('jest'); // Add this line to define jest

module.exports = async () => {
  // Initialize global mocks or resources
  const { default: mockBrowser } = require('./tests/jest/mocks/browserMock.js');
  global.browser = mockBrowser;

  // Force garbage collection if available
  if (global.gc) {
    global.gc();
  }

  // Ensure all promises are resolved
  await Promise.resolve();

  // ...existing setup...
};