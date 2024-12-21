// content/content.js
/**
 * @fileoverview Content script for tracking tab activity in TabCurator.
 * Communicates with the background service worker to report activity.
 * Implements a debounced activity reporting mechanism.
 */

import browser from 'webextension-polyfill';
import { MESSAGE_TYPES, TAB_OPERATIONS } from '../utils/constants.js'; // Add TAB_OPERATIONS import

// Debounce helper
const debounce = (fn, delay) => {
  let timeoutId;
  return (...args) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  };
};

// Send activity updates to service worker
const reportActivity = debounce(async () => {
  try {
    await browser.runtime.sendMessage({
      type: MESSAGE_TYPES.TAB_ACTION,
      action: TAB_OPERATIONS.UPDATE,
      payload: {
        tabId: null, // Will be resolved to current tab
        properties: {
          lastAccessed: Date.now()
        }
      }
    });
  } catch (error) {
    if (!error.message.includes('Extension context invalidated')) {
      logger.warn('Failed to report activity:', error);
    }
  }
}, 1000);

// Monitor user activity
['mousemove', 'keydown', 'scroll', 'click'].forEach(event => {
  window.addEventListener(event, reportActivity, { passive: true });
});

// Report activity when tab becomes visible
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    reportActivity();
  }
});

// Cleanup on unload
window.addEventListener('beforeunload', () => {
  ['mousemove', 'keydown', 'scroll', 'click'].forEach(event => {
    window.removeEventListener(event, reportActivity);
  });
}, { once: true });