// utils/messagingUtils.js
/**
 * @fileoverview Unified messaging and connection utilities.
 */
import browser from 'webextension-polyfill';
import { 
  updateRulesHandler,
  updateSettingsHandler,
  getSavedSessions 
} from './stateManager.js';
import { discardInactiveTabs, bookmarkTab, discardTab } from './tabManager.js';
import { tagTab } from './tagUtils.js'; 
import { connection } from './connectionManager.js';
import { MESSAGE_TYPES, PERMISSIONS, VALIDATION_TYPES, SW_EVENTS } from './types.js';
import { validatePermissions } from './permissionUtils.js';

// Consolidate ALL configuration constants into a single frozen object
export const CONFIG = Object.freeze({
  QUEUE: {
    MAX_SIZE: 100,
    BATCH_SIZE: 10
  },
  RETRY: {
    DELAY: 1000,
    MAX_ATTEMPTS: 5,
    MAX_RETRIES: 3,  // Added from duplicate
    COOLDOWN: 10000
  },
  TIMEOUT: {
    MESSAGE: 5000,
    CONNECTION: 2000
  },
  CONNECTION: {
    NAME: 'content-connection'
  }
});

// Add message schema validation
export const MESSAGE_SCHEMA = Object.freeze({
  [MESSAGE_TYPES.TAB_ACTION]: {
    required: ['tabId', 'action'],
    optional: ['data']
  },
  [MESSAGE_TYPES.STATE_UPDATE]: {
    required: ['type', 'payload'],
    optional: ['meta']
  }
});

// Improve message validation
export const validateMessage = (message) => {
  const schema = MESSAGE_SCHEMA[message?.type];
  if (!schema) {
    throw new Error(`Unknown message type: ${message?.type}`);
  }

  schema.required.forEach(field => {
    if (!(field in message)) {
      throw new Error(`Missing required field: ${field}`);
    }
  });

  return true;
};

// Single permission checking function
export const checkPermissions = async (permissionGroup) => {
  const permissions = await browser.permissions.getAll();
  return PERMISSIONS.REQUIRED[permissionGroup].every(
    permission => permissions.permissions.includes(permission)
  );
};

// Update messaging permission check to use centralized version
const checkMessagingPermissions = () => checkPermissions('MESSAGING');

let retryCount = 0;
let isProcessingQueue = false;

// Connection and queue state
let port = null;
let isConnected = false;
const messageQueue = [];

// Adjust connection state tracking
let connectionAttempts = 0;
let reconnectTimeout = null;

// Store references to the listener functions
let messageCallback;
let disconnectCallback;

/**
 * Mapping of message actions to their corresponding handler functions.
 */
export const actionHandlers = {
  'discardInactiveTabs': discardInactiveTabs, // Updated from suspendInactiveTabs
  'updateRules': updateRulesHandler,
  'tagTab': tagTab,
  'bookmarkTab': bookmarkTab,
  'discardTab': discardTab,
  'updateSettings': updateSettingsHandler, // Updated to match handler name
  'getSessions': getSavedSessions, // Updated to match function name
  'getState': (message, sender, sendResponse, browserInstance, store) => {
    sendResponse({ state: store.getState() });
  },
  'DISPATCH_ACTION': (message, sender, sendResponse, browserInstance, store) => {
    store.dispatch(message.payload);
    sendResponse({ success: true });
  }
};

// Add logging levels
export const LOG_LEVELS = Object.freeze({
  DEBUG: 'debug',
  INFO: 'info',
  WARN: 'warn',
  ERROR: 'error'
});

// Add error types
export const ERROR_TYPES = Object.freeze({
  PERMISSION_DENIED: 'PERMISSION_DENIED',
  API_UNAVAILABLE: 'API_UNAVAILABLE',
  INVALID_MESSAGE: 'INVALID_MESSAGE',
  CONNECTION_ERROR: 'CONNECTION_ERROR'
});

