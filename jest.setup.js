const mockBrowser = require('./tests/jest/mocks/browserMock.js');

// Initialize browser mock
global.browser = mockBrowser;

// Track active timers
const activeTimers = new Set();

// Add setImmediate polyfill
global.setImmediate = (callback) => setTimeout(callback, 0);
global.clearImmediate = (id) => clearTimeout(id);

// Setup test environment
beforeAll(async () => {
  if (global.browser?._reset) {
    await global.browser._reset();
  }
});

// Before each test
beforeEach(async () => {
  // Reset all mocks
  jest.clearAllMocks();
  jest.clearAllTimers();
  
  // Reset browser mock
  if (global.browser?._reset) {
    await global.browser._reset();
  }

  // Clear timers
  activeTimers.forEach(timer => {
    try {
      clearTimeout(timer);
    } catch (e) {
      console.warn('Error clearing timer:', e);
    }
  });
  activeTimers.clear();

  // Reset prompt mock
  global.prompt = jest.fn().mockImplementation(() => "Morning Session");
});

// After each test
afterEach(async () => {
  // Clear timers
  activeTimers.forEach(timer => clearTimeout(timer));
  activeTimers.clear();
  
  if (global.browser?._reset) {
    await global.browser._reset();
  }

  jest.clearAllMocks();
  
  // Ensure all promises are resolved
  await new Promise(resolve => setTimeout(resolve, 0));
});

// Mock timer functions
const originalSetTimeout = global.setTimeout;
global.setTimeout = function(fn, delay, ...args) {
  const timer = originalSetTimeout(fn, delay, ...args);
  activeTimers.add(timer);
  return timer;
};

// Mock console methods
global.console = {
  ...global.console,
  error: jest.fn(),
  warn: jest.fn(),
  log: jest.fn()
};

// Mock alert and prompt
global.alert = jest.fn();
global.prompt = jest.fn().mockImplementation(() => "Morning Session");

// Setup DOM environment
document.body.innerHTML = `
  <div id="root"></div>
  <input id="tagInput" />
  <button id="viewArchivesButton"></button>
  <button id="saveSessionButton"></button>
  <button id="viewSessionsButton"></button>
  <button id="archiveTabButton"></button>
  <button id="suspendButton"></button>
`;

// Export for use in tests
module.exports = {
  mockBrowser,
  activeTimers
};