// src/content/content.js
/**
 * @fileoverview Content script for tracking tab activity in TabCurator.
 * Communicates with the background service worker to report activity.
 * Implements a connection management system with retry logic.
 */

import browser from 'webextension-polyfill';

(() => {
  let port = null;
  let isConnected = false;
  const messageQueue = [];
  const MAX_QUEUE_SIZE = 100; // Prevent unbounded growth of the message queue
  let retryCount = 0;
  const MAX_RETRIES = 3;
  let isUnloaded = false;

  /**
   * Establishes a connection with the background script.
   * Automatically retries on failure with exponential backoff.
   */
  function connectToExtension() {
    if (isUnloaded) return;
    // Prevent unbounded growth of the message queue
    try {
      port = browser.runtime.connect({ name: 'tabActivity' });
      // Handle disconnection events
      port.onDisconnect.addListener(() => {
        console.warn('Disconnected from the background script.');
        isConnected = false;
        port = null;
        // Reconnect with exponential backoff
        if (!isUnloaded && retryCount < MAX_RETRIES) {
          retryCount++;
          const retryDelay = Math.min(1000 * retryCount, 5000); // Exponential backoff
          setTimeout(connectToExtension, retryDelay);
        }
      });
      // Re-establish connection on message from the background script
      port.onMessage.addListener(() => {
        console.log('Connection to background script re-established.');
        isConnected = true;
        retryCount = 0;

        // Process queued messages
        while (messageQueue.length > 0 && isConnected && !isUnloaded) {
          const message = messageQueue.shift();
          sendMessage(message);
        }
      });
      // Process queued messages
      isConnected = true;
      retryCount = 0;
      console.log('Successfully connected to the background script.');
    } catch (error) {
      console.error('Error establishing connection to background script:', error);
      isConnected = false;
    }
  }

  /**
   * Sends a message to the background script.
   * Queues the message if the connection is not established.
   * @param {Object} message - The message to send.
   */
  function sendMessage(message) {
    if (isUnloaded) return;

    if (!port || !isConnected) {
      if (messageQueue.length < MAX_QUEUE_SIZE) {
        messageQueue.push(message);
      } else {
        console.warn('Message queue is full. Dropping oldest message.');
        messageQueue.shift();
        messageQueue.push(message);
      }
      connectToExtension();
      return;
    }

    try {
      port.postMessage(message);
    } catch (error) {
      console.error('Error sending message to background script:', error);

      // Reconnect on invalid context or other recoverable errors
      if (!isUnloaded) {
        messageQueue.push(message);
        isConnected = false;
        connectToExtension();
      }
    }
  }

  /**
   * Sends an action to the background script.
   * @param {Object} action - The action to dispatch.
   */
  function dispatchAction(action) {
    browser.runtime.sendMessage({ action: 'DISPATCH_ACTION', payload: action })
      .catch((error) => {
        console.error('Error dispatching action to background script:', error);
      });
  }

  /**
   * Reports user activity to the background script.
   * Debounced to reduce the frequency of messages.
   */
  const updateActivity = (() => {
    let timeout;
    return () => {
      if (isUnloaded) return;

      clearTimeout(timeout);
      timeout = setTimeout(() => {
        dispatchAction({ type: 'UPDATE_TAB_ACTIVITY', timestamp: Date.now() });
      }, 1000); // 1-second debounce
    };
  })();

  // Event listeners for tracking activity
  const activityEvents = ['mousemove', 'keydown', 'scroll'];
  activityEvents.forEach((event) => {
    window.addEventListener(event, updateActivity, { passive: true });
  });

  /**
   * Cleans up resources when the tab is unloaded.
   * Disconnects from the background script and removes event listeners.
   */
  function cleanupOnUnload() {
    isUnloaded = true;
    if (port) {
      port.disconnect();
    }
    activityEvents.forEach((event) => {
      window.removeEventListener(event, updateActivity);
    });
    console.log('Content script unloaded and cleaned up.');
  }

  // Handle tab unload
  window.addEventListener('beforeunload', cleanupOnUnload, { once: true });

  // Initialize connection
  connectToExtension();
})();