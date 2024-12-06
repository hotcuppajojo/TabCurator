// src/utils/suspensionUtils.js
/**
 * @fileoverview Utility functions for suspending tabs.
 * Provides methods to reduce memory usage by suspending inactive tabs.
 */
import browser from 'webextension-polyfill';

/**
 * Suspends a tab to reduce memory usage by discarding it.
 * 
 * @param {number} tabId - The ID of the tab to suspend.
 * @returns {Promise<void|Object>} Resolves with the discarded tab object if supported,
 *                                 resolves with void if discard is unsupported,
 *                                 or rejects on error.
 */
export async function suspendTab(tabId) {
  // Validate tabId
  if (typeof tabId !== 'number') {
    throw new Error('Invalid tab ID');
  }

  if (browser.tabs.discard) {
    try {
      const discardedTab = await browser.tabs.discard(tabId);
      return discardedTab; // Successfully discarded tab
    } catch (error) {
      console.error(`Failed to suspend tab ${tabId}:`, error);
      throw error; // Reject with error details
    }
  } else {
    console.warn("Tab discard is not supported by this browser.");
    return Promise.resolve(); // Gracefully resolve if unsupported
  }
}