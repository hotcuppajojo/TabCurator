// A simple storage estimate mock using CommonJS syntax

const createStorageEstimateMock = () => ({
  quota: 100 * 1024 * 1024, // 100MB
  usage: 10 * 1024 * 1024,  // 10MB
  usageDetails: {
    'persistent': 8 * 1024 * 1024,
    'temporary': 2 * 1024 * 1024
  }
});

const storageEstimateMock = createStorageEstimateMock();

// Export using CommonJS syntax to avoid ES module transpilation issues
module.exports = {
  createStorageEstimateMock,
  default: storageEstimateMock,
  storageEstimateMock
};