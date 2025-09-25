/**
 * @fileoverview Tab Manager Module - Handles tab operations with background.js coordination.
 * Uses the core module for all constants, actions, and state.
 */

import browser from 'webextension-polyfill';
import { logger } from './logger.js';
import {
  ACTION,
  addBookmark,
  getOrCreateBookmarkFolder,
  removeBookmark,
  searchBookmarks,
  initializeBookmarkFolder,
  TAB_OPERATIONS,
  STATE,
  CONFIG,
  BOOKMARK_CONFIG,
  MESSAGE_TYPES,
  MESSAGES,
  MESSAGE_TEMPLATES,
  formatMessage,
  connectToBackground,
  sendMessageToBackground,
  listenForMessages,
  broadcastMessage,
  validateMessage,
  CONNECTION_STATES,
  ERROR_CATEGORIES,
  ERROR_TYPES,
  LOG_CATEGORIES,
  LOG_LEVELS,
  ValidationError,
  APIError,
  TabLimitExceededError,
  VALIDATION_SCHEMAS,
  TAG_VALIDATION,
  coreSelectors,
  selectors,
  validateArgs, 
  validateTag, 
  validateTab, 
  validateTabLimit,
  PERMISSIONS,
  recordTelemetry,
  recordPerformance,
  setTelemetryEnabled,
  isTelemetryEnabled,
  TELEMETRY_EVENTS
} from './core/index.js';

const TAB_STATES = STATE.TAB;

let stateManager; // Will be initialized by TabManager

/**
 * TabManager class encapsulates all tab operations and state logic.
 */
export class TabManager {
  constructor() {
    this.initialized = false;
    this.stateManager = null;
  }

  async initialize(stateManagerInstance) {
    if (this.initialized) return;
    if (!stateManagerInstance || !stateManagerInstance.store) {
      throw new Error('Valid StateManager instance required');
    }
    this.stateManager = stateManagerInstance;
    stateManager = stateManagerInstance; // For legacy compatibility
    this.initialized = true;
    logger.info('Tab manager initialized', { time: Date.now() });
    await initializeBookmarkFolder(); // Ensure bookmark folder is ready at startup
  }

  async queryTabs(queryInfo) {
    const tabs = await browser.tabs.query(queryInfo);
    logger.info('Queried tabs', { count: tabs.length, queryInfo });
    return tabs;
  }

  async getTab(tabId) {
    if (typeof tabId !== 'number') {
      logger.error('Invalid tab ID', {
        tabId,
        category: LOG_CATEGORIES.TABS,
        severity: ERROR_CATEGORIES.SEVERITY.HIGH,
        type: ERROR_TYPES.INVALID_MESSAGE
      });
      throw new ValidationError('Invalid tab ID');
    }
    try {
      return await browser.tabs.get(tabId);
    } catch (err) {
      logger.error('Failed to get tab', {
        tabId,
        error: err.message,
        category: LOG_CATEGORIES.TABS,
        severity: ERROR_CATEGORIES.SEVERITY.HIGH,
        type: ERROR_TYPES.API_UNAVAILABLE
      });
      throw new APIError(`Failed to get tab: ${err.message}`);
    }
  }

  async createTab(createProperties) {
    // Validate arguments using VALIDATION_SCHEMAS
    validateArgs('create', [createProperties], VALIDATION_SCHEMAS.create);
    const start = performance.now();
    try {
      const tab = await browser.tabs.create(createProperties);
      logger.info(MESSAGES.TAB.CREATED, { tabId: tab.id, createProperties });
      recordTelemetry(TELEMETRY_EVENTS.TAB_CREATED, { tabId: tab.id, ...createProperties });
      recordPerformance('createTab', performance.now() - start, { tabId: tab.id });
      return tab;
    } catch (err) {
      logger.error(MESSAGES.TAB.CREATION_FAILED, { error: err.message, ...createProperties });
      recordTelemetry(TELEMETRY_EVENTS.ERROR, { error: err.message, action: 'createTab' });
      throw new APIError(`${MESSAGES.TAB.CREATION_FAILED}: ${err.message}`);
    }
  }

  // Make state updates more explicit - tabManager should update state via stateManager
  async updateTab(tabId, updateProperties) {
    // Validate arguments using VALIDATION_SCHEMAS
    validateArgs('update', [tabId, updateProperties], VALIDATION_SCHEMAS.update);
    const start = performance.now();
    
    try {
      // Call browser API first
      const updatedTab = await browser.tabs.update(tabId, updateProperties);
      
      // Then update state if successful
      if (this.stateManager) {
        this.stateManager.dispatch(
          this.stateManager.actions.tabManagement.updateTab({
            id: tabId,
            ...updateProperties,
            lastAccessed: Date.now()
          })
        );
      }
      
      recordPerformance('updateTab', performance.now() - start, { tabId });
      return updatedTab;
    } catch (error) {
      logger.error(ACTION.TAB.UPDATE_FAILED, { tabId, error: error.message });
      throw error;
    }
  }

