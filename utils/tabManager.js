// utils/tabManager.js
/**
 * @fileoverview Unified tab management utilities.
 * Handles tab operations, querying, and suspension.
 */
import browser from 'webextension-polyfill';
import { store } from './stateManager.js';
import { updateTabActivity, archiveTab, actions } from './stateManager.js';
import { getOrCreateTabCuratorFolder } from './tagUtils.js';
import { MESSAGE_TYPES, checkPermissions, PERMISSIONS } from './messagingUtils.js';
import { TAB_STATES, VALIDATION_TYPES } from './types.js';

// Add explicit permission requirements
export const REQUIRED_PERMISSIONS = Object.freeze({
  BASE: ['tabs'],
  OPTIONAL: ['declarativeNetRequest']
});

// Add permission validation
export async function validatePermissions(type = 'BASE') {
  const permissions = await browser.permissions.getAll();
  return REQUIRED_PERMISSIONS[type].every(
    p => permissions.permissions.includes(p)
  );
}

// Add MV3 specific tab handling
export const TAB_OPERATIONS = Object.freeze({
  DISCARD: 'discard',
  BOOKMARK: 'bookmark',
  ARCHIVE: 'archive',
  UPDATE: 'update'
});

// Add operation validation
export const validateOperation = async (operation, tab) => {
  if (!TAB_OPERATIONS[operation]) {
    throw new Error(`Invalid operation: ${operation}`);
  }
  
  const permissions = await checkPermissions(TAB_PERMISSIONS.REQUIRED);
  if (!permissions) {
    throw new Error('Required permissions not granted');
  }
  
  return true;
};

// Add inactivity threshold management
export const INACTIVITY_THRESHOLDS = Object.freeze({
  PROMPT: 1800000, // 30 minutes
  SUSPEND: 3600000  // 1 hour
});

/**
 * Queries tabs based on the provided query info.
 * @param {object} queryInfo - The query information.
 * @returns {Promise<Array>} - A promise that resolves to an array of tabs.
 */
