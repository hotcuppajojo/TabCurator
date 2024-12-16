/**
 * @fileoverview Constants and Type Definitions
 * Centralizes configuration, types, and constants used across modules.
 * 
 * @module constants
 */

import { createSelector } from 'reselect';

// Types
/**
 * @typedef {Object} Tab
 * @property {number} id
 * @property {string} title
 * @property {string} url
 * @property {boolean} active
 * @property {keyof typeof TAB_STATES} state
 */

/**
 * @typedef {Object} Session
 * @property {string} name
 * @property {Tab[]} tabs
 */

/**
 * @typedef {Object} Rule
 * @property {number} id
 * @property {string} condition
 * @property {string} action
 */

/**
 * @typedef {Object} DeclarativeRule
 * @property {number} id
 * @property {number} priority
 * @property {Object} condition
 * @property {string} condition.urlFilter
 * @property {string[]} condition.resourceTypes
 * @property {string[]} [condition.domains]
 * @property {Object} action
 */

/**
 * @typedef {Object} TabActivity
 * @property {number} lastAccessed
 * @property {keyof typeof TAB_STATES} suspensionStatus
 * @property {string[]} [tags]
 */

/**
 * @typedef {Object} AppState
 * @property {Tab[]} tabs
 * @property {Session[]} sessions
 * @property {(Rule|DeclarativeRule)[]} rules
 * @property {Record<number, Tab>} archivedTabs
 * @property {Record<number, TabActivity>} tabActivity
 * @property {Record<string, Session>} savedSessions
 * @property {boolean} isTaggingPromptActive
 * @property {DeclarativeRule[]} declarativeRules
 * @property {Object} serviceWorker
 */

/**
 * @typedef {Object} TabValidation
 * @property {string[]} required - Required tab properties
 * @property {string[]} optional - Optional tab properties
 */

/**
 * @typedef {Object} TagValidation
 * @property {number} MAX_LENGTH - Maximum tag length
 * @property {RegExp} PATTERN - Valid tag pattern
 */

export const CONNECTION_NAME = 'tabActivity';

// Tab States
export const TAB_STATES = Object.freeze({
  ACTIVE: 'ACTIVE',
  SUSPENDED: 'SUSPENDED',
  ARCHIVED: 'ARCHIVED',
});

// Message Types
export const MESSAGE_TYPES = Object.freeze({
  STATE_SYNC: 'STATE_SYNC',
  CONNECTION_ACK: 'CONNECTION_ACK',
  ERROR: 'ERROR',
  TAB_ACTION: 'TAB_ACTION',
  STATE_UPDATE: 'STATE_UPDATE',
  RULE_UPDATE: 'RULE_UPDATE',
  SESSION_ACTION: 'SESSION_ACTION'
});

// Error Types
export const ERROR_TYPES = Object.freeze({
  PERMISSION_DENIED: 'PERMISSION_DENIED',
  API_UNAVAILABLE: 'API_UNAVAILABLE',
  INVALID_MESSAGE: 'INVALID_MESSAGE',
  CONNECTION_ERROR: 'CONNECTION_ERROR'
});

export const ERROR_CATEGORIES = Object.freeze({
  TRANSIENT: {
    CONNECTION: 'connection',
    TIMEOUT: 'timeout',
    RATE_LIMIT: 'rateLimit'
  },
  CRITICAL: {
    AUTHENTICATION: 'auth',
    PERMISSION: 'permission',
    API: 'api',
    STATE: 'state'
  },
  SEVERITY: {
    LOW: 1,
    MEDIUM: 2,
    HIGH: 3,
    CRITICAL: 4
  }
});

export const DYNAMIC_CONFIG_KEYS = Object.freeze({
  TIMEOUTS: 'timeouts',
  THRESHOLDS: 'thresholds',
  RETRY: 'retry',
  BATCH: 'batch'
});

