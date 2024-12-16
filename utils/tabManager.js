/**
 * @fileoverview Tab Manager Module - Handles tab operations with background.js coordination
 * 
 * Architecture Notes:
 * - This module acts as a tab operations facade, delegating validation and state management
 * - All validation is handled by background.js (service worker)
 * - State updates are managed by stateManager.js
 * - Bookmark operations are centralized in background.js
 * 
 * Primary Responsibilities:
 * - Tab lifecycle operations (create, update, remove, discard)
 * - Tab metadata handling
 * - Batch processing of tab operations
 * 
 * @module tabManager
 */

import browser from 'webextension-polyfill';
import { store } from './stateManager.ts';
import { updateTabActivity, archiveTab, actions } from './stateManager.js';
import { MESSAGE_TYPES, checkPermissions } from './messagingUtils.js';
import { 
  TAB_STATES,
  CONFIG,
  VALIDATION_TYPES,
  TAB_PERMISSIONS,
} from './constants.js';

// Add permission validation
export async function validatePermissions(type = 'BASE') {
  const permissions = await browser.permissions.getAll();
  return TAB_PERMISSIONS[type].every(
    p => permissions.permissions.includes(p)
  );
}

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

// Add MV3 specific tab handling
export const TAB_OPERATIONS = Object.freeze({
  DISCARD: 'discard',
  BOOKMARK: 'bookmark',
  ARCHIVE: 'archive',
  UPDATE: 'update'
});

// Add inactivity threshold management
export const INACTIVITY_THRESHOLDS = {
  PROMPT: 600000, // 10 minutes
  SUSPEND: 1800000, // 30 minutes
};

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
 * Wrapper for discarding a tab - coordinates with background.js for validation
 * @param {number} tabId - The ID of the tab to discard
 * @param {Object} [criteria] - Optional criteria to check
 * @returns {Promise<void>}
 */
export async function discardTab(tabId, criteria) {
  // Send to background.js for validation and processing
  await browser.runtime.sendMessage({
    type: MESSAGE_TYPES.TAB_ACTION,
    action: 'discard',
    payload: { tabId, criteria }
  });
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
 * Updates tab metadata through background.js validation
 * @param {number} tabId - Tab ID to update
 * @param {Object} metadata - Metadata to update
 */
export async function updateTabMetadata(tabId, metadata) {
  await browser.runtime.sendMessage({
    type: MESSAGE_TYPES.TAB_ACTION,
    action: 'updateMetadata',
    payload: { tabId, metadata }
  });
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

    if (inactiveTime >= CONFIG.INACTIVITY_THRESHOLDS.SUSPEND) {
      await discardTab(tab.id);
    } else if (inactiveTime >= CONFIG.INACTIVITY_THRESHOLDS.PROMPT) {
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

// Add tag-related constants
export const TAG_TYPES = Object.freeze({
  AUTOMATED: 'automated',
  MANUAL: 'manual'
});

export const RULE_TYPES = Object.freeze({
  URL_PATTERN: 'urlPattern',
  TITLE_PATTERN: 'titlePattern'
});

export const TAG_OPERATIONS = Object.freeze({
  ADD: 'add',
  REMOVE: 'remove',
  UPDATE: 'update'
});

export const VALIDATION = Object.freeze({
  TAG: {
    MAX_LENGTH: 50,
    PATTERN: /^[a-zA-Z0-9-_]+$/
  },
  RULE: {
    MAX_CONDITIONS: 10
  }
});

// Add validation functions from tagUtils.js
export function validateTag(tag) {
  if (!tag || typeof tag !== 'string') {
    throw new TypeError('Tag must be a non-empty string');
  }
  if (!TAG_VALIDATION.TAG.PATTERN.test(tag)) {
    throw new Error('Tag contains invalid characters');
  }
  if (tag.length > TAG_VALIDATION.TAG.MAX_LENGTH) {
    throw new Error(`Tag exceeds maximum length of ${TAG_VALIDATION.TAG.MAX_LENGTH}`);
  }
  return true;
}

export const validateRule = (rule) => {
  const requiredFields = ['id', 'condition', 'action'];
  if (!requiredFields.every(field => field in rule)) {
    throw new Error('Invalid rule format');
  }
  return true;
};

// Add tag-related operations
export async function tagTab(tabId, tag) {
  try {
    validateTag(tag);
    const tab = await getTab(tabId);
    
    // Add the tag to the tab's title
    const updatedTab = await updateTab(tabId, { 
      title: `[${tag}] ${tab.title}` 
    });
    
    // Update state to track the tag
    store.dispatch(actions.tab.updateMetadata(tabId, {
      tags: [...(tab.tags || []), tag],
      lastTagged: Date.now()
    }));
    
    return updatedTab;
  } catch (error) {
    console.error(`Failed to tag tab ${tabId}:`, error);
    throw error;
  }
}

/**
 * Processes tabs in batches with progress tracking
 * @param {Array<browser.tabs.Tab>} tabs - Array of tabs to process
 * @param {Function} processor - Processing function for each tab
 * @param {Object} options - Processing options
 * @param {number} [options.batchSize=10] - Size of each batch
 * @param {Function} [options.onProgress] - Progress callback
 * @returns {Promise<Array>} Results of processing
 */
export async function processTabs(tabs, processor, { 
  batchSize = CONFIG.BATCH.SIZE,
  onProgress
} = {}) {
  const results = [];
  let processed = 0;
  
  for (let i = 0; i < tabs.length; i += batchSize) {
    const batch = tabs.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map(tab => processor(tab))
    );
    
    results.push(...batchResults);
    processed += batch.length;
    
    if (onProgress) {
      onProgress(processed / tabs.length);
    }
  }
  
  return results;
}

// Add rule management functionality
export const convertToDeclarativeRules = (rules) => {
  if (!Array.isArray(rules)) {
    throw new TypeError('Rules must be an array');
  }
  
  return rules.map((rule, id) => ({
    id: id + 1,
    priority: 1,
    condition: {
      urlFilter: rule.condition,
      resourceTypes: ['main_frame'],
      domains: rule.domains || []
    },
    action: {
      type: 'modifyHeaders',
      responseHeaders: [{ 
        header: 'X-TabCurator-Tag', 
        operation: 'set', 
        value: rule.tag 
      }]
    }
  }));
};

export const activateRules = async (rules) => {
  try {
    const declarativeRules = await convertToDeclarativeRules(rules);
    await browser.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: rules.map((_, i) => i + 1),
      addRules: declarativeRules
    });
  } catch (error) {
    console.error('Failed to activate rules:', error);
    throw error;
  }
};

