/**
 * @fileoverview Tab Manager Module - Handles tab operations with background.js coordination
 */

import browser from 'webextension-polyfill';
import stateManager from './stateManager.js';
import { logger } from './logger.js';
import {
  TAB_STATES,
  CONFIG,
  VALIDATION_TYPES,
  BOOKMARK_CONFIG,
  MESSAGE_TYPES 
} from './constants.js';


// Operations defined for tabs
export const TAB_OPERATIONS = Object.freeze({
  DISCARD: 'discard',
  BOOKMARK: 'bookmark',
  ARCHIVE: 'archive',
  UPDATE: 'update'
});

export const INACTIVITY_THRESHOLDS = {
  PROMPT: 600000, // 10 minutes
  SUSPEND: 1800000 // 30 minutes
};

const validateTabId = (tabId) => {
  if (!tabId || typeof tabId !== 'number') {
    const error = new Error('Invalid tab ID');
    logger.error('Validation failed', {
      type: 'TAB_VALIDATION',
      value: tabId,
      error: error.message
    });
    throw error;
  }
  return true;
};

// Retry mechanism for operations
const withRetry = async (operation, options = {}) => {
  const {
    maxAttempts = CONFIG.RETRY.MAX_ATTEMPTS,
    backoff = CONFIG.RETRY.BACKOFF_BASE,
    operation: opType
  } = options;

  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const result = await operation();
      if (attempt > 1) {
        logger.info('Operation succeeded after retry', {
          type: opType,
          attempts: attempt
        });
      }
      return result;
    } catch (error) {
      lastError = error;
      if (attempt < maxAttempts) {
        const delay = backoff * Math.pow(2, attempt - 1) * (0.75 + Math.random() * 0.5);
        logger.warn('Operation failed, retrying', {
          type: opType,
          attempt,
          delay,
          error: error.message
        });
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  throw lastError;
};

/**
 * Queries tabs based on the provided query info.
 * @param {object} queryInfo - The query information.
 * @returns {Promise<Array>} - A promise that resolves to an array of tabs.
 */
export async function queryTabs(queryInfo) {
  const startTime = performance.now();
  try {
    const tabs = await browser.tabs.query(queryInfo);
    logger.logPerformance('tabQuery', performance.now() - startTime, {
      count: tabs.length,
      filters: Object.keys(queryInfo)
    });
    return tabs;
  } catch (error) {
    logger.error('Tab query failed', {
      error: error.message,
      queryInfo,
      type: 'TAB_QUERY_ERROR'
    });
    throw error;
  }
}

/**
 * Wrapper for getting a specific tab.
 * @param {number} tabId - ID of the tab to retrieve.
 * @returns {Promise<Object>} Resolves with the retrieved tab.
 */
export async function getTab(tabId) {
  validateTabId(tabId);
  return withRetry(async () => {
    const startTime = performance.now();
    try {
      const tab = await browser.tabs.get(tabId);
      logger.logPerformance('tabGet', performance.now() - startTime, { tabId });
      // Update tab activity using updateTab to reflect last accessed
      stateManager.dispatch(stateManager.actions.tabManagement.updateTab({ id: tabId, lastAccessed: Date.now() }));
      return tab;
    } catch (error) {
      logger.error('Tab get failed', {
        error: error.message,
        tabId,
        type: 'TAB_GET_ERROR'
      });
      throw error;
    }
  }, { operation: 'GET_TAB' });
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
    // Update last accessed time when tab is updated
    stateManager.dispatch(stateManager.actions.tabManagement.updateTab({ id: tabId, lastAccessed: Date.now() }));
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
    // Archive the tab using the archivedTabs slice
    stateManager.dispatch(stateManager.actions.archivedTabs.archiveTab({ id: tabId, reason: 'Removed' }));
  } catch (err) {
    console.error(`Error removing tab ${tabId}:`, err);
    throw err;
  }
}

/**
 * Wrapper for discarding a tab with background.js validation
 * @param {number} tabId - The ID of the tab to discard
 * @param {Object} [criteria] - Optional criteria
 * @returns {Promise<void>}
 */