// Action Types
export const ACTION_TYPES = Object.freeze({
  STATE: {
    RESET: 'RESET_STATE',
    INITIALIZE: 'INITIALIZE_STATE',
    RECOVER: 'RECOVER_STATE',
    SYNC: 'SYNC_STATE', // Ensure SYNC_STATE is defined if used
  },
  TAB: {
    ARCHIVE: 'ARCHIVE_TAB',
    UPDATE_ACTIVITY: 'UPDATE_TAB_ACTIVITY',
    SET_TAGGING_PROMPT: 'SET_TAGGING_PROMPT',
  },
  SESSION: {
    SAVE_SESSION: 'SAVE_SESSION',
    RESTORE_SESSION: 'RESTORE_SESSION',
    DELETE_SESSION: 'DELETE_SESSION',
  },
  RULES: {
    UPDATE_RULES: 'UPDATE_RULES',
  },
});

// Service Types
export const SERVICE_TYPES = Object.freeze({
  WORKER: 'WORKER',
  CONTENT: 'CONTENT',
  POPUP: 'POPUP'
});

// Validation Types
/**
 * Enhanced validation types with documentation
 */
export const VALIDATION_TYPES = Object.freeze({
  TAB: {
    required: ['id', 'url'],
    optional: ['title', 'active', 'discarded'],
    /** Validates core tab properties */
    validate: (tab) => {
      return tab?.id && typeof tab.id === 'number' &&
             tab?.url && typeof tab.url === 'string';
    }
  },
  TAG: {
    MAX_LENGTH: 50,
    PATTERN: /^[a-zA-Z0-9-_]+$/,
    /** Validates tag format */
    validate: (tag) => {
      return typeof tag === 'string' &&
             tag.length <= TAG_VALIDATION.TAG.MAX_LENGTH &&
             TAG_VALIDATION.TAG.PATTERN.test(tag);
    }
  }
});

// Permissions
export const PERMISSIONS = Object.freeze({
  REQUIRED: {
    TABS: ['tabs'],
    MESSAGING: ['runtime'],
    STORAGE: ['storage'],
    BOOKMARKS: ['bookmarks']
  },
  OPTIONAL: ['declarativeNetRequest']
});

// Configuration Constants
export const CONFIG = Object.freeze({
  TIMEOUTS: {
    SHUTDOWN: 5000,
    SYNC: 10000,
    CLEANUP: 300000, // 5 minutes
    RULE_VALIDATION: 60000, // 1 minute
    CONNECTION: 5000,
    MESSAGE: 3000,
    BATCH: 30000,
    EMERGENCY: 5000
  },
  THRESHOLDS: {
    MESSAGE_PROCESSING: 50,
    STATE_SYNC: 100,
    BATCH_PROCESSING: 200,
    PERFORMANCE_WARNING: 16.67, // 60fps frame time
    STORAGE_WARNING: 0.8, // 80% usage warning
    SYNC_QUEUE: 100 // Maximum unsynced changes
  },
  BATCH: {
    MAX_SIZE: 100,
    DEFAULT_SIZE: 10,
    TIMEOUT: 5000,
    FLUSH_SIZE: 50 // Size before auto-flush for telemetry
  },
  STORAGE: {
    QUOTA: {
      MIN_BYTES: 1048576, // 1MB
      MAX_BYTES: 10485760, // 10MB
      DEFAULT_BYTES: 5242880 // 5MB
    },
    SYNC: {
      MAX_RETRIES: 3,
      BACKOFF_MS: 1000,
      MAX_UNSYNCED: 100
    },
    RETENTION: {
      METRICS: 86400000, // 24 hours
      EVENTS: 3600000 // 1 hour
    }
  },
  TELEMETRY: {
    BATCH_SIZE: 10,
    FLUSH_INTERVAL: 30000,
    REPORTING_INTERVAL: 300000, // 5 minutes
    MAX_ENTRIES: 1000,
    SAMPLE_SIZE: 5
  },
  RETRY: {
    DELAYS: [1000, 2000, 4000, 8000],
    MAX_ATTEMPTS: 4,
    JITTER_RANGE: 0.2,
    BACKOFF_BASE: 1000
  },
  INACTIVITY: {
    PROMPT: 600000, // 10 minutes
    SUSPEND: 1800000 // 30 minutes
  }
});

