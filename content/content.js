// content/content.js
/**
 * @fileoverview Content script for tracking tab activity in TabCurator.
 * Communicates with the background service worker to report activity.
 * Implements a debounced activity reporting mechanism.
 */

import browser from 'webextension-polyfill';
import { 
  MESSAGE_TYPES, 
  ACTION, 
  sendMessageToBackground,
  ERROR_TYPES,
  recordTelemetry,
  TELEMETRY_EVENTS
} from '../utils/core/index.js';

// Simple logger for content script
const logger = {
  warn: (msg, data) => console.warn(`[TabCurator] ${msg}`, data),
  error: (msg, data) => console.error(`[TabCurator] ${msg}`, data),
  info: (msg, data) => console.info(`[TabCurator] ${msg}`, data)
};

// Debounce helper
const debounce = (fn, delay) => {
  let timeoutId;
  return (...args) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  };
};

// Send activity updates to service worker using the core messaging utilities
const reportActivity = debounce(async () => {
  try {
    // Use core messaging to send activity update
    await sendMessageToBackground({
      type: MESSAGE_TYPES.TAB_ACTION,
      action: ACTION.TAB.UPDATE,
      payload: {
        lastAccessed: Date.now()
      }
    });
    
    // Optionally record telemetry for active tab usage
    recordTelemetry(TELEMETRY_EVENTS.TAB_ACTIVITY, {
      timestamp: Date.now()
    });
  } catch (error) {
    // Only log non-extension-invalidation errors
    if (!error.message.includes('Extension context invalidated')) {
      logger.warn('Failed to report activity:', { error: error.message });
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
    logger.info('Tab became visible, reporting activity');
  }
});

// Initial activity report when content script loads
reportActivity();

// Cleanup on unload
window.addEventListener('beforeunload', () => {
  ['mousemove', 'keydown', 'scroll', 'click'].forEach(event => {
    window.removeEventListener(event, reportActivity);
  });
}, { once: true });