export async function discardTab(tabId, criteria) {
  const startTime = performance.now();
  try {
    await browser.runtime.sendMessage({
      type: MESSAGE_TYPES.TAB_ACTION,
      action: 'discard',
      payload: { tabId, criteria }
    });
    
    const duration = performance.now() - startTime;
    logger.logPerformance('tabDiscard', duration, { tabId });
    
    // Telemetry feedback loop - if rule priority adjustments needed
    if (duration > CONFIG.THRESHOLDS.TAB_DISCARD) {
      stateManager.dispatch(stateManager.actions.rules.updateRulesPriority && stateManager.actions.rules.updateRulesPriority({
        type: 'discard',
        adjustment: 'decrease'
      }));
    }
  } catch (error) {
    logger.error('Failed to discard tab', {
      tabId,
      error: error.message,
      type: 'TAB_DISCARD'
    });
    throw error;
  }
}

/**
 * Discards all inactive tabs.
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
  
  const state = stateManager.getState();
  for (const tab of tabs) {
    const lastActivity = state.tabManagement.activity[tab.id]?.lastAccessed || now;
    const inactiveTime = now - lastActivity;

    if (inactiveTime >= CONFIG.INACTIVITY_THRESHOLDS.SUSPEND) {
      await discardTab(tab.id);
    } else if (inactiveTime >= CONFIG.INACTIVITY_THRESHOLDS.PROMPT) {
      stateManager.dispatch({ 
        type: 'SET_TAGGING_PROMPT_ACTIVE', 
        payload: { tabId: tab.id, value: true } 
      });
    }
  }
}

export async function* processTabBatches(tabs, batchSize = 10) {
  for (let i = 0; i < tabs.length; i += batchSize) {
    yield tabs.slice(i, i + batchSize);
  }
}

/**
 * Handles tab creation with tab limit enforcement.
 * For simplicity, we just return false if limit exceeded and set oldest tab.
 * @param {Object} tab - The tab object.
 * @returns {Promise<boolean>}
 */
export async function handleTabCreation(tab) {
  const state = stateManager.getState();
  const allTabs = await browser.tabs.query({});
  if (allTabs.length > state.settings.maxTabs) {
    stateManager.dispatch(stateManager.actions.tabManagement.updateOldestTab(
      allTabs.reduce((oldest, t) => {
        const activity = state.tabManagement.activity;
        const lastAccessed = activity[t.id]?.lastAccessed || 0;
        if (!oldest || lastAccessed < (activity[oldest.id]?.lastAccessed || 0)) {
          return t;
        }
        return oldest;
      }, null)
    ));
    return false;
  }
  return true;
}

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

export async function* processTabBatch(tabs, size = 10) {
  if (!Array.isArray(tabs)) {
    throw new TypeError('tabs must be an array');
  }
  for (let i = 0; i < tabs.length; i += size) {
    yield tabs.slice(i, i + size);
  }
}

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

export function validateTag(tag) {
  if (!tag || typeof tag !== 'string') {
    throw new TypeError('Tag must be a non-empty string');
  }
  if (!VALIDATION.TAG.PATTERN.test(tag)) {
    throw new Error('Tag contains invalid characters');
  }
  if (tag.length > VALIDATION.TAG.MAX_LENGTH) {
    throw new Error(`Tag exceeds maximum length of ${VALIDATION.TAG.MAX_LENGTH}`);
  }
  return true;
}

export function validateRule(rule) {
  const requiredFields = ['id', 'condition', 'action'];
  if (!requiredFields.every(field => field in rule)) {
    throw new Error('Invalid rule format');
  }
  return true;
}

export async function tagTab(tabId, tag) {
  validateTabId(tabId);
  validateTag(tag);
  
  const startTime = performance.now();
  const originalTab = await getTab(tabId);
  const updates = [];
  
  try {
    const stateUpdate = {
      tags: [...(originalTab.tags || []), tag],
      lastTagged: Date.now()
    };
    
    const updatedTab = await updateTab(tabId, { 
      title: `[${tag}] ${originalTab.title}` 
    });
    updates.push(['title', updatedTab]);

    await stateManager.dispatch(stateManager.actions.tabManagement.updateMetadata({ tabId, metadata: stateUpdate }));
    updates.push(['state', stateUpdate]);
    
    logger.logPerformance('tabTag', performance.now() - startTime, {
      tabId,
      tag,
      success: true
    });
    
    return updatedTab;
  } catch (error) {
    logger.error('Tab tagging failed', {
      error: error.message,
      tabId,
      tag,
      type: 'TAB_TAG_ERROR'
    });
    
    // Rollback logic
    for (const [type, data] of updates.reverse()) {
      try {
        if (type === 'title') {
          await updateTab(tabId, { title: originalTab.title });
        } else if (type === 'state') {
          await stateManager.dispatch(stateManager.actions.tabManagement.updateMetadata({ 
            tabId, 
            metadata: {
              tags: originalTab.tags || [],
              lastTagged: originalTab.lastTagged
            }
          }));
        }
      } catch (rollbackError) {
        logger.error('Rollback failed', {
          error: rollbackError.message,
          type: 'ROLLBACK_ERROR',
          operation: type
        });
      }
    }
    throw error;
  }
}

