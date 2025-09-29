// tests/jest/mocks/browserMock.js
/**
 * @file Lightweight browser API mock used across unit tests
 * @rationale Provide a small stable surface that mimics core browser APIs
 * This reduces test flakiness and keeps focus on module contracts rather than platform behavior
 */

export default {
  /**
   * @rationale Tab operations are frequently exercised by managers and reducers
   * The mock returns deterministic promises so async paths remain predictable in tests
   * Event-like properties implement addListener/removeListener so listeners can be asserted without an event loop
   */
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

  /**
   * @rationale Bookmark APIs are used for optional features like bookmarking tabs
   * The mock keeps results minimal to verify integration points without relying on browser state
   */
  bookmarks: {
    search: jest.fn().mockResolvedValue([]),
    create: jest.fn().mockResolvedValue({ id: 'folder123', title: 'TabCurator' }),
    remove: jest.fn().mockResolvedValue(undefined)
  },

  /**
   * @rationale Permission checks gate feature execution. Resolve to true to exercise feature flows in unit tests
   * Tests that need to validate permission failure can override these mocks locally
   */
  permissions: {
    contains: jest.fn().mockResolvedValue(true),
    request: jest.fn().mockResolvedValue(true)
  },

  /**
   * @rationale Runtime helpers are used for URL generation and messaging
   * getURL is implemented as a pure function so tests can assert resource paths without a runtime present
   * connect returns a minimal connection object to exercise message plumbing
   */
  runtime: {
    getURL: (p) => `chrome-extension://__EXT__/${p}`,
    openOptionsPage: jest.fn().mockResolvedValue(undefined),
    sendMessage: jest.fn().mockResolvedValue({}),
    onMessage: { addListener: jest.fn(), removeListener: jest.fn() },
    onConnect: { addListener: jest.fn(), removeListener: jest.fn() },
    onInstalled: { addListener: jest.fn(), removeListener: jest.fn() },
    onSuspend: { addListener: jest.fn(), removeListener: jest.fn() },
    connect: jest.fn(() => ({ connectionId: 'conn1', postMessage: jest.fn(), onMessage: { addListener: jest.fn() } }))
  },

  /**
   * @rationale Storage is central to persistence tests. Provide local methods that resolve predictably
   * The telemetry_events default is empty to avoid noisy telemetry during unit runs
   */
  storage: {
    local: {
      get: jest.fn().mockResolvedValue({ telemetry_events: [] }),
      set: jest.fn().mockResolvedValue(undefined),
      remove: jest.fn().mockResolvedValue(undefined)
    },
    onChanged: { addListener: jest.fn(), removeListener: jest.fn() }
  },

  /**
   * @rationale Notifications are a surface the extension may call. Keep the mock minimal so callers can assert invocation
   */
  notifications: {
    create: jest.fn().mockResolvedValue(undefined)
  }
};