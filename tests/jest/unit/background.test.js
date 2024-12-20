import { jest } from '@jest/globals';

// First define base mocks
const mockOnMessageAddListener = jest.fn();
const mockOnConnectAddListener = jest.fn();
const mockOnStartupAddListener = jest.fn();
const mockOnSuspendAddListener = jest.fn();
const mockOnUpdatedAddListener = jest.fn();
const mockOnRemovedAddListener = jest.fn();
const mockInitializeServiceWorkerState = jest.fn().mockResolvedValue(undefined);
const mockConnectionInitialize = jest.fn().mockResolvedValue(undefined);

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

// Import modules after mocks
const { __testing__ } = require('../../../background/background.js');
const browser = require('webextension-polyfill');

describe('Background Service Worker', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    
    // Reset global mocks
    global.setInterval = jest.fn();
    global.requestIdleCallback = jest.fn();
    
    // Reset isInitialized state
    __testing__.reset();
  });

  test('initialize should setup all required services', async () => {
    await __testing__.initialize();

    expect(mockInitializeServiceWorkerState).toHaveBeenCalled();
    expect(mockConnectionInitialize).toHaveBeenCalled();
    expect(mockOnMessageAddListener).toHaveBeenCalled();
    expect(mockOnConnectAddListener).toHaveBeenCalled();
  });

  test('setupEventListeners should register all required listeners', () => {
    __testing__.setupEventListeners();

    expect(mockOnStartupAddListener).toHaveBeenCalled();
    expect(mockOnSuspendAddListener).toHaveBeenCalled();
    expect(mockOnUpdatedAddListener).toHaveBeenCalled();
    expect(mockOnRemovedAddListener).toHaveBeenCalled();
  });

  test('setupPeriodicTasks should initialize recurring tasks', () => {
    __testing__.setupPeriodicTasks();

    expect(setInterval).toHaveBeenCalled();
    expect(requestIdleCallback).toHaveBeenCalled();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });
});

