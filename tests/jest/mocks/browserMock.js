// tests/jest/mocks/browserMock.js

/**
 * Creates a complete mock browser event listener with standard Chrome extension APIs
 * Implements addListener, removeListener, and hasListener for full API compatibility
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
    sendMessage: jest.fn((message) => Promise.resolve({ success: true })),
    lastError: null
  },
  tabs: {
    onCreated: createMockListener(),
    onRemoved: createMockListener(),
    onUpdated: createMockListener(),
    onActivated: createMockListener(),
    query: jest.fn().mockResolvedValue([]),
    get: jest.fn().mockResolvedValue({}),
    create: jest.fn().mockResolvedValue({}),
    update: jest.fn().mockResolvedValue({}),
    remove: jest.fn().mockResolvedValue(),
    discard: jest.fn().mockResolvedValue({})
  },
  alarms: {
    create: jest.fn(),
    onAlarm: createMockListener()
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
    },
    onChanged: {
      addListener: jest.fn()
    }
  }
};

// Add support for state operations in storage mock
mockBrowser.storage.sync = {
  ...mockBrowser.storage.sync,
  get: jest.fn().mockImplementation(() => Promise.resolve({
    archivedTabs: {},
    tabActivity: {},
    savedSessions: {},
    isTaggingPromptActive: false
  }))
};

// Export both the factory and a pre-configured instance
module.exports = {
  createMockListener,
  ...mockBrowser
};