// Add structured error handling
export class MessagingError extends Error {
  constructor(type, message, originalError = null) {
    super(message);
    this.type = type;
    this.originalError = originalError;
  }
}

/**
 * Initializes connection with comprehensive error handling and lifecycle management.
 * @param {Function} messageHandler - Function to handle incoming messages.
 * @param {Object} config - Configuration for the connection.
 */
export function initializeConnection(messageHandler, config = {}) {
  const {
    maxConnectionAttempts = CONFIG.RETRY.MAX_ATTEMPTS,
    connectionRetryDelay = CONFIG.TIMEOUT.CONNECTION,
    reconnectCooldown = CONFIG.RETRY.COOLDOWN,
    messageTimeout = CONFIG.TIMEOUT.MESSAGE,
    batchSize = CONFIG.QUEUE.BATCH_SIZE,
  } = config;

  console.debug('Initializing connection with config:', {
    maxConnectionAttempts,
    connectionRetryDelay,
    reconnectCooldown,
    messageTimeout,
    batchSize,
  });

  // Update existing variables with config values
  const MAX_CONNECTION_ATTEMPTS = maxConnectionAttempts;
  const CONNECTION_RETRY_DELAY = connectionRetryDelay;
  const RECONNECT_COOLDOWN = reconnectCooldown;
  const MESSAGE_TIMEOUT = messageTimeout;
  const BATCH_SIZE = batchSize;

  try {
    if (!browser || !browser.runtime || !browser.runtime.connect) {
      console.error('Runtime API not available');
      return;
    }

    // Initialize only once
    if (isConnected) {
      console.warn('Already connected to background.');
      return;
    }

    connectionAttempts++;
    console.info(`Attempting to connect. Attempt #${connectionAttempts}`);

    port = browser.runtime.connect({ name: CONFIG.CONNECTION.NAME });
    console.info('Connection port established.');

    port.onMessage.addListener(async (message) => {
      console.debug('Message received from port:', message);
      if (message.type === 'CONNECTION_ACK') {
        console.info('Connection acknowledged by background.');
        isConnected = true;
        connectionAttempts = 0;
        await flushQueue();
      } else {
        try {
          await messageHandler(message);
          console.debug('Message handled successfully.');
        } catch (error) {
          console.error('Error in message handler:', error);
        }
      }
    });

    port.onDisconnect.addListener(() => {
      console.warn('Connection lost, attempting to reconnect...');
      isConnected = false;
      port = null;

      // Retry logic with exponential backoff
      if (connectionAttempts < MAX_CONNECTION_ATTEMPTS) {
        const retryDelay = CONNECTION_RETRY_DELAY * connectionAttempts;
        console.info(`Reconnection attempt #${connectionAttempts} in ${retryDelay}ms`);
        setTimeout(() => {
          initializeConnection(messageHandler, config);
        }, retryDelay);
        connectionAttempts++;
      } else {
        console.warn('Max connection attempts reached, entering cooldown period.');
        clearTimeout(reconnectTimeout);
        reconnectTimeout = setTimeout(() => {
          connectionAttempts = 0;
          initializeConnection(messageHandler, config);
        }, RECONNECT_COOLDOWN);
      }
    });

  } catch (error) {
    console.error('Connection failed:', error);

    // Retry connection after delay
    if (connectionAttempts < MAX_CONNECTION_ATTEMPTS) {
      console.info(`Retrying connection in ${CONNECTION_RETRY_DELAY}ms. Attempt #${connectionAttempts + 1}`);
      setTimeout(() => {
        initializeConnection(messageHandler, config);
      }, CONNECTION_RETRY_DELAY);
      connectionAttempts++;
    } else {
      console.warn('Max connection attempts reached, entering cooldown period.');
      clearTimeout(reconnectTimeout);
      reconnectTimeout = setTimeout(() => {
        connectionAttempts = 0;
        initializeConnection(messageHandler, config);
      }, RECONNECT_COOLDOWN);
    }
  }

  console.debug('Connection initialization complete.');

  // Use runtime.onMessage for MV3
  browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    handleMessage(message, sender, sendResponse)
      .catch(error => console.error('Message handling error:', error));
    return true; // Keep channel open for async response
  });
}

