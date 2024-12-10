/**
 * Utility functions for managing extension connections and messaging
 */

/**
 * Establishes a connection with the background script
 * @returns {browser.runtime.Port}
 */
export const connectToBackground = () => {
  return browser.runtime.connect({ name: 'content-script' });
};

/**
 * Sends a message to the background script
 * @param {any} message - Message to send
 * @returns {Promise<any>}
 */
export const sendMessage = async (message) => {
  try {
    return await browser.runtime.sendMessage(message);
  } catch (error) {
    console.error('Error sending message:', error);
    throw error;
  }
};

/**
 * Initializes the connection with the background script
 * @param {Function} messageHandler - Function to handle received messages
 * @returns {void}
 */
export const initializeConnection = (messageHandler) => {
  const port = connectToBackground();
  
  port.onMessage.addListener((message) => {
    if (messageHandler) {
      messageHandler(message);
    }
  });

  port.onDisconnect.addListener(() => {
    console.log('Disconnected from background script');
  });
};