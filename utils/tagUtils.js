// utils/tagUtils.js
/**
 * @fileoverview Utility functions for tagging and archiving tabs.
 * Implements tagging logic and state synchronization for Manifest V3.
 */
import { store } from './stateManager.js';
import { getTab, updateTab, removeTab } from './tabManager.js';
import browser from 'webextension-polyfill';
import { MESSAGE_TYPES } from './messagingUtils.js';

export const TAG_TYPES = Object.freeze({
  AUTOMATED: 'automated',
  MANUAL: 'manual'
});

export const RULE_TYPES = Object.freeze({
  URL_PATTERN: 'urlPattern',
  TITLE_PATTERN: 'titlePattern'
});

// Move bookmark-related functionality to tabManager.js
export const TAG_OPERATIONS = Object.freeze({
  ADD: 'add',
  REMOVE: 'remove',
  UPDATE: 'update'
});

// Add validation constants
export const VALIDATION = Object.freeze({
  TAG: {
    MAX_LENGTH: 50,
    PATTERN: /^[a-zA-Z0-9-_]+$/
  },
  RULE: {
    MAX_CONDITIONS: 10
  }
});

// Add input validation
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

// Add rule validation
export const validateRule = (rule) => {
  const requiredFields = ['id', 'condition', 'action'];
  if (!requiredFields.every(field => field in rule)) {
    throw new Error('Invalid rule format');
  }
  return true;
};

// Move bookmark folder management to a separate module
export const BookmarkManager = Object.freeze({
  FOLDER_NAME: 'TabCurator',
  
  async getFolder() {
    const folders = await browser.bookmarks.search({ title: this.FOLDER_NAME });
    return folders.find(b => b.title === this.FOLDER_NAME && b.type === 'folder');
  },
  
  async create() {
    const bar = await browser.bookmarks.getSubTree('1');
    return browser.bookmarks.create({
      parentId: bar[0].id,
      title: this.FOLDER_NAME
    });
  },
  
  async getOrCreate() {
    try {
      return await this.getFolder() || await this.create();
    } catch (error) {
      throw new MessagingError(ERROR_TYPES.API_UNAVAILABLE, 'Bookmark API error', error);
    }
  }
});

/**
 * Tags a tab by prepending the tag to its title.
 * Uses async/await and includes comprehensive error handling.
 * 
 * @param {number} tabId - The ID of the tab to tag.
 * @param {string} tag - The tag to prepend to the tab's title.
 * @returns {Promise<Object>} The updated tab.
 * @throws {Error} If the tab cannot be tagged.
 */
export async function tagTab(tabId, tag) {
  try {
    validateTag(tag);
    const tab = await getTab(tabId);
    const updatedTab = await updateTab(tabId, { 
      title: `[${tag}] ${tab.title}` 
    });
    
    store.dispatch(actions.tab.archive(tabId, tag, updatedTab));
    return updatedTab;
  } catch (error) {
    console.error(`Failed to tag tab ${tabId}:`, error);
    throw error;
  }
};

/**
 * Archives a tab under a specified tag and bookmarks it in the 'TabCurator' folder.
 * Uses atomic operations to maintain state consistency.
 * 
 * @param {number} tabId - The ID of the tab to manage.
 * @param {string} tag - The tag under which to archive the tab.
 * @param {object} browserInstance - The browser API instance.
 * @param {object} store - The Redux store instance.
 * @returns {Promise<void>}
 */
export async function manageTab(tabId, tag, browserInstance, store) {
  if (!browserInstance?.tabs || !browserInstance?.bookmarks) {
    throw new Error('Required browser APIs not available');
  }

  try {
    // Get tab details first to ensure it exists
    const tab = await browserInstance.tabs.get(tabId);
    if (!tab) {
      throw new Error(`Tab with ID ${tabId} does not exist.`);
    }

    // Check critical conditions
    if (tab.active || tab.pinned || isCriticalTab(tab)) {
      throw new Error(`Cannot archive active, pinned, or critical tab with ID: ${tabId}.`);
    }

    // Create atomic operation group
    const operations = [
      // Archive operation
      (async () => {
        await store.dispatch(archiveTabAction(tabId, tag, tab));
        console.log(`Tab ${tabId} archived under tag "${tag}".`);
      })(),

      // Bookmark operation
      (async () => {
        const folderId = await BookmarkManager.getOrCreate();
        await browserInstance.bookmarks.create({
          parentId: folderId,
          title: tab.title,
          url: tab.url
        });
        console.log(`Tab ${tabId} bookmarked in 'TabCurator' folder.`);
      })(),

      // Rules application
      applyRulesToTab(tab, browserInstance, store)
    ];

    // Execute all operations
    await Promise.all(operations);

  } catch (error) {
    console.error(`Error managing tab ${tabId}:`, error);
    // Attempt to rollback any completed operations if needed
    throw error;
  }
}

/**
 * Determines if a tab is critical and should not be discarded or suspended.
 * @param {object} tab - The tab object.
 * @returns {boolean} True if the tab is critical, false otherwise.
 */
function isCriticalTab(tab) {
  const criticalPatterns = ['https://mail.google.com', 'https://calendar.google.com'];
  return criticalPatterns.some(pattern => tab.url.startsWith(pattern));
}

/**
 * Applies rules to a tab for automated organization.
 * Implements declarative patterns for Manifest V3 compatibility.
 * 
 * @param {browser.tabs.Tab} tab - Tab object to evaluate.
 * @param {object} browserInstance - Browser API instance.
 * @param {object} store - Redux store instance.
 * @returns {Promise<void>}
 */
export async function applyRulesToTab(tab, browserInstance, store) {
  if (!browserInstance?.declarativeNetRequest) {
    throw new Error("Declarative Net Request API not available");
  }

  try {
    const { rules = [] } = await browserInstance.storage.sync.get("rules");
    
    // Process rules sequentially to maintain order and avoid race conditions
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

            // Use a transaction-like pattern for state updates
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
            
            // Break after first matching rule to prevent multiple tags
            break;
          }
        }
      } catch (ruleError) {
        console.error(`Error processing rule for tab ${tab.id}:`, ruleError);
        // Continue processing other rules
      }
    }
  } catch (error) {
    console.error(`Error applying rules to tab (ID: ${tab.id}):`, error);
    throw error; // Propagate error to caller
  }
}

// Add stronger MV3 rule conversion
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
      responseHeaders: [
        { 
          header: 'X-TabCurator-Tag', 
          operation: 'set', 
          value: rule.tag 
        }
      ]
    }
  }));
};

// Add rule activation helper
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

// Add batch processing for rules
export async function* processRulesBatch(rules, size = 10) {
  for (let i = 0; i < rules.length; i += size) {
    yield rules.slice(i, i + size);
  }
}

// Ensure `applyRulesToTab` is exported only once
export {
  // Remove duplicate 'TAG_TYPES' export
  // TAG_TYPES,
  // ...other exports...
};

export async function getOrCreateTabCuratorFolder() {
  // ...function implementation...
}