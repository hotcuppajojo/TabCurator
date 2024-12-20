// tests/jest/mocks/browserMock.js

const browserMock = {
  tabs: {
    query: jest.fn().mockResolvedValue([]),
    create: jest.fn().mockResolvedValue({ id: 1 }),
    remove: jest.fn().mockResolvedValue(),
    update: jest.fn().mockResolvedValue({}),
    get: jest.fn().mockResolvedValue({}),
    discard: jest.fn().mockResolvedValue({}),
    duplicate: jest.fn().mockResolvedValue({}),
    moveInSuccession: jest.fn().mockResolvedValue(),
    onActivated: {
      addListener: jest.fn(),
      removeListener: jest.fn()
    },
    onUpdated: {
      addListener: jest.fn(),
      removeListener: jest.fn()
    },
    onRemoved: {
      addListener: jest.fn(), // Ensures addListener is mocked
      removeListener: jest.fn(),
    }
  },
  runtime: {
    sendMessage: jest.fn().mockResolvedValue({}),
    onMessage: {
      addListener: jest.fn(),
      removeListener: jest.fn(),
    },
    getManifest: jest.fn().mockReturnValue({ version: '1.0.0' }),
    connect: jest.fn().mockReturnValue({
      onMessage: {
        addListener: jest.fn(),
        removeListener: jest.fn()
      },
      onDisconnect: {
        addListener: jest.fn(),
        removeListener: jest.fn()
      },
      postMessage: jest.fn(),
      disconnect: jest.fn()  // Add disconnect method
    }),
    onConnect: {
      addListener: jest.fn(), // Added onConnect.addListener mock
      removeListener: jest.fn(),
    },
  },
  storage: {
    local: {
      get: jest.fn().mockResolvedValue({}),
      set: jest.fn().mockResolvedValue(),
      clear: jest.fn().mockResolvedValue(),
    },
    sync: {
      get: jest.fn().mockResolvedValue({}),
      set: jest.fn().mockResolvedValue(),
    },
    estimate: jest.fn().mockResolvedValue({
      quota: 102400000,    // 100MB
      usage: 51200000,     // 50MB
      available: 51200000  // 50MB
    }),
    onChanged: {
      addListener: jest.fn(),
      removeListener: jest.fn(),
    }
  },
  notifications: {
    create: jest.fn().mockResolvedValue('notification-id'),
    clear: jest.fn().mockResolvedValue(true),
  },
  declarativeNetRequest: {
    updateDynamicRules: jest.fn().mockResolvedValue(),
    getDynamicRules: jest.fn().mockResolvedValue([])
  }
};

// Add helper methods for testing
browserMock.__resetMocks = () => {
  Object.values(browserMock).forEach(api => {
    Object.values(api).forEach(method => {
      if (typeof method === 'function' && method.mockReset) {
        method.mockReset();
      }
    });
  });
};

export default browserMock;