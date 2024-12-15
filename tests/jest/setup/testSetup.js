import mockBrowser from '../mocks/browserMock.js';

// Setup globals
global.Request = class Request {
  constructor(url) { this.url = url; }
};

global.Response = class Response {
  constructor(body, init = {}) {
    this.body = body;
    this.init = init;
  }
  json() { return Promise.resolve(JSON.parse(this.body)); }
};

// Setup cache mock functions
const createCacheMock = () => ({
  put: jest.fn().mockResolvedValue(undefined),
  match: jest.fn().mockImplementation((key) => {
    return Promise.resolve(new Response(JSON.stringify({ 
      tab: { id: 1, title: 'Test Tab', url: 'https://example.com' } 
    })));
  }),
  delete: jest.fn().mockResolvedValue(true)
});

// Setup service worker globals
global.self = {
  listeners: new Map(),
  addEventListener: (event, handler) => {
    global.self.listeners.set(event, handler);
  },
  trigger: async (event, ...args) => {
    const handler = global.self.listeners.get(event);
    return handler ? handler(...args) : undefined;
  },
  caches: {
    open: jest.fn().mockImplementation(() => Promise.resolve(createCacheMock())),
    keys: jest.fn().mockResolvedValue(['tabData'])
  }
};

// Setup browser mocks
const setupBrowserMocks = () => {
  // Mock tab operations
  mockBrowser.tabs.get.mockImplementation((tabId) => Promise.resolve({
    id: tabId,
    title: 'Test Tab',
    url: 'https://example.com',
    windowId: 1,
    active: false
  }));

  mockBrowser.tabs.query.mockResolvedValue([
    { id: 1, title: 'Tab 1', url: 'https://example.com', active: false },
    { id: 2, title: 'Tab 2', url: 'https://example2.com', active: true }
  ]);

  // Setup service worker events
  ['install', 'activate', 'fetch', 'message'].forEach(event => {
    global.self.addEventListener(event, jest.fn().mockResolvedValue(undefined));
  });

  // Mock storage
  mockBrowser.storage.sync.get.mockResolvedValue({
    inactiveThreshold: 60,
    tabLimit: 100,
    rules: []
  });
};

export const setupTest = async () => {
  jest.clearAllMocks();
  
  // Initialize mock browser with proper alarm methods
  const mockPort = {
    name: 'testPort',
    onMessage: { addListener: jest.fn(), removeListener: jest.fn() },
    onDisconnect: { addListener: jest.fn(), removeListener: jest.fn() },
    postMessage: jest.fn(),
    disconnect: jest.fn()
  };

  // Update mockBrowser configuration
  mockBrowser.runtime = {
    ...mockBrowser.runtime,
    connect: jest.fn().mockReturnValue(mockPort)
  };

  mockBrowser.alarms = {
    create: jest.fn(),
    onAlarm: {
      addListener: jest.fn(),
      removeListener: jest.fn()
    }
  };

  // Setup service worker globals
  global.self = {
    listeners: new Map(),
    addEventListener: (event, handler) => {
      self.listeners.set(event, handler);
    },
    trigger: async (event, ...args) => {
      const handler = self.listeners.get(event);
      return handler ? handler(...args) : undefined;
    },
    caches: {
      open: jest.fn().mockImplementation(() => Promise.resolve({
        put: jest.fn().mockResolvedValue(undefined),
        match: jest.fn().mockImplementation(() => Promise.resolve(
          new Response(JSON.stringify({ tab: { id: 1, title: 'Test Tab' } }))
        )),
        delete: jest.fn().mockResolvedValue(true)
      })),
      keys: jest.fn().mockResolvedValue(['tabData'])
    }
  };

  // Initialize global.page
  global.page = {};

  setupBrowserMocks();
  await new Promise(resolve => setImmediate(resolve));
};

export const cleanupTest = async () => {
  jest.clearAllMocks();
  global.self.listeners.clear();
  
  // Clear global.page properties if needed
  global.page.goto = undefined;
  
  await new Promise(resolve => setImmediate(resolve));
};
