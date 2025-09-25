// tests/jest/mocks/browserMock.js

export default {
  tabs: {
    query: jest.fn().mockResolvedValue([]),
    get: jest.fn().mockResolvedValue({ id: 1, url: 'https://example.com', title: 'Example Tab' }),
    create: jest.fn().mockResolvedValue({ id: 123, url: 'https://example.com' }),
    update: jest.fn().mockResolvedValue({ id: 1 }),
    remove: jest.fn().mockResolvedValue(undefined),
    discard: jest.fn().mockResolvedValue(undefined),
    onCreated: { addListener: jest.fn(), removeListener: jest.fn() },
    onRemoved: { addListener: jest.fn(), removeListener: jest.fn() },
    onUpdated: { addListener: jest.fn(), removeListener: jest.fn() }
  },
  bookmarks: {
    search: jest.fn().mockResolvedValue([]),
    create: jest.fn().mockResolvedValue({ id: 'folder123', title: 'TabCurator' }),
    remove: jest.fn().mockResolvedValue(undefined)
  },
  permissions: {
    contains: jest.fn().mockResolvedValue(true),
    request: jest.fn().mockResolvedValue(true)
  },
  runtime: {
    getURL: (p) => `chrome-extension://__EXT__/${p}`,
    openOptionsPage: jest.fn().mockResolvedValue(undefined),
    sendMessage: jest.fn().mockResolvedValue({}),
    onMessage: { addListener: jest.fn(), removeListener: jest.fn() },
    connect: jest.fn(() => ({ connectionId: 'conn1', postMessage: jest.fn(), onMessage: { addListener: jest.fn() } }))
  },
  storage: {
    local: {
      get: jest.fn().mockResolvedValue({ telemetry_events: [] }),
      set: jest.fn().mockResolvedValue(undefined),
      remove: jest.fn().mockResolvedValue(undefined)
    },
    onChanged: { addListener: jest.fn(), removeListener: jest.fn() }
  },
  notifications: {
    create: jest.fn().mockResolvedValue(undefined)
  }
};