  // Add a helper to ensure consistent state updates
  _updateTabState(tabId, stateChanges) {
    if (this.stateManager) {
      this.stateManager.dispatch(
        this.stateManager.actions.tabManagement.updateTab({
          id: tabId,
          ...stateChanges
        })
      );
    }
  }

  async removeTab(tabId) {
    // Validate arguments using VALIDATION_SCHEMAS
    validateArgs('remove', [tabId], VALIDATION_SCHEMAS.remove);
    const start = performance.now();
    await browser.tabs.remove(tabId);
    logger.info(formatMessage(MESSAGE_TEMPLATES.TAB_COUNT, { count: tabId }), { tabId });
    recordTelemetry(TELEMETRY_EVENTS.TAB_REMOVED, { tabId });
    recordPerformance('removeTab', performance.now() - start, { tabId });
    if (this.stateManager) {
      this.stateManager.dispatch(
        this.stateManager.actions.archivedTabs.archiveTab({ id: tabId, reason: 'Removed' })
      );
    }
  }

  async discardTab(tabId) {
    // Validate argument
    validateArgs('discard', [tabId]);
    const tab = await this.getTab(tabId);
    validateTab(tab);
    if (!tab || tab.active || tab.pinned || tab.audible || tab.discarded) {
      logger.info('Tab cannot be discarded', { tabId });
      return { success: false, reason: 'Tab cannot be discarded' };
    }
    await browser.tabs.discard(tabId);
    // Use STATE.TAB.DISCARDED for status update
    if (this.stateManager) {
      this.stateManager.dispatch(
        this.stateManager.actions.tabManagement.updateTab({
          id: tabId,
          status: STATE.TAB.DISCARDED,
          lastAccessed: Date.now()
        })
      );
    }
    logger.info(ACTION.TAB.DISCARD, { tabId });
    return { success: true, tabId };
  }

  async discardInactiveTabs() {
    const inactiveTabs = await browser.tabs.query({ active: false });
    for (const tab of inactiveTabs) {
      await this.discardTab(tab.id);
    }
    logger.info(ACTION.TAB.SUSPEND_INACTIVE, { count: inactiveTabs.length });
  }

  async tagTab(tabId, tag) {
    try {
      validateTag(tag);
      const tab = await this.getTab(tabId);
      validateTab(tab);
      const taggedTitle = `[${tag}] ${tab.title}`;
      await this.updateTab(tabId, { title: taggedTitle });
      if (this.stateManager) {
        this.stateManager.dispatch(
          this.stateManager.actions.tabManagement.updateMetadata({
            tabId,
            metadata: { tags: [tag], lastTagged: Date.now() }
          })
        );
      }
      logger.info(ACTION.TAB.TAG_AND_CLOSE, { tabId, tag });
      recordTelemetry(TELEMETRY_EVENTS.TAB_TAGGED, { tabId, tag });
      return taggedTitle;
    } catch (err) {
      logger.error(VALIDATION_ERRORS.INVALID_MESSAGE, {
        tabId,
        tag,
        error: err.message,
        category: LOG_CATEGORIES.TABS,
        severity: ERROR_CATEGORIES.SEVERITY.HIGH,
        type: ERROR_TYPES.INVALID_MESSAGE
      });
      throw new ValidationError(`${VALIDATION_ERRORS.INVALID_MESSAGE}: ${err.message}`);
    }
  }

  async tagTabAndBookmark(tabId, tag) {
    // Permission check before bookmark operation
    if (browser.permissions && PERMISSIONS.BOOKMARKS) {
      const has = await browser.permissions.contains({ permissions: [PERMISSIONS.BOOKMARKS] });
      if (!has) {
        await browser.permissions.request({ permissions: [PERMISSIONS.BOOKMARKS] });
      }
    }
    validateTag(tag);
    const tab = await this.getTab(tabId);
    validateTab(tab);
    const taggedTitle = `[${tag}] ${tab.title}`;
    await this.updateTab(tabId, { title: taggedTitle });

    const folderId = await getOrCreateBookmarkFolder();
    if (folderId) {
      const existing = await searchBookmarks({ url: tab.url });
      if (!existing.some(bm => bm.parentId === folderId)) {
        await addBookmark({
          parentId: folderId,
          title: taggedTitle,
          url: tab.url
        });
      }
    }

    await this.removeTab(tabId);

    logger.info(ACTION.TAB.TAG_AND_CLOSE, { tabId, tag });
    recordTelemetry(TELEMETRY_EVENTS.TAB_TAGGED, { tabId, tag, bookmarked: true });
    if (this.stateManager) {
      this.stateManager.dispatch(
        this.stateManager.actions.tabManagement.updateMetadata({
          tabId,
          metadata: { tags: [tag], lastTagged: Date.now() }
        })
      );
    }
  }

