// src/utils/tagUtils.js
/**
 * @fileoverview Utility functions for tagging and archiving tabs.
 * Implements tagging logic and state synchronization.
 */
import { state } from './stateManager.js';
import { getTab, updateTab, removeTab } from './tabUtils.js';

/**
 * Tags a tab by prepending the tag to its title.
 * 
 * @param {number} tabId - The ID of the tab to tag.
 * @param {string} tag - The tag to prepend to the tab's title.
 * @returns {Promise<void>} Resolves when the tab is successfully tagged.
 */
export async function tagTab(tabId, tag) {
  try {
    const tab = await getTab(tabId);
    // Store original title in tab data to preserve it for archiving
    tab._originalTitle = tab.title;
    const newTitle = `[${tag}] ${tab.title}`;
    await updateTab(tabId, { title: newTitle });
    return tab; // Return updated tab for chaining
  } catch (error) {
    console.error(`Failed to tag tab ${tabId}:`, error);
    throw error;
  }
}

/**
 * Archives a tab by saving its metadata and removing it from the browser.
 * 
 * @param {number} tabId - The ID of the tab to archive.
 * @param {string} tag - The tag under which to archive the tab.
 * @param {Object} archivedTabs - The archive object to store tab metadata.
 * @returns {Promise<void>} Resolves when the tab is archived and removed.
 */
export async function archiveTab(tabId, tag, archivedTabs) {
  try {
    const tab = await getTab(tabId);
    if (!archivedTabs[tag]) {
      archivedTabs[tag] = [];
    }
    // Use the current title which may include tag
    archivedTabs[tag].push({ 
      title: tab.title,
      url: tab.url 
    });
    await removeTab(tabId); // Removes the tab from the browser
    console.log(`Tab ${tabId} archived under tag "${tag}".`);
  } catch (error) {
    console.error(`Failed to archive tab ${tabId}:`, error);
    throw error;
  }
}