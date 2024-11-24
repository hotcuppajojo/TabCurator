// jest.setup.js

// Creates reusable event listener mocks with standard browser API shape
const createMockListener = () => {
  const fn = jest.fn();
  // Implements full event listener interface for compatibility
  fn.addListener = jest.fn();
  fn.removeListener = jest.fn();
  fn.hasListener = jest.fn(() => false);
  return fn;
};

// Mocks Chrome API to avoid need for real browser in tests
global.chrome = {
  // Simulates extension messaging system for component communication
  runtime: {
    onMessage: createMockListener(),
    sendMessage: jest.fn(),
    lastError: null,
  },
  // Mocks storage for testing data persistence scenarios
  storage: {
    sync: {
      get: jest.fn(),
      set: jest.fn(),
    },
    local: {
      get: jest.fn(),
      set: jest.fn(),
      remove: jest.fn(),
    },
  },
  // Provides tab management mocks for testing core functionality
  tabs: {
    onCreated: createMockListener(),
    onUpdated: createMockListener(),
    onActivated: createMockListener(),
    onRemoved: createMockListener(),
    query: jest.fn(),
    get: jest.fn(),
    update: jest.fn(),
    discard: jest.fn(),
  },
  // Enables testing of scheduled tasks without timeouts
  alarms: {
    create: jest.fn(),
    onAlarm: createMockListener(),
  },
};

// Supports cross-browser compatibility testing
global.browser = global.chrome;

// Creates minimal service worker environment for background scripts
global.self = {
  addEventListener: jest.fn().mockImplementation((event, handler) => {
    return handler;
  })
};