  async getOldestTab() {
    const tabs = await browser.tabs.query({});
    if (!tabs.length) return null;
    // Use lastAccessed if available, else fallback to index
    const activity = this.stateManager?.selectors?.selectTabActivity(this.stateManager.getState()) || {};
    const oldestTab = tabs.reduce((oldest, current) => {
      const lastA = activity[oldest.id]?.lastAccessed || oldest.lastAccessed || 0;
      const lastC = activity[current.id]?.lastAccessed || current.lastAccessed || 0;
      return lastA < lastC ? oldest : current;
    }, tabs[0]);
    logger.info(ACTION.TAB.GET_OLDEST, { oldestTab: oldestTab?.id });
    return oldestTab;
  }

  async suspendInactiveTabs() {
    const inactiveTabs = await this.getInactiveTabs();
    const folderId = await getOrCreateBookmarkFolder();
    const start = performance.now();
    const results = await Promise.allSettled(
      inactiveTabs.map(async (tab) => {
        try {
          if (folderId) {
            await addBookmark({
              parentId: folderId,
              title: tab.title,
              url: tab.url
            });
          }
          await browser.tabs.remove(tab.id);
          // Use STATE.TAB.SUSPENDED for status update
          if (this.stateManager) {
            this.stateManager.dispatch(
              this.stateManager.actions.tabManagement.updateTab({
                id: tab.id,
                status: STATE.TAB.SUSPENDED,
                lastAccessed: Date.now()
              })
            );
          }
          logger.info(ACTION.TAB.SUSPEND_INACTIVE, { tabId: tab.id });
          return { success: true, tabId: tab.id };
        } catch (error) {
          logger.error('Failed to suspend tab', { tabId: tab.id, error: error.message });
          return { success: false, error: error.message };
        }
      })
    );
    const successCount = results.filter(r => r.value?.success).length;
    recordTelemetry(TELEMETRY_EVENTS.TAB_SUSPENDED, { count: successCount });
    recordPerformance('suspendInactiveTabs', performance.now() - start, { suspendedCount: successCount });
    return {
      success: true,
      suspendedCount: successCount,
      results: results.map(r => r.status === 'fulfilled' ? r.value : { success: false, error: r.reason?.message })
    };
  }

  async getInactiveTabs() {
    const allTabs = await browser.tabs.query({});
    return allTabs.filter(tab => !tab.active && !tab.pinned);
  }

  async enforceTabLimits() {
    const maxTabs = this.stateManager?.selectors?.selectSettings(this.stateManager.getState()).maxTabs || CONFIG.TAB_LIMITS.DEFAULT;
    const allTabs = await browser.tabs.query({});
    const { isValid, message } = validateTabLimit(allTabs.length, maxTabs);
    if (!isValid) {
      logger.warn(message, { currentCount: allTabs.length, maxTabs });
      throw new TabLimitExceededError(maxTabs);
    }
    if (allTabs.length <= maxTabs) return;
    const activity = this.stateManager?.selectors?.selectTabActivity(this.stateManager.getState()) || {};
    const sortedTabs = allTabs.slice().sort((a, b) => {
      const lastA = activity[a.id]?.lastAccessed || a.lastAccessed || 0;
      const lastB = activity[b.id]?.lastAccessed || b.lastAccessed || 0;
      return lastA - lastB;
    });
    const oldestTab = sortedTabs[0];
    logger.info('Tab limit exceeded, oldest tab identified', {
      currentCount: allTabs.length,
      maxTabs,
      oldestTab: oldestTab.id
    });
    logger.info(ACTION.TAB.ENFORCE_LIMIT, {
      currentCount: allTabs.length,
      maxTabs,
      oldestTab: oldestTab.id
    });

    // Notify background script of enforced limit (if needed)
    await sendMessageToBackground(MESSAGE_TYPES.TAB_ACTION, {
      action: ACTION.TAB.ENFORCE_LIMIT,
      payload: {
        currentCount: allTabs.length,
        maxTabs,
        oldestTab: oldestTab.id
      }
    });

    if (this.stateManager) {
      this.stateManager.dispatch(this.stateManager.actions.tabManagement.updateOldestTab(oldestTab));
    }
  }

  /**
   * Removes the bookmark for a given tab URL, if it exists.
   * @param {string} url - The URL of the tab/bookmark to remove.
   */
  async removeBookmarkForTab(url) {
    const bookmarks = await searchBookmarks({ url });
    for (const bm of bookmarks) {
      await removeBookmark(bm.id);
    }
    logger.info(ACTION.TAB.BOOKMARK, { action: 'remove', url, count: bookmarks.length });
  }
}

// Export a singleton instance
const tabManager = new TabManager();
export { tabManager, TAB_STATES };