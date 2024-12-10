// src/content/content.js
/**
 * @fileoverview Content script for tracking tab activity in TabCurator.
 * Communicates with the background service worker to report activity.
 * Implements a connection management system with retry logic.
 */

import browser from 'webextension-polyfill';
import { initializeConnection, sendMessage } from '../utils/messagingUtils.js';

(() => {
  let isUnloaded = false;

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
        // Try port first, fallback to sendMessage
        sendMessage({
          action: 'DISPATCH_ACTION',
          payload: { type: 'UPDATE_TAB_ACTIVITY', timestamp: Date.now() }
        });
      }, 1000);
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
    activityEvents.forEach((event) => {
      window.removeEventListener(event, updateActivity);
    });
    console.log('Content script unloaded and cleaned up.');
  }

  // Handle tab unload
  window.addEventListener('beforeunload', cleanupOnUnload, { once: true });

  // Initialize connection using utils
  initializeConnection(sendMessage);
})();