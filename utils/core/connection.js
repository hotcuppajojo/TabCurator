// utils/core/connection.js
/**
 * @fileoverview Runtime messaging and connection management.
 * Handles ALL actual messaging logic - message.js only provides constants.
 * 
 * @module utils/core/connection
 */

export const CONNECTION_NAME = 'tabActivity';

/**
 * Establishes a persistent connection with the background script.
 * @returns {chrome.runtime.Port} Connection port object.
 */
export const connectToBackground = () => chrome.runtime.connect({ name: CONNECTION_NAME });

/**
 * Sends a message to the background script and awaits response.
 * @param {string} action - The action type.
 * @param {Object} [payload={}] - Additional data.
 * @returns {Promise<any>} Resolves with the background script's response.
 */
export const sendMessageToBackground = async (action, payload = {}) => {
  try {
    const response = await chrome.runtime.sendMessage({ action, payload });
    return response;
  } catch (error) {
    console.error(`Failed to send message to background: ${error.message}`);
    throw error;
  }
};

/**
 * Listens for messages from background scripts and handles them.
 * @param {Function} callback - Function to process incoming messages.
 */
export const listenForMessages = (callback) => {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    callback(message, sender, sendResponse);
    return true; // Keeps the listener alive for async responses
  });
};

/**
 * Broadcasts a message to all connected ports.
 * @param {Object} message - Message to broadcast
 * @returns {Promise<void>}
 */
export const broadcastMessage = async (message) => {
  // Implementation would be here in the actual connection manager
};

/**
 * Validates message structure before sending.
 * @param {Object} message - Message to validate
 * @returns {boolean} True if valid
 */
export const validateMessage = (message) => {
  return !!message && typeof message.type === 'string';
};

// Connection States
export const CONNECTION_STATES = Object.freeze({
  INITIALIZE: 'CONNECTION_INITIALIZED',
  READY: 'CONNECTION_READY',
  DISCONNECTED: 'CONNECTION_DISCONNECTED',
  ERROR: 'CONNECTION_ERROR'
});