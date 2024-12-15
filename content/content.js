// content/content.js
/**
 * @fileoverview Content script for tracking tab activity in TabCurator.
 * Communicates with the background service worker to report activity.
 * Implements a debounced activity reporting mechanism.
 */

import browser from 'webextension-polyfill';

/**
 * Debounced function to report user activity.
 * Prevents excessive messaging by limiting the frequency of reports.
 */
const createDebouncedActivityReporter = (delay = 1000) => {
  let timeoutId;
  return async () => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(async () => {
      try {
        // Dispatch an action to update tab activity
        await browser.runtime.sendMessage({
          action: 'DISPATCH_ACTION',
          payload: { type: 'UPDATE_TAB_ACTIVITY', timestamp: Date.now() }
        });
        console.log('Tab activity updated.');
      } catch (error) {
        console.error('Failed to update tab activity:', error);
      }
    }, delay);
  };
};

// Initialize the debounced activity reporter
const reportActivity = createDebouncedActivityReporter();

// List of user interaction events to monitor
const activityEvents = ['mousemove', 'keydown', 'scroll'];

// Add event listeners to monitor user activity
activityEvents.forEach((event) => {
  window.addEventListener(event, reportActivity, { passive: true });
});

/**
 * Cleans up event listeners when the content script is unloaded.
 */
const cleanupOnUnload = () => {
  activityEvents.forEach((event) => {
    window.removeEventListener(event, reportActivity);
  });
  console.log('Content script unloaded and cleaned up.');
};

// Register the cleanup function to run when the page is about to unload
window.addEventListener('beforeunload', cleanupOnUnload, { once: true });