// utils/core/state.js
/**
 * @fileoverview Application state constants.
 * @module utils/core/state
 */

export const STATE = Object.freeze({
    TAB: {
      ACTIVE: 'ACTIVE',
      ARCHIVED: 'ARCHIVED',
      DISCARDED: 'DISCARDED',
      EXCEEDED_LIMIT: 'EXCEEDED_LIMIT',
      INACTIVE: 'INACTIVE',
      PENDING_TAG: 'PENDING_TAG',
      SUSPENDED: 'SUSPENDED',
    },
    APP: {
      INITIALIZED: 'INITIALIZED',
      ERROR: 'ERROR',
    },
  });
  
  // Core Selectors (for state management)
  export const coreSelectors = {
    someSelector: (state) => state.someProperty,
    anotherSelector: (state) => state.anotherProperty,
    selectTabs: (state) => state.tabManagement?.tabs || [],
    selectTabById: (state, tabId) => state.tabManagement?.tabs?.find(tab => tab.id === tabId),
    selectTabActivity: (state) => state.tabManagement?.activity || {},
    selectTabMetadata: (state) => state.tabManagement?.metadata || {},
    selectSuspendedTabs: (state) => state.tabManagement?.suspended || {},
    selectOldestTab: (state) => state.tabManagement?.oldestTab,
    selectSessions: (state) => state.sessions || [],
    selectSessionById: (state, id) => state.sessions?.find(s => s.id === id),
    selectSettings: (state) => state.settings || {},
    selectPermissions: (state) => state.permissions || {},
    selectArchivedTabs: (state) => state.archivedTabs || {},
    selectMaxTabs: (state) => state.settings?.maxTabs
  };
  
  // Selectors object (for reselect compatibility)
  export const selectors = {
    ...coreSelectors
  };