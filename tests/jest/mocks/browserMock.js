// tests/jest/mocks/browserMock.js

/**
 * Creates a complete mock browser event listener with standard Chrome extension APIs
 * Implements addListener, removeListener and hasListener for full API compatibility
 * @returns {jest.Mock} Enhanced mock function with listener capabilities
 */
const createMockListener = () => ({
  addListener: jest.fn(),
  removeListener: jest.fn(),
  hasListener: jest.fn()
});

// Create the mocked browser object
const mockBrowser = {
  runtime: {
    onInstalled: createMockListener(),
    onMessage: createMockListener(),
    sendMessage: jest.fn((message) => {
      // Return a promise that resolves immediately
      return Promise.resolve({ success: true });
    })
  },
  tabs: {
    query: jest.fn().mockResolvedValue([]),
    get: jest.fn().mockResolvedValue({}),
    create: jest.fn().mockResolvedValue({}),
    update: jest.fn().mockResolvedValue({}),
    remove: jest.fn().mockResolvedValue(),
    discard: jest.fn().mockResolvedValue({}),
    onCreated: createMockListener(),
    onRemoved: createMockListener(),
    onUpdated: createMockListener()
  },
  storage: {
    sync: {
      get: jest.fn().mockResolvedValue({}),
      set: jest.fn().mockResolvedValue(),
      remove: jest.fn().mockResolvedValue()
    },
    local: {
      get: jest.fn().mockResolvedValue({}),
      set: jest.fn().mockResolvedValue(),
      remove: jest.fn().mockResolvedValue()
    }
  }
};

// Export both the factory and a pre-configured instance
module.exports = mockBrowser;