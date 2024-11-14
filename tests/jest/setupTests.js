// tests/jest/setupTests.js

// Mock the chrome APIs globally for all tests
global.chrome = {
    runtime: {
      onMessage: {
        addListener: jest.fn(),
      },
      sendMessage: jest.fn(),
    },
    tabs: {
      onCreated: { addListener: jest.fn() },
      onUpdated: { addListener: jest.fn() },
      onActivated: { addListener: jest.fn() },
      onRemoved: { addListener: jest.fn() },
      query: jest.fn().mockResolvedValue([]), // Keep only this definition
      discard: jest.fn(),
      remove: jest.fn(),
    },
    alarms: {
      create: jest.fn(),
      onAlarm: { addListener: jest.fn() },
    },
    storage: {
      sync: {
        get: jest.fn(),
        set: jest.fn(),
      },
    },
  };
  
  // Alias `browser` to `chrome` for compatibility
  global.browser = global.chrome;
  
  // Mock global `self` for Service Worker
  global.self = {
    addEventListener: jest.fn(),
  };