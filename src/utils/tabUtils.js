// src/utils/tabUtils.js
/**
 * @fileoverview Utility functions for querying and managing browser tabs.
 * Provides browser-agnostic implementations for tab operations.
 */
import browser from 'webextension-polyfill';

/**
 * Wrapper for querying tabs.
 * @param {Object} queryOptions - Information to filter tabs.
 * @returns {Promise<Array>} Resolves with an array of tabs matching the query.
 */
export function queryTabs(queryOptions = {}) {
  if (!browser.tabs || !browser.tabs.query) {
    const error = new Error('Browser API unavailable');
    console.error(error);
    return Promise.reject(error);
  }
  return browser.tabs.query(queryOptions).catch((err) => {
    console.error("Error querying tabs:", err);
    throw err;
  });
}

/**
 * Wrapper for getting a specific tab.
 * @param {number} tabId - ID of the tab to retrieve.
 * @returns {Promise<Object>} Resolves with the retrieved tab.
 */
export function getTab(tabId) {
  if (!browser.tabs || !browser.tabs.get) {
    const error = new Error('Browser API unavailable');
    console.error(error);
    return Promise.reject(error);
  }
  if (!tabId || typeof tabId !== 'number') {
    const error = new Error('Tab ID must be a valid number');
    console.error(error);
    return Promise.reject(error);
  }
  return browser.tabs.get(tabId)
    .then(tab => {
      if (!tab.id || !tab.url) {
        const error = new Error('Invalid tab data');
        console.error(error);
        throw error;
      }
      return tab;
    })
    .catch((err) => {
      console.error(`Error retrieving tab ${tabId}:`, err);
      throw err;
    });
}

/**
 * Wrapper for creating a new tab.
 * @param {Object} createProperties - Properties for the new tab.
 * @returns {Promise<Object>} Resolves with the created tab.
 */
export function createTab(createProperties) {
  if (!browser.tabs || !browser.tabs.create) {
    const error = new Error('Browser API unavailable');
    console.error(error);
    return Promise.reject(error);
  }
  return browser.tabs.create(createProperties).catch((err) => {
    console.error("Error creating tab:", err);
    throw err;
  });
}

/**
 * Wrapper for updating a tab.
 * @param {number} tabId - ID of the tab to update.
 * @param {Object} updateProperties - Properties to update on the tab.
 * @returns {Promise<Object>} Resolves with the updated tab.
 */
export function updateTab(tabId, updateProperties) {
  if (!browser.tabs || !browser.tabs.update) {
    const error = new Error('Browser API unavailable');
    console.error(error);
    return Promise.reject(error);
  }
  if (!tabId || typeof tabId !== 'number') {
    const error = new Error('Tab ID must be a valid number');
    console.error(error);
    return Promise.reject(error);
  }
  if (!updateProperties || typeof updateProperties !== 'object') {
    const error = new Error('Update info must be a valid object');
    console.error(error);
    return Promise.reject(error);
  }
  return browser.tabs.update(tabId, updateProperties).catch((err) => {
    console.error(`Error updating tab ${tabId}:`, err);
    throw err;
  });
}

/**
 * Wrapper for removing a tab.
 * @param {number} tabId - ID of the tab to remove.
 * @returns {Promise<void>} Resolves when the tab is removed.
 */
export function removeTab(tabId) {
  if (!browser.tabs || !browser.tabs.remove) {
    const error = new Error('Browser API unavailable');
    console.error(error);
    return Promise.reject(error);
  }
  if (!tabId || typeof tabId !== 'number') {
    const error = new Error('Tab ID must be a valid number');
    console.error(error);
    return Promise.reject(error);
  }
  return browser.tabs.remove(tabId).catch((err) => {
    console.error(`Error removing tab ${tabId}:`, err);
    throw err;
  });
}

/**
 * Wrapper for discarding a tab.
 * @param {number} tabId - ID of the tab to discard.
 * @returns {Promise<Object>} Resolves with the discarded tab or void if not supported.
 */
const supportsDiscard = !!browser.tabs.discard;
export function discardTab(tabId) {
  if (supportsDiscard) {
    return browser.tabs.discard(tabId).catch((err) => {
      console.error(`Error discarding tab ${tabId}:`, err);
      throw err;
    });
  } else {
    console.warn("Tab discard not supported by this browser.");
    return Promise.resolve(); // Gracefully handle unsupported discard operation
  }
}