export async function queryTabs(queryInfo) {
  await validatePermissions();
  try {
    const tabs = await browser.tabs.query(queryInfo);
    return tabs;
  } catch (error) {
    console.error('Error querying tabs:', error);
    throw error;
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

    // Update tab activity in the state
    store.dispatch(updateTabActivity(tabId, Date.now()));

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
export async function updateTab(tabId, updateProperties) {
  try {
    const updatedTab = await browser.tabs.update(tabId, updateProperties);
    store.dispatch(actions.tab.updateActivity(tabId, Date.now()));
    return updatedTab;
  } catch (err) {
    console.error(`Error updating tab ${tabId}:`, err);
    throw err;
  }
}

/**
 * Wrapper for removing a tab.
 * @param {number} tabId - ID of the tab to remove.
 * @returns {Promise<void>} Resolves when the tab is removed.
 */
export async function removeTab(tabId) {
  try {
    await browser.tabs.remove(tabId);

    // Dispatch an action to archive the removed tab
    store.dispatch(archiveTab(tabId, 'Removed', { id: tabId }));

  } catch (err) {
    console.error(`Error removing tab ${tabId}:`, err);
    throw err;
  }
}

/**
 * Discards a tab by unloading it from memory, bookmarking it first for safety.
 * @param {number} tabId - The ID of the tab to discard.
 * @param {Object} [criteria] - Optional criteria to check before discarding.
 * @returns {Promise<void>}
 */
export async function discardTab(tabId, criteria) {
  if (!await checkPermissions('TABS')) {
    throw new Error('Required tab permissions not granted');
  }

  try {
    const tab = await browser.tabs.get(tabId);
    if (!tab) {
      console.warn(`Tab with ID ${tabId} does not exist.`);
      return;
    }

    // Check if tab should not be discarded
    if (tab.active || tab.pinned) {
      console.warn(`Cannot discard active or pinned tab with ID: ${tabId}.`);
      return;
    }

    // Check optional criteria
    if (criteria?.urlPattern && !criteria.urlPattern.test(tab.url)) {
      console.info(`Tab ${tabId} does not meet criteria for discarding.`);
      return;
    }

    // First bookmark the tab for safety
    if (browser.bookmarks) {
      try {
        await bookmarkTab(tabId);
        console.log(`Bookmarked tab before discarding: ${tab.title}`);
      } catch (bookmarkError) {
        console.error(`Failed to bookmark tab ${tabId}:`, bookmarkError);
        // Continue with discard even if bookmark fails
      }
    }

    await browser.tabs.discard(tabId);
    console.log(`Tab ${tabId} discarded successfully.`);
  } catch (error) {
    console.error(`Error discarding tab ${tabId}:`, error);
    if (error.message.includes("No tab with id")) {
      console.warn(`Tab ${tabId} already closed or does not exist.`);
    } else {
      throw error;
    }
  }
}

/**
 * Discards all inactive tabs that meet specified criteria.
 * @returns {Promise<void>}
 */
export async function discardInactiveTabs() {
  if (!browser?.tabs) {
    console.error('Tabs API not available');
    return;
  }

  try {
    const inactiveTabs = await browser.tabs.query({ active: false });
    
    for (const tab of inactiveTabs) {
      // Update to use typed messages
      await discardTab(tab.id, {
        type: MESSAGE_TYPES.TAB_ACTION,
        action: 'discard'
      });
    }
  } catch (error) {
    console.error("Error discarding inactive tabs:", error);
  }
}

/**
 * Bookmarks a tab in the 'TabCurator' folder.
 * Ensures the Bookmarks API is available.
 * @param {number} tabId - The ID of the tab to bookmark.
 * @returns {Promise<void>}
 */
export async function bookmarkTab(tabId) {
  try {
    if (!browser.bookmarks) {
      throw new Error('Bookmarks API not available');
    }

    const tab = await browser.tabs.get(tabId);
    if (!tab) {
      throw new Error(`Tab with ID ${tabId} does not exist.`);
    }

    // Use the shared folder management function from tagUtils.js
    const folder = await getOrCreateTabCuratorFolder();

    // Create the bookmark
    await browser.bookmarks.create({
      parentId: folder.id,
      title: tab.title,
      url: tab.url
    });

    await browser.runtime.sendMessage({
      type: MESSAGE_TYPES.TAB_ACTION,
      action: 'bookmark',
      payload: { tabId }
    });

    console.log(`Tab ${tabId} bookmarked in 'TabCurator' folder.`);
  } catch (error) {
    console.error(`Failed to bookmark tab ${tabId}:`, error);
    throw error;
  }
}

/**
 * Checks for inactive tabs and handles them based on inactivity thresholds.
 * @returns {Promise<void>}
 */
export async function checkInactiveTabs() {
  const now = Date.now();
  const tabs = await browser.tabs.query({});
  
  for (const tab of tabs) {
    const lastActivity = store.getState().tabActivity[tab.id] || now;
    const inactiveTime = now - lastActivity;

    if (inactiveTime >= INACTIVITY_THRESHOLDS.SUSPEND) {
      await discardTab(tab.id);
    } else if (inactiveTime >= INACTIVITY_THRESHOLDS.PROMPT) {
      store.dispatch({ 
        type: 'SET_TAGGING_PROMPT_ACTIVE', 
        payload: { tabId: tab.id, value: true } 
      });
    }
  }
}

// Improve inactivity handling
export const handleInactiveTab = async (tab, thresholds) => {
  const lastActivity = await getTabActivity(tab.id);
  const inactiveTime = Date.now() - lastActivity;

  if (inactiveTime >= thresholds.SUSPEND) {
    await discardTab(tab.id, { autoRestore: true });
  } else if (inactiveTime >= thresholds.PROMPT) {
    await promptForTag(tab.id);
  }
  
  return inactiveTime;
};

// Add batch processing for tabs
export async function* processTabs(tabs, batchSize = 10) {
  for (let i = 0; i < tabs.length; i += batchSize) {
    yield tabs.slice(i, i + batchSize);
  }
}

// Add tab lifecycle management
export const TabLifecycle = Object.freeze({
  async suspend(tabId) {
    await validatePermissions();
    await browser.tabs.discard(tabId);
  },
  async resume(tabId) {
    await validatePermissions();
    await browser.tabs.update(tabId, { autoDiscardable: false });
  }
});

// Add explicit validation
export const validateTab = (tab) => {
  if (!tab?.id || typeof tab.id !== 'number') {
    throw new TypeError('Invalid tab ID');
  }

  VALIDATION_TYPES.TAB.required.forEach(field => {
    if (!(field in tab)) {
      throw new TypeError(`Missing required field: ${field}`);
    }
  });

  return true;
};

// Add batch processing capability
export async function* processTabBatch(tabs, size = 10) {
  if (!Array.isArray(tabs)) {
    throw new TypeError('tabs must be an array');
  }
  for (let i = 0; i < tabs.length; i += size) {
    yield tabs.slice(i, i + size);
  }
}

export {
  // ...existing exports...
  archiveTab,
  suspendInactiveTabs,
  suspendTab,
  // ...existing exports...
};