export async function processTabs(tabs, processor, { 
  batchSize = CONFIG.BATCH.SIZE,
  onProgress,
  isolateErrors = true,
  retryFailures = true
} = {}) {
  const results = [];
  const errors = [];
  const retries = new Map();
  let processed = 0;

  const processWithRetry = async (tab) => {
    const startTime = performance.now();
    const retryCount = retries.get(tab.id) || 0;

    try {
      const result = await processor(tab);
      logger.logPerformance('tabProcessing', performance.now() - startTime, {
        tabId: tab.id,
        operation: 'process',
        retries: retryCount
      });
      return result;
    } catch (error) {
      if (retryFailures && retryCount < CONFIG.RETRY.MAX_ATTEMPTS) {
        retries.set(tab.id, retryCount + 1);
        const delay = CONFIG.RETRY.DELAYS[retryCount];
        await new Promise(resolve => setTimeout(resolve, delay));
        return processWithRetry(tab);
      }
      throw error;
    }
  };

  for (let i = 0; i < tabs.length; i += batchSize) {
    const batch = tabs.slice(i, Math.min(i + batchSize, tabs.length));
    const batchResults = await Promise.allSettled(
      batch.map(async tab => {
        try {
          return await processWithRetry(tab);
        } catch (error) {
          logger.error('Tab processing failed', {
            tabId: tab.id,
            error: error.message,
            retries: retries.get(tab.id) || 0,
            type: 'TAB_PROCESSING_ERROR'
          });
          if (!isolateErrors) throw error;
          errors.push({ tab, error });
          return null;
        }
      })
    );

    results.push(...batchResults
      .filter(r => r.status === 'fulfilled')
      .map(r => r.value)
      .filter(Boolean));

    processed += batch.length;
    if (onProgress) {
      onProgress(processed / tabs.length);
    }

    logger.info('Batch processed', {
      batchSize: batch.length,
      successCount: batchResults.filter(r => r.status === 'fulfilled').length,
      errorCount: batchResults.filter(r => r.status === 'rejected').length,
      totalProcessed: processed,
      totalTabs: tabs.length
    });
  }

  return { results, errors };
}

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
    const declarativeRules = convertToDeclarativeRules(rules);
    await browser.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: rules.map((_, i) => i + 1),
      addRules: declarativeRules
    });
  } catch (error) {
    console.error('Failed to activate rules:', error);
    throw error;
  }
};

