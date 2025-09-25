import { jest } from '@jest/globals';

// Mock CONFIG from core/index.js instead of constants.js
jest.mock('../../../utils/core/index.js', () => ({
  CONFIG: {
    TIMEOUTS: {
      CLEANUP: 300000 // 5 minutes in milliseconds
    }
  },
  // Mock other exports that might be imported
  ACTION: {},
  STATE: {},
  MESSAGE_TYPES: {},
  TELEMETRY_EVENTS: {},
  recordTelemetry: jest.fn(),
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  }
}));

// Import the mocked CONFIG after the mock is defined
const { CONFIG } = require('../../../utils/core/index.js');

// First define base mocks
const mockOnMessageAddListener = jest.fn();
const mockOnConnectAddListener = jest.fn();
const mockOnStartupAddListener = jest.fn();
const mockOnSuspendAddListener = jest.fn();
const mockOnUpdatedAddListener = jest.fn();
const mockOnRemovedAddListener = jest.fn();
const mockInitializeServiceWorkerState = jest.fn().mockResolvedValue(undefined);
const mockConnectionInitialize = jest.fn().mockResolvedValue(undefined);
const mockConnectionConnect = jest.fn(); // Define a separate mock for connect

// Mock browser API
jest.mock('webextension-polyfill', () => ({
  runtime: {
    onMessage: { addListener: mockOnMessageAddListener },
    onConnect: { addListener: mockOnConnectAddListener },
    onStartup: { addListener: mockOnStartupAddListener },
    onSuspend: { addListener: mockOnSuspendAddListener }
  },
  tabs: {
    onUpdated: { addListener: mockOnUpdatedAddListener },
    onRemoved: { addListener: mockOnRemovedAddListener }
  },
  storage: {
    local: {
      get: jest.fn().mockResolvedValue({}),
      set: jest.fn().mockResolvedValue(),
      remove: jest.fn().mockResolvedValue()
    }
  }
}));

// Mock dependencies
jest.mock('../../../utils/stateManager.js', () => ({
  __esModule: true,
  initializeServiceWorkerState: mockInitializeServiceWorkerState,
  default: {
    dispatch: jest.fn(),
    getState: jest.fn(() => ({
      tabManagement: {
        tabs: [],
        activity: {},
        oldestTab: null
      },
      settings: { maxTabs: 100 }
    }))
  }
}));

jest.mock('../../../utils/connectionManager.js', () => ({
  connection: {
    initialize: mockConnectionInitialize,
    handleMessage: jest.fn(),
    handlePort: jest.fn(),
    cleanupConnections: jest.fn().mockResolvedValue(undefined)
  }
}));

// Define __testing__ with connection mocks
global.__testing__ = {
  connection: {
    initialize: mockConnectionInitialize, // Ensure this uses the mock
    connect: mockConnectionConnect,       // Define and use a separate mock if needed
  },
};

// Import modules after setting up __testing__
const { __testing__ } = require('../../../background/background.js');
const browser = require('webextension-polyfill');

describe('Background Service Worker', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    
    // Reset global mocks with implementations
    global.setInterval = jest.fn(fn => fn());
    global.requestIdleCallback = jest.fn(fn => fn({
      didTimeout: false,
      timeRemaining: () => 50
    }));
    
    // Reset isInitialized state
    __testing__.reset();
  });

  test('initialize should setup all required services', async () => {
    await __testing__.initialize();

    expect(mockInitializeServiceWorkerState).toHaveBeenCalled();
    expect(mockConnectionInitialize).toHaveBeenCalled();
    
    // The initialize function should set up message listeners
    expect(mockOnConnectAddListener).toHaveBeenCalled();
  });

  test('setupEventListeners should register all required listeners', () => {
    __testing__.setupEventListeners();

    // Verify all listeners are registered
    expect(mockOnStartupAddListener).toHaveBeenCalled();
    expect(mockOnSuspendAddListener).toHaveBeenCalled();
    expect(mockOnUpdatedAddListener).toHaveBeenCalled();
    expect(mockOnRemovedAddListener).toHaveBeenCalled();
  });

  test('setupPeriodicTasks should initialize recurring tasks', () => {
    __testing__.setupPeriodicTasks();

    // Verify both interval and idle callback are set up
    expect(setInterval).toHaveBeenCalledWith(expect.any(Function), CONFIG.TIMEOUTS.CLEANUP);
    expect(requestIdleCallback).toHaveBeenCalledWith(expect.any(Function), { timeout: 10000 });
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });
});


