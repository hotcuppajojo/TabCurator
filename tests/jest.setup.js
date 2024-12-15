
// ...existing code...

browser: {
  // ...existing mocks...
  runtime: {
    sync: {
      get: jest.fn((key) => {
        const defaultData = {
          inactiveThreshold: 60,
          tabLimit: 100,
          rules: [{ condition: 'example.com', action: 'Tag: Research' }],
          savedSessions: {}
        };
        return Promise.resolve({ [key]: defaultData[key] });
      }),
      set: jest.fn((items) => {
        // Optionally update internal state if needed
        return Promise.resolve();
      }),
      remove: jest.fn((keys) => {
        // Simulate removal of items
        return Promise.resolve();
      }),
    },
    onSuspend: {
      addListener: jest.fn(), // Added mock for onSuspend.addListener
    },
    onMessage: {
      addListener: jest.fn(),
    },
    onInstalled: {
      addListener: jest.fn(),
    },
    onStartup: {
      addListener: jest.fn(),
    },
    // ...other runtime mocks...
  },
  // ...other browser API mocks...
},

// ...existing code...