// Add rule application functionality
export async function applyRulesToTab(tab, browserInstance, store) {
  if (!browserInstance?.declarativeNetRequest) {
    throw new Error("Declarative Net Request API not available");
  }

  try {
    const { rules = [] } = await browserInstance.storage.sync.get("rules");
    
    for (const rule of rules) {
      try {
        if (!rule.condition || !rule.action) continue;

        const matches = tab.url.includes(rule.condition) || 
                       tab.title.includes(rule.condition);
        
        if (matches) {
          const [actionType, tag] = rule.action.split(": ");
          
          if (actionType === 'Tag') {
            const tabData = {
              title: tab.title,
              url: tab.url,
              timestamp: Date.now()
            };

            await Promise.all([
              archiveTabAction(tab.id, tag, tabData),
              store.dispatch({ 
                type: MESSAGE_TYPES.RULE_UPDATE,
                payload: { 
                  tag, 
                  tabData,
                  ruleId: rule.id
                }
              })
            ]);
            
            break;
          }
        }
      } catch (ruleError) {
        console.error(`Error processing rule for tab ${tab.id}:`, ruleError);
      }
    }
  } catch (error) {
    console.error(`Error applying rules to tab (ID: ${tab.id}):`, error);
    throw error;
  }
}

// Add batch processing for rules
export async function* processRulesBatch(rules, size = 10) {
  for (let i = 0; i < rules.length; i += size) {
    yield rules.slice(i, i + size);
  }
}

/**
 * Processes a batch of tab operations with background.js coordination
 * @param {Array<Object>} operations - Array of tab operations
 * @returns {Promise<Array>} Results of operations
 */
export async function processBatchOperations(operations) {
  return browser.runtime.sendMessage({
    type: MESSAGE_TYPES.TAB_ACTION,
    action: 'batchProcess',
    payload: { operations }
  });
}

// Public interface - explicit exports with documentation
export {
  // Core Tab Operations
  getTab,         // Fetches tab data
  createTab,      // Creates new tab
  updateTab,      // Updates existing tab
  removeTab,      // Removes/closes tab
  
  // Tab State Management
  updateTabMetadata,  // Updates tab metadata through background.js
  discardTab,        // Discards tab with background.js validation
  
  // Batch Operations
  processBatchOperations, // Processes multiple tab operations
  
  // Types & Constants
  TAB_OPERATIONS,    // Valid tab operations
  TAB_STATES        // Tab state constants
};