// Update configuration constants
export const BATCH_CONFIG = CONFIG.BATCH;
export const STORAGE_CONFIG = CONFIG.STORAGE;
export const TELEMETRY_CONFIG = {
  ...TELEMETRY_CONFIG,
  THRESHOLDS: CONFIG.THRESHOLDS
};

// Add tab management constants
export const TAB_PERMISSIONS = Object.freeze({
  REQUIRED: ['tabs'],
  OPTIONAL: ['declarativeNetRequest']
});

export const TAB_OPERATIONS = Object.freeze({
  DISCARD: 'discard',
  BOOKMARK: 'bookmark',
  ARCHIVE: 'archive',
  UPDATE: 'update'
});

export const INACTIVITY_THRESHOLDS = {
  PROMPT: 600000, // 10 minutes
  SUSPEND: 1800000, // 30 minutes
};

// Add tagging constants
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

export const TAG_VALIDATION = Object.freeze({
  TAG: {
    MAX_LENGTH: 50,
    PATTERN: /^[a-zA-Z0-9-_]+$/
  },
  RULE: {
    MAX_CONDITIONS: 10
  }
});

export const BOOKMARK_CONFIG = Object.freeze({
  FOLDER_NAME: 'TabCurator'
});

// Selectors
export const createTabSelector = (selector) => selector;

export const selectors = {
  selectTabs: (state) => state.tabs,
  selectArchivedTabs: (state) => state.archivedTabs,
  selectTabActivity: (state) => state.tabActivity,
  selectActiveTabs: createSelector(
    [(state) => state.tabs],
    (tabs) => tabs.filter(tab => tab.active)
  ),
  selectInactiveTabs: createSelector(
    [(state) => state.tabActivity, (state) => state.tabs],
    (activity, tabs) => {
      const now = Date.now();
      return tabs.filter(tab => {
        const lastAccessed = activity[tab.id]?.lastAccessed || now;
        return (now - lastAccessed) > CONFIG.INACTIVITY.PROMPT;
      });
    }
  ),
  selectMatchingRules: createSelector(
    [(state) => state.declarativeRules, (_, url) => url],
    (rules, url) => rules.filter(rule => 
      new RegExp(rule.condition.urlFilter.replace(/\*/g, '.*')).test(url)
    )
  )
};

// Define the types before exporting
export const Tab = /** @typedef {Object} Tab
 * @property {number} id
 * @property {string} title
 * @property {string} url
 * @property {boolean} active
 * @property {keyof typeof TAB_STATES} state
 */ {};

export const Session = /** @typedef {Object} Session
 * @property {string} name
 * @property {Tab[]} tabs
 */ {};

export const Rule = /** @typedef {Object} Rule
 * @property {number} id
 * @property {string} condition
 * @property {string} action
 */ {};

export const DeclarativeRule = /** @typedef {Object} DeclarativeRule
 * @property {number} id
 * @property {number} priority
 * @property {Object} condition
 * @property {string} condition.urlFilter
 * @property {string[]} condition.resourceTypes
 * @property {string[]} [condition.domains]
 * @property {Object} action
 */ {};

export const TabActivity = /** @typedef {Object} TabActivity
 * @property {number} lastAccessed
 * @property {keyof typeof TAB_STATES} suspensionStatus
 * @property {string[]} [tags]
 */ {};

// Export types for TypeScript
export {
  Tab,
  Session,
  Rule,
  DeclarativeRule,
  TabActivity,
  AppState,
  // Constants
  TAB_STATES,
  MESSAGE_TYPES,
  ACTION_TYPES,
  // Validation
  VALIDATION_TYPES,
  // Configuration
  CONFIG,
  BATCH_CONFIG,
  // Selectors
  selectors
};
