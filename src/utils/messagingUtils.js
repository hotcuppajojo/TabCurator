// src/utils/messagingUtils.js
/**
 * @fileoverview Unified messaging and connection utilities.
 */
import browser from 'webextension-polyfill';

// Export constants for testing and configuration
export const MAX_QUEUE_SIZE = 100;
export const CONNECTION_NAME = 'content-connection';

// Add constants for retry and timeout configuration
export const RETRY_DELAY = 1000; // 1 second between retries
export const MAX_RETRIES = 3;
export const MESSAGE_TIMEOUT = 5000; // 5 second timeout for messages
export const BATCH_SIZE = 10; // Process messages in batches

let retryCount = 0;
let isProcessingQueue = false;

// Import handlers from consolidated stateManager
import { 
  saveSessionHandler, 
  restoreSessionHandler, 
  getSessions, 
  deleteSessionHandler,
  updateRulesHandler 
} from './stateManager.js';

import { suspendInactiveTabs } from './tabManager.js';

// Connection and queue state
let port = null;
let isConnected = false;
const messageQueue = [];

// Add connection state tracking
let connectionAttempts = 0;
const MAX_CONNECTION_ATTEMPTS = 3;
const CONNECTION_RETRY_DELAY = 1000;
const RECONNECT_COOLDOWN = 5000;
let reconnectTimeout = null;

// Store references to the listener functions
let messageCallback;
let disconnectCallback;

/**
 * Mapping of message actions to their corresponding handler functions.
 */
const actionHandlers = {
  'saveSession': saveSessionHandler,
  'SAVE_SESSION': saveSessionHandler,
  'restoreSession': restoreSessionHandler,
  'RESTORE_SESSION': restoreSessionHandler,
  'suspendInactiveTabs': suspendInactiveTabs,
  'getSessions': getSessions,
  'updateRules': updateRulesHandler,
  'UPDATE_RULES': updateRulesHandler,
  'deleteSession': deleteSessionHandler,
  'getState': (message, sender, sendResponse, browserInstance, store) => {
    sendResponse({ state: store.getState() });
  },
  'DISPATCH_ACTION': (message, sender, sendResponse, browserInstance, store) => {
    store.dispatch(message.payload);
    sendResponse({ success: true });
  }
};

export function initializeConnection(messageHandler) {
  try {
    if (connectionAttempts >= MAX_CONNECTION_ATTEMPTS) {
      console.warn('Max connection attempts reached, cooling down...');
      clearTimeout(reconnectTimeout);
      reconnectTimeout = setTimeout(() => {
        connectionAttempts = 0;
        initializeConnection(messageHandler);
      }, RECONNECT_COOLDOWN);
      return;
    }

    connectionAttempts++;
    port = browser.runtime.connect({ name: CONNECTION_NAME });
    
    port.onMessage.addListener(messageCallback = async (message) => {
      if (message.type === 'CONNECTION_ACK') {
        console.log('Connection established successfully');
        isConnected = true;
        connectionAttempts = 0;
        await flushQueue();
      } else {
        await messageHandler(message);
      }
    });

    port.onDisconnect.addListener(disconnectCallback = () => {
      console.log('Connection lost, attempting reconnect...');
      isConnected = false;
      port = null;
      
      // Retry connection after delay
      setTimeout(() => {
        if (!isConnected) {
          initializeConnection(messageHandler);
        }
      }, CONNECTION_RETRY_DELAY);
    });

  } catch (error) {
    console.error('Connection failed:', error);
    
    // Retry connection after delay
    setTimeout(() => {
      if (!isConnected) {
        initializeConnection(messageHandler);
      }
    }, CONNECTION_RETRY_DELAY);
  }
}

async function flushQueue() {
  if (!isConnected || !port || isProcessingQueue) return;
  isProcessingQueue = true;

  try {
    while (messageQueue.length > 0 && isConnected) {
      const batch = messageQueue.splice(0, BATCH_SIZE);
      await Promise.all(
        batch.map(msg => 
          Promise.race([
            _sendMessage(msg),
            new Promise((_, reject) => 
              setTimeout(() => reject(new Error('Message timeout')), MESSAGE_TIMEOUT)
            )
          ])
        )
      ).catch(error => {
        console.error('Error in batch processing:', error);
        messageQueue.unshift(...batch); // Re-queue failed batch
        throw error; // Break the loop
      });
    }
  } catch (error) {
    console.error('Queue processing error:', error);
  } finally {
    isProcessingQueue = false;
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

async function _sendMessage(message) {
  return new Promise((resolve, reject) => {
    try {
      port.postMessage(message);
      resolve();
    } catch (error) {
      reject(error);
    }
  });
}

export async function sendMessage(message) {
  if (isConnected && port) {
    return _sendMessage(message);
  } else {
    if (messageQueue.length >= MAX_QUEUE_SIZE) {
      console.warn('Message queue full, dropping oldest message');
      messageQueue.shift();
    }
    messageQueue.push(message);
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
  try {
    const handler = actionHandlers[message.action];
    if (handler) {
      await handler(message, sender, sendResponse, browserInstance, store);
    } else {
      console.warn("Unknown action:", message.action);
      sendResponse({ error: "Unknown action" });
    }
  } catch (error) {
    console.error("Error handling message:", error);
    sendResponse({ error: error.message });
  }
}