export async function applyRulesToTab(tab, browserInstance, stateManager) {
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

            logger.info('Archiving tab due to rule match', { tabId: tab.id, tag });

            await stateManager.dispatch({ 
              type: MESSAGE_TYPES.RULE_UPDATE,
              payload: { 
                tag, 
                tabData,
                ruleId: rule.id
              }
            });
            
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

// Testing utilities
export const __testing__ = {
  validateTabId: (tabId) => {
    try {
      validateTabId(tabId);
      return { valid: true };
    } catch (error) {
      return { valid: false, error: error.message };
    }
  },
  
  processBatch: async (tabs, processor, options) => {
    return processTabs(tabs, processor, options);
  },
  
  validateTag: (tag) => {
    try {
      validateTag(tag);
      return { valid: true };
    } catch (error) {
      return { valid: false, error: error.message };
    }
  },
  
  testTabLifecycle: async (createProps) => {
    const tab = await createTab(createProps);
    await updateTab(tab.id, { title: 'Test Update' });
    await discardTab(tab.id);
    await removeTab(tab.id);
    return true;
  }
};

/**
 * Tag the tab with the provided tag, bookmark it under the TabCurator folder, and then close it.
 * @param {number} tabId - The ID of the tab to tag and bookmark.
 * @param {string} tag - The tag to apply to the tab.
 */
export async function tagTabAndBookmark(tabId, tag) {
  // Get the tab
  const tab = await getTab(tabId);
  
  // Tag the tab by updating its title
  const originalTitle = tab.title;
  const taggedTitle = `[${tag}] ${originalTitle}`;
  await updateTab(tabId, { title: taggedTitle });

  // Find or create the "TabCurator" bookmark folder
  let folderId;
  const folders = await browser.bookmarks.search({ title: BOOKMARK_CONFIG.FOLDER_NAME });
  if (folders.length === 0) {
    const folder = await browser.bookmarks.create({ title: BOOKMARK_CONFIG.FOLDER_NAME });
    folderId = folder.id;
  } else {
    folderId = folders[0].id;
  }

  // Bookmark the tab under the TabCurator folder
  await browser.bookmarks.create({
    parentId: folderId,
    title: taggedTitle,
    url: tab.url
  });

  // Close the tab
  await removeTab(tabId);

  logger.info('Tab tagged, bookmarked, and closed', { tabId, tag });

  stateManager.dispatch(
    stateManager.actions.tabManagement.updateMetadata({
      tabId,
      metadata: {
        tags: [tag],
        lastTagged: Date.now()
      }
    })
  );
}

/**
 * Refactored TabManager as a class
 */
export class TabManager {
  constructor() {
    // Initialize any class fields if needed
  }

  async initialize() {
    logger.info('Tab manager initialized', { time: Date.now() });
    // ...additional initialization code if needed...
  }

  async handleTabUpdate(tabId, changeInfo, tab) {
    try {
      const updatedTab = await browser.tabs.get(tabId);
      // ...handle the updated tab...
    } catch (error) {
      logger.error('handleTabUpdate failed', { error: error.message, tabId });
    }
  }

  async handleTabRemove(tabId) {
    try {
      const removedTab = await browser.tabs.get(tabId);
      // ...handle the removed tab...
    } catch (error) {
      logger.error('Failed to handle tab removal', { error: error.message, tabId });
    }
  }

  async cleanupInactiveTabs() {
    // Utilize checkInactiveTabs to clean up
    await checkInactiveTabs();
  }

  async enforceTabLimits() {
    const state = stateManager.getState();
    const maxTabs = state.settings.maxTabs || 100; // Default if not set

    const allTabs = await browser.tabs.query({});
    if (allTabs.length <= maxTabs) {
      // No action needed if within limit
      return;
    }

    // We exceed the limit, find the oldest tab
    const activity = state.tabManagement.activity || {};

    // Sort tabs by last accessed time (oldest first)
    const sortedTabs = allTabs.sort((a, b) => {
      const aLast = activity[a.id]?.lastAccessed || 0;
      const bLast = activity[b.id]?.lastAccessed || 0;
      return aLast - bLast;
    });

    const oldestTab = sortedTabs[0];
    logger.info('Tab limit exceeded, oldest tab identified', {
      currentCount: allTabs.length,
      maxTabs,
      oldestTab: oldestTab.id
    });

    // Update oldestTab in state so that the popup sees it and shows the prompt
    stateManager.dispatch(stateManager.actions.tabManagement.updateOldestTab(oldestTab));
  }

  async cleanup() {
    // Cleanup resources if any
  }

  async handleConnectionError(error) {
    if (error.message.includes('Extension context invalidated')) {
      logger.warn('Extension context invalidated, attempting recovery');
      
      // Wait brief moment before retry
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      try {
        // Re-initialize connection
        await this.initialize();
        
        // Refresh extension ID
        const newId = browser.runtime.id;
        if (!newId) {
          throw new Error('Failed to initialize: Extension ID not found');
        }
        logger.info('Initializing with extension ID:', { newId });

        // Update any stored references
        await browser.storage.local.set({ extensionId: newId });
        
        logger.info('Connection recovered successfully', { newExtensionId: newId });
        return true;
      } catch (recoveryError) {
        logger.error('Connection recovery failed', { error: recoveryError.message });
        return false;
      }
    }
    return false;
  }

  async withConnectionRetry(operation) {
    const maxAttempts = 3;
    let attempts = 0;

    while (attempts < maxAttempts) {
      try {
        return await operation();
      } catch (error) {
        attempts++;
        const isRecovered = await this.handleConnectionError(error);
        
        if (!isRecovered && attempts === maxAttempts) {
          throw error;
        }
        
        await new Promise(resolve => setTimeout(resolve, 1000 * attempts));
      }
    }
  }
}

// Export a singleton instance of TabManager
export const tabManager = new TabManager();

// Only exporting TAB_STATES to avoid confusion since we rely on store/actions for everything else
export {
  TAB_STATES
};

