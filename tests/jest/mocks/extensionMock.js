// Mock module for chrome-extension URLs
module.exports = {
  // You can add specific mocks related to extension pages if needed
  navigate: jest.fn((url) => {
    if (url.startsWith('chrome-extension://')) {
      return Promise.resolve({ status: 200, body: '<html></html>' });
    }
    return Promise.reject(new Error('Navigation to non-extension URLs not mocked.'));
  }),
};

// Define global.page if not already defined
global.page = global.page || {};

// Initialize global.page.goto as a jest mock function
global.page.goto = jest.fn((url, options) => {
  if (url.startsWith('chrome-extension://')) {
    return module.exports.navigate(url);
  }
});