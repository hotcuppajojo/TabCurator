/**
 * @fileoverview Tab Manager Module - Handles tab operations with background.js coordination
 * 
 * Architecture & Data Flow:
 * 1. Tab operations trigger validation through background.js
 * 2. State updates are managed by stateManager.js
 * 3. Operations are batched when possible
 * 4. Telemetry is logged via logger module
 * 
 * Error Handling:
 * - All errors flow through logger.error with operation context
 * - Transient failures trigger automatic retries
 * - Operation failures are tracked for telemetry
 * 
 * @module tabManager
 */

import browser from 'webextension-polyfill';
import { store, actions } from './stateManager.js'; // Removed updateTabActivity, archiveTab imports
import { MESSAGE_TYPES } from './constants.js'; 
import {
  TAB_STATES,
  CONFIG,
  VALIDATION_TYPES
} from './constants.js';
import { logger } from './logger.js';

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
      store.dispatch(actions.tabManagement.updateTab({ id: tabId, lastAccessed: Date.now() }));
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
    store.dispatch(actions.tabManagement.updateTab({ id: tabId, lastAccessed: Date.now() }));
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
    store.dispatch(actions.archivedTabs.archiveTab({ id: tabId, reason: 'Removed' }));
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
      store.dispatch(actions.rules.updateRulesPriority && actions.rules.updateRulesPriority({
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
  
  const state = store.getState();
  for (const tab of tabs) {
    const lastActivity = state.tabManagement.activity[tab.id]?.lastAccessed || now;
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
  const state = store.getState();
  const allTabs = await browser.tabs.query({});
  if (allTabs.length > state.settings.maxTabs) {
    store.dispatch(actions.tabManagement.updateOldestTab(
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

    await store.dispatch(actions.tabManagement.updateMetadata({ tabId, metadata: stateUpdate }));
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
          await store.dispatch(actions.tabManagement.updateMetadata({ 
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

            logger.info('Archiving tab due to rule match', { tabId: tab.id, tag });

            await store.dispatch({ 
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

// Only exporting TAB_STATES to avoid confusion since we rely on store/actions for everything else
export {
  TAB_STATES
};
