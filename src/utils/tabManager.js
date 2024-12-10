
/**
 * @fileoverview Unified tab management utilities.
 * Handles tab operations, querying, and suspension.
 */
import browser from 'webextension-polyfill';

/**
 * Wrapper for querying tabs.
 * @param {Object} queryOptions - Information to filter tabs.
 * @returns {Promise<Array>} Resolves with an array of tabs matching the query.
 */
export async function queryTabs(queryOptions = {}) {
  try {
    if (!browser.tabs || !browser.tabs.query) {
      throw new Error('Browser API unavailable');
    }
    return await browser.tabs.query(queryOptions);
  } catch (err) {
    console.error("Error querying tabs:", err);
    throw err;
  }
}

/**
 * Wrapper for getting a specific tab.
 * @param {number} tabId - ID of the tab to retrieve.
 * @returns {Promise<Object>} Resolves with the retrieved tab.
 */
export async function getTab(tabId) {
  try {
    if (!browser.tabs || !browser.tabs.get) {
      throw new Error('Browser API unavailable');
    }
    if (!tabId || typeof tabId !== 'number') {
      throw new Error('Tab ID must be a valid number');
    }
    const tab = await browser.tabs.get(tabId);
    if (!tab.id || !tab.url) {
      throw new Error('Invalid tab data');
    }
    return tab;
  } catch (err) {
    console.error(`Error retrieving tab ${tabId}:`, err);
    throw err;
  }
}

/**
 * Wrapper for creating a new tab.
 * @param {Object} createProperties - Properties for the new tab.
 * @returns {Promise<Object>} Resolves with the created tab.
 */
export async function createTab(createProperties) {
  try {
    if (!browser.tabs || !browser.tabs.create) {
      throw new Error('Browser API unavailable');
    }
    return await browser.tabs.create(createProperties);
  } catch (err) {
    console.error("Error creating tab:", err);
    throw err;
  }
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

/**
 * Suspends a tab by discarding it if supported.
 * @param {number} tabId - The ID of the tab to suspend.
 * @returns {Promise<Object>} - The discarded tab object.
 */
export async function suspendTab(tabId) {
  try {
    if (typeof tabId !== 'number') {
      throw new Error('Invalid tab ID');
    }

    if (!browser.tabs.discard) {
      console.warn('Tab discard is not supported by this browser.');
      return;
    }

    const tab = await getTab(tabId);
    if (tab.discarded) {
      console.log(`Tab ${tabId} is already discarded.`);
      return;
    }

    const discardedTab = await browser.tabs.discard(tabId);
    return discardedTab;
  } catch (error) {
    console.error(`Failed to suspend tab ${tabId}:`, error);
    throw error;
  }
}

/**
 * Suspends inactive tabs based on criteria.
 * @param {object} browserInstance - Browser API instance.
 */
export async function suspendInactiveTabs(browserInstance) {
  if (!browserInstance?.tabs) {
    console.error('Tabs API not available');
    return;
  }

  try {
    const inactiveTabs = await browserInstance.tabs.query({ active: false });
    
    for (const tab of inactiveTabs) {
      try {
        // First check if tab still exists
        const currentTab = await browserInstance.tabs.get(tab.id);
        if (!currentTab) {
          console.log(`Tab ${tab.id} no longer exists, skipping...`);
          continue;
        }

        // Attempt to suspend the tab
        await suspendTab(tab.id);
        console.log(`Suspended tab: ${tab.title}`);

        // Try to bookmark if the API is available
        if (browserInstance.bookmarks && browserInstance.bookmarks.create) {
          try {
            await browserInstance.bookmarks.create({
              title: tab.title,
              url: tab.url,
              parentId: '1'
            });
            console.log(`Bookmarked tab: ${tab.title}`);
          } catch (bookmarkError) {
            console.error(`Failed to bookmark tab ${tab.id}:`, bookmarkError);
          }
        } else {
          console.warn('Bookmarks API not available, skipping bookmark creation');
        }

        // Try to close the tab
        try {
          await browserInstance.tabs.get(tab.id);
          await browserInstance.tabs.remove(tab.id);
          console.log(`Closed tab: ${tab.title}`);
        } catch (closeError) {
          if (closeError.message.includes('No tab with id')) {
            console.log(`Tab ${tab.id} already closed`);
          } else {
            console.error(`Failed to close tab ${tab.id}:`, closeError);
          }
        }
      } catch (tabError) {
        console.error(`Error processing tab ${tab.id}:`, tabError);
        continue;
      }
    }
  } catch (error) {
    console.error("Error suspending inactive tabs:", error);
  }
}