export async function flushQueue() {
  if (!isConnected || !port || isProcessingQueue) return;
  isProcessingQueue = true;

  console.debug('Flushing message queue.');

  try {
    while (messageQueue.length > 0 && isConnected) {
      const batch = messageQueue.splice(0, CONFIG.QUEUE.BATCH_SIZE);
      console.debug(`Processing batch of ${batch.length} messages.`);
      await Promise.all(
        batch.map(msg => 
          Promise.race([
            _sendMessage(msg),
            new Promise((_, reject) => 
              setTimeout(() => reject(new Error('Message timeout')), CONFIG.TIMEOUT.MESSAGE)
            )
          ])
        )
      ).then(() => {
        console.info('Batch processed successfully.');
      }).catch(error => {
        console.error('Error in batch processing:', error);
        messageQueue.unshift(...batch); // Re-queue failed batch
        throw error; // Break the loop
      });
    }
  } catch (error) {
    console.error('Queue processing error:', error);
  } finally {
    isProcessingQueue = false;
    console.debug('Message queue flush complete.');
  }
}

// Add cleanup function for testing
export function _cleanup() {
  messageQueue.length = 0;
  isConnected = false;
  if (port) {
    port.onMessage.removeListener(messageCallback);
    port.onDisconnect.removeListener(disconnectCallback);
    port = null;
  }
  retryCount = 0;
  isProcessingQueue = false;
  connectionAttempts = 0;
  clearTimeout(reconnectTimeout);
}

// Improve _sendMessage with enhanced error handling and logging
export async function _sendMessage(message) {
  try {
    port.postMessage(message);
    console.debug('Message posted to port:', message);
    return Promise.resolve();
  } catch (error) {
    console.error('Error posting message to port:', error);
    return Promise.reject(error);
  }
}

// Replace deprecated methods with modern alternatives
export async function sendMessage(message) {
  if (browser.runtime && browser.runtime.sendMessage) {
    try {
      const response = await browser.runtime.sendMessage(message);
      return response;
    } catch (error) {
      console.error('sendMessage error:', error);
      throw error;
    }
  } else {
    console.warn('Runtime messaging API is not available.');
    // Fallback functionality or alternative implementation
  }
}

// Modern async iterator for batch processing
export async function* createBatchProcessor(messages, size = CONFIG.QUEUE.BATCH_SIZE) {
  if (!Array.isArray(messages)) {
    throw new TypeError('Messages must be an array');
  }
  if (typeof size !== 'number' || size < 1) {
    throw new TypeError('Batch size must be a positive number');
  }

  for (let i = 0; i < messages.length; i += size) {
    yield messages.slice(i, i + size);
  }
}

/**
 * Handles incoming messages from content scripts or other parts of the extension.
 * @param {Object} message - The incoming message.
 * @param {Object} sender - Information about the message sender.
 * @param {Function} sendResponse - Function to send a response back.
 * @param {Object} browserInstance - Browser API instance.
 * @param {Object} store - Redux store instance.
 */
export async function handleMessage(message, sender, sendResponse, browserInstance, store) {
  console.log('Message received:', message);
  try {
    console.debug('Handling message:', message);
    const handler = actionHandlers[message.action];
    if (handler) {
      await handler(message, sender, sendResponse, browserInstance, store);
      console.info(`Handled action: ${message.action}`);
    } else {
      console.warn("Unknown action:", message.action);
      sendResponse({ error: "Unknown action" });
    }
  } catch (error) {
    console.error("Error handling message:", error);
    sendResponse({ error: error.message });
  }
  sendResponse({ status: 'Message processed' });
}

export const createAlarm = (name, alarmInfo, browserInstance) => {
  browserInstance.alarms.create(name, alarmInfo);
};

export const onAlarm = (callback, browserInstance) => {
  browserInstance.alarms.onAlarm.addListener(callback);
};

