// jest.global-teardown.js

const jest = require('jest'); // Ensure jest is defined

module.exports = async () => {
  // Clean up global mocks and resources
  if (global.browser && global.browser._cleanup) {
    await global.browser._cleanup();
  }

  // Force garbage collection if available
  if (global.gc) {
    global.gc();
  }

  // Ensure all promises are resolved
  await Promise.resolve();
};