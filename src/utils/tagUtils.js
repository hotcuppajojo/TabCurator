// src/utils/tagUtils.js
/**
 * @fileoverview Utility functions for tagging and archiving tabs.
 * Implements tagging logic and state synchronization for Manifest V3.
 */
import { state } from './stateManager.js';
import { getTab, updateTab, removeTab } from './tabManager.js';

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
    // Input validation
    if (!tabId || typeof tabId !== 'number') {
      throw new Error('Tab ID must be a valid number');
    }
    if (!tag || typeof tag !== 'string') {
      throw new Error('Tag must be a non-empty string');
    }

    const tab = await getTab(tabId);
    // Store original title in tab data for archiving
    tab._originalTitle = tab.title;
    const newTitle = `[${tag}] ${tab.title}`;
    const updatedTab = await updateTab(tabId, { title: newTitle });
    
    return updatedTab;
  } catch (error) {
    console.error(`Failed to tag tab ${tabId}:`, error);
    throw error;
  }
}

/**
 * Archives a tab by saving its metadata and removing it from the browser.
 * Implements Manifest V3 best practices for state management.
 * 
 * @param {number} tabId - The ID of the tab to archive.
 * @param {string} tag - The tag under which to archive the tab.
 * @param {Object} archivedTabs - The archive object to store tab metadata.
 * @returns {Promise<void>}
 * @throws {Error} If the tab cannot be archived.
 */
export async function archiveTab(tabId, tag, archivedTabs) {
  try {
    // Input validation
    if (!tabId || typeof tabId !== 'number') {
      throw new Error('Tab ID must be a valid number');
    }
    if (!tag || typeof tag !== 'string') {
      throw new Error('Tag must be a non-empty string');
    }
    if (!archivedTabs || typeof archivedTabs !== 'object') {
      throw new Error('Archive storage must be a valid object');
    }

    const tab = await getTab(tabId);
    
    // Initialize tag array if it doesn't exist
    if (!archivedTabs[tag]) {
      archivedTabs[tag] = [];
    }
    
    // Store tab metadata
    archivedTabs[tag].push({
      title: tab.title,
      url: tab.url,
      timestamp: Date.now()
    });

    // Remove the tab from the browser
    await removeTab(tabId);
    console.log(`Tab ${tabId} archived under tag "${tag}".`);
  } catch (error) {
    console.error(`Failed to archive tab ${tabId}:`, error);
    throw error;
  }
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
  if (!browserInstance?.storage) {
    console.error("Invalid browser instance provided to applyRulesToTab.");
    return;
  }

  try {
    const { rules = [] } = await browserInstance.storage.sync.get("rules");
    
    for (const rule of rules) {
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

          await archiveTab(tab.id, tag, store.getState().archivedTabs);
          store.dispatch({ 
            type: 'ARCHIVE_TAB', 
            payload: { tag, tabData }
          });
          
          break;
        }
      }
    }
  } catch (error) {
    console.error(`Error applying rules to tab (ID: ${tab.id}):`, error);
    // Don't throw here to prevent breaking tab processing chain
  }
}