// Centralize all error handling
export const ErrorHandler = Object.freeze({
  handle: (error, context) => {
    const errorInfo = {
      context,
      message: error.message,
      type: error instanceof MessagingError ? error.type : ERROR_TYPES.UNKNOWN,
      timestamp: Date.now()
    };
    console.error(`${context}:`, errorInfo);
    return errorInfo;
  },
  
  wrap: (fn, context) => async (...args) => {
    try {
      return await fn(...args);
    } catch (error) {
      return ErrorHandler.handle(error, context);
    }
  }
});

// Centralize Service Worker handling
export const ServiceWorker = Object.freeze({
  async register() {
    if (!await checkPermissions('SERVICE_WORKER')) {
      throw new MessagingError(ERROR_TYPES.PERMISSION_DENIED, 'Service Worker permissions not granted');
    }
    return browser.runtime.getURL('background.js').then(url => 
      navigator.serviceWorker.register(url, { 
        type: 'module',
        scope: '/'
      })
    );
  },

  initialize: {
    onInstall: ErrorHandler.wrap(async () => {
      await initializeStateFromStorage();
      console.info('Service worker installed');
    }, 'ServiceWorker.onInstall'),
    
    onActivate: ErrorHandler.wrap(async () => {
      await restoreState();
      // Ensure service worker takes control immediately
      await self.clients.claim();
      console.info('Service worker activated');
    }, 'ServiceWorker.onActivate')
  },

  handleMessage: ErrorHandler.wrap(async (event) => {
    if (!event?.data?.type) return;
    
    switch (event.data.type) {
      case MESSAGE_TYPES.STATE_SYNC:
        await handleStateSync(event.data.payload);
        break;
      case MESSAGE_TYPES.TAB_ACTION:
        await handleTabAction(event.data.payload);
        break;
      default:
        console.warn('Unknown service worker message:', event.data.type);
    }
  }, 'ServiceWorker.handleMessage')
});

// Export a cleanup utility for testing
export const cleanup = Object.freeze({
  resetState: () => {
    messageQueue.length = 0;
    isConnected = false;
    port = null;
    retryCount = 0;
    isProcessingQueue = false;
    connectionAttempts = 0;
    clearTimeout(reconnectTimeout);
  },
  removeListeners: () => {
    if (port) {
      port.onMessage.removeListener(messageCallback);
      port.onDisconnect.removeListener(disconnectCallback);
    }
  }
});
export class ServiceWorkerManager {
  static async initialize() {
    if (!('serviceWorker' in navigator)) {
      throw new Error('Service Worker API not available');
    }

    await validatePermissions(PERMISSIONS.REQUIRED.MESSAGING);

    return {
      async install(event) {
        await event.waitUntil(
          Promise.all([
            self.skipWaiting(),
            initializeStateFromStorage()
          ])
        );
      },

      async activate(event) {
        await event.waitUntil(
          Promise.all([
            self.clients.claim(),
            recoverState()
          ])
        );
      },

      async message(event) {
        const { type, payload } = event.data ?? {};
        if (!type) return;

        try {
          validateMessage({ type, payload });
          await handleMessage(event);
        } catch (error) {
          console.error('Message handling error:', error);
        }
      }
    };
  }
}

// Add async iterator for batch message processing
export async function* processBatch(messages, size = BATCH_CONFIG.DEFAULT_SIZE) {
  if (!Array.isArray(messages)) {
    throw new TypeError('Messages must be an array');
  }

  for (let i = 0; i < messages.length; i += size) {
    yield messages.slice(i, i + size);
  }
}

export const MESSAGE_TYPES = Object.freeze({
  STATE_SYNC: 'STATE_SYNC',
  STATE_UPDATE: 'STATE_UPDATE',
  TAB_ACTION: 'TAB_ACTION',
  CONNECTION_ACK: 'CONNECTION_ACK',
  ERROR: 'ERROR',
  // ...other message types...
});