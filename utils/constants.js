// utils/constants.js
/**
 * @fileoverview Constants and Type Definitions
 * Centralizes configuration, types, and constants used across modules.
 * 
 * @module constants
 */

import { createSelector } from 'reselect';
import * as yup from 'yup';
import deepEqual from 'fast-deep-equal'; // Changed import source from 'reselect' to 'fast-deep-equal'

// Types (for documentation and tooling only; not exported as values)
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

// Additional validation typedefs
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

export const TAB_STATES = Object.freeze({
  ACTIVE: 'ACTIVE',
  SUSPENDED: 'SUSPENDED',
  ARCHIVED: 'ARCHIVED',
  PENDING_TAG: 'PENDING_TAG',
  EXCEEDED_LIMIT: 'EXCEEDED_LIMIT'
});

export const MESSAGE_TYPES = Object.freeze({
  STATE_SYNC: 'STATE_SYNC',
  CONNECTION_ACK: 'CONNECTION_ACK',
  ERROR: 'ERROR',
  TAB_ACTION: 'TAB_ACTION',
  STATE_UPDATE: 'STATE_UPDATE',
  RULE_UPDATE: 'RULE_UPDATE',
  SESSION_ACTION: 'SESSION_ACTION',
  SERVICE_WORKER_UPDATE: 'SERVICE_WORKER_UPDATE',
  TAG_ACTION: 'TAG_ACTION',
  TEST_ACTION: 'TEST_ACTION',       // Ensure TEST_ACTION is defined
  TEST_MESSAGE: 'TEST_MESSAGE',      // Ensure TEST_MESSAGE is defined
  GET_SESSIONS: 'GET_SESSIONS', // Added GET_SESSIONS message type
  INIT_CHECK: 'INIT_CHECK',  // Add this new message type
});

export const ERROR_TYPES = Object.freeze({
  PERMISSION_DENIED: 'PERMISSION_DENIED',
  API_UNAVAILABLE: 'API_UNAVAILABLE',
  INVALID_MESSAGE: 'INVALID_MESSAGE',
  CONNECTION_ERROR: 'CONNECTION_ERROR',
  TAB_LIMIT_EXCEEDED: 'TAB_LIMIT_EXCEEDED',
  TAGGING_REQUIRED: 'TAGGING_REQUIRED'
});

export const ERROR_CATEGORIES = Object.freeze({
  CRITICAL_STORAGE: 'CRITICAL_STORAGE',
  TRANSIENT: {
    CONNECTION: 'connection',
    TIMEOUT: 'timeout',
    RATE_LIMIT: 'rateLimit',
    UNKNOWN: 'unknown',
    NETWORK: 'connection'
  },
  CRITICAL: {
    AUTHENTICATION: 'auth',
    PERMISSION: 'permission',
    API: 'api',
    STATE: 'state',
    STORAGE: 'storage',
    VALIDATION: 'validation'
  },
  SEVERITY: {
    LOW: 1,
    MEDIUM: 2,
    HIGH: 3,
    CRITICAL: 4
  }
});

export const DYNAMIC_CONFIG_KEYS = Object.freeze({
  TIMEOUTS: 'TIMEOUTS',
  THRESHOLDS: 'THRESHOLDS',
  RETRY: 'RETRY',
  BATCH: 'BATCH'
});

export const ACTION_TYPES = Object.freeze({
  STATE: {
    RESET: 'RESET_STATE',
    INITIALIZE: 'INITIALIZE_STATE',
    RECOVER: 'RECOVER_STATE',
    SYNC: 'SYNC_STATE'
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

export const SERVICE_TYPES = Object.freeze({
  WORKER: 'WORKER',
  CONTENT: 'CONTENT',
  POPUP: 'POPUP',
  BACKGROUND: 'BACKGROUND'
});

export const VALIDATION_TYPES = Object.freeze({
  TAB: {
    required: ['id', 'url'],
    optional: ['title', 'active', 'discarded'],
    validate: (tab) => {
      return tab?.id && typeof tab.id === 'number' &&
             tab?.url && typeof tab.url === 'string';
    }
  },
  TAG: {
    MAX_LENGTH: 50,
    PATTERN: /^[a-zA-Z0-9-_]+$/,
    validate: (tag) => {
      return typeof tag === 'string' &&
             tag.length <= TAG_VALIDATION.TAG.MAX_LENGTH &&
             TAG_VALIDATION.TAG.PATTERN.test(tag);
    }
  },
  TAB_LIMIT: {
    validate: (count, limit) => ({
      isValid: count <= limit,
      message: count > limit ? `Tab limit of ${limit} exceeded` : null
    })
  }
});

export const PERMISSIONS = Object.freeze({
  REQUIRED: {
    TABS: ['tabs'],
    MESSAGING: ['runtime'],
    STORAGE: ['storage'],
    BOOKMARKS: ['bookmarks']
  },
  OPTIONAL: ['declarativeNetRequest']
});

export const CONFIG = Object.freeze({
  TIMEOUTS: {
    SHUTDOWN: 5000,
    SYNC: 10000,
    CLEANUP: 300000,
    RULE_VALIDATION: 60000,
    CONNECTION: 5000,
    MESSAGE: 3000,
    BATCH: 30000,
    EMERGENCY: 5000
  },
  THRESHOLDS: {
    MESSAGE_PROCESSING: 50,
    STATE_SYNC: 100,
    BATCH_PROCESSING: 200,
    PERFORMANCE_WARNING: 16.67,
    STORAGE_WARNING: 0.8,
    SYNC_QUEUE: 100
  },
  BATCH: {
    MAX_SIZE: 100,
    DEFAULT: {
      SIZE: 10,
      TIMEOUT: 5000
    },
    FLUSH_SIZE: 50,
    TIMEOUT: 5000
  },
  STORAGE: {
    QUOTA: {
      MIN_BYTES: 1048576,
      MAX_BYTES: 10485760,
      DEFAULT_BYTES: 5242880
    },
    SYNC: {
      MAX_RETRIES: 3,
      BACKOFF_MS: 1000,
      MAX_UNSYNCED: 100
    },
    RETENTION: {
      METRICS: 86400000,
      EVENTS: 3600000
    }
  },
  TELEMETRY: {
    BATCH_SIZE: 10,
    FLUSH_INTERVAL: 30000,
    REPORTING_INTERVAL: 300000,
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
    PROMPT: 600000,
    SUSPEND: 1800000
  },
  TABS: {
    LIMITS: null, // Set below
    PROMPT_THRESHOLD: 0.9,
    REQUIRE_TAG_ON_CLOSE: true
  },
  // Added METRICS config for reporting interval reference
  METRICS: {
    REPORTING_INTERVAL: 300000 // 5 minutes
  },

  getTimeout: (key, fallback) => {
    const value = CONFIG.TIMEOUTS[key];
    if (typeof value === 'number' && 
        value >= CONFIG_RANGES.TIMEOUTS.min && 
        value <= CONFIG_RANGES.TIMEOUTS.max) {
      return value;
    }
    return fallback || CONFIG_DEFAULTS.TIMEOUTS[key] || CONFIG_DEFAULTS.TIMEOUTS.MIN;
  },

  getThreshold: (key, fallback) => {
    const value = CONFIG.THRESHOLDS[key];
    if (typeof value === 'number' && 
        value >= CONFIG_RANGES.THRESHOLDS.min && 
        value <= CONFIG_RANGES.THRESHOLDS.max) {
      return value;
    }
    return fallback || CONFIG_DEFAULTS.THRESHOLDS[key] || CONFIG_DEFAULTS.THRESHOLDS.MIN;
  },

  getBatchSize: (key, fallback) => {
    const value = CONFIG.BATCH[key];
    if (typeof value === 'number' && 
        value >= CONFIG_RANGES.BATCH.size.min && 
        value <= CONFIG_RANGES.BATCH.size.max) {
      return value;
    }
    return fallback || CONFIG_DEFAULTS.BATCH[key] || CONFIG_DEFAULTS.BATCH.MIN_SIZE;
  },

  INACTIVITY_THRESHOLDS: {
    DEFAULT: 60,
    PROMPT: 600000,
    SUSPEND: 1800000,
  }
});

export const BATCH_CONFIG = CONFIG.BATCH;
export const STORAGE_CONFIG = CONFIG.STORAGE;

// TELEMETRY_CONFIG was referenced, define it here:
export const TELEMETRY_CONFIG = {
  ...CONFIG.TELEMETRY,
  THRESHOLDS: CONFIG.THRESHOLDS
};

export const TAB_PERMISSIONS = Object.freeze({
  REQUIRED: ['tabs'],
  OPTIONAL: ['declarativeNetRequest']
});

export const TAB_OPERATIONS = Object.freeze({
  DISCARD: 'discard',
  BOOKMARK: 'bookmark',
  ARCHIVE: 'archive',
  UPDATE: 'update',
  TAG_AND_CLOSE: 'tagAndClose',
  GET_OLDEST: 'getOldestTab',
  CHECK_LIMIT: 'checkTabLimit',
  ENFORCE_LIMIT: 'enforceTabLimit'
});

export const INACTIVITY_THRESHOLDS = {
  PROMPT: 600000,
  SUSPEND: 1800000,
  DEFAULT: 600000 // Add this line
};

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

export const TAB_LIMITS = Object.freeze({
  MIN: 1,
  MAX: 1000,
  DEFAULT: 100,
  WARNING_THRESHOLD: 0.9 // 90% of max tabs
});

// Set the TABS.LIMITS in CONFIG now that TAB_LIMITS is defined
CONFIG.TABS.LIMITS = TAB_LIMITS;

export const createTabSelector = (selector) => selector;

// Define base selectors
const selectTabManagementState = state => state.tabManagement;
const selectSessionsState = state => state.sessions;
const selectSettingsState = state => state.settings;

export const selectors = {
  // Tab Management
  selectTabs: state => selectTabManagementState(state).tabs,
  selectTabById: createSelector(
    [selectTabManagementState, (_, tabId) => tabId],
    (tabManagement, tabId) => tabManagement.tabs.find(tab => tab.id === tabId)
  ),
  selectTabActivity: state => selectTabManagementState(state).activity,
  selectTabMetadata: state => selectTabManagementState(state).metadata,
  selectSuspendedTabs: state => selectTabManagementState(state).suspended,
  selectOldestTab: state => selectTabManagementState(state).oldestTab,

  // Sessions
  selectSessions: selectSessionsState,
  selectSessionById: createSelector(
    [selectSessionsState, (_, id) => id],
    (sessions, id) => sessions.find(s => s.id === id)
  ),

  // Settings
  selectSettings: selectSettingsState,
  selectMaxTabs: createSelector(
    [selectSettingsState],
    settings => settings.maxTabs
  ),

  // Other
  selectPermissions: state => state.permissions,
  selectArchivedTabs: state => state.archivedTabs,
};

export { createSelector } from 'reselect'; // Example of re-exporting if needed

// Define and export coreSelectors
export const coreSelectors = {
  someSelector: (state) => state.someProperty,
  anotherSelector: (state) => state.anotherProperty,
  // ...other selectors...
};

// No longer export Tab, Session, Rule, DeclarativeRule, TabActivity, AppState as values.
// They remain as JSDoc typedefs only.

export const LOG_CATEGORIES = Object.freeze({
  SECURITY: 'security',
  PERFORMANCE: 'performance',
  STATE: 'state',
  TELEMETRY: 'telemetry',
  API: 'api',
  UI: 'ui',
  RULES: 'rules',
  TABS: 'tabs'
});

export const LOG_LEVELS = Object.freeze({
  NONE: 0,
  ERROR: 1,
  WARN: 2,
  INFO: 3,
  DEBUG: 4,
  ALL: 5,
  PERFORMANCE: 'performance',
  SECURITY: 'security',
  STATE: 'state',
  TELEMETRY: 'telemetry',
  API: 'api',
  UI: 'ui',
  RULES: 'rules',
  TABS: 'tabs'
});

/**
 * @typedef {Object} ConfigDefaults
 * Default fallback values for dynamic configuration
 */
export const CONFIG_DEFAULTS = Object.freeze({
  TIMEOUTS: {
    SHUTDOWN: 5000,
    SYNC: 10000,
    CLEANUP: 300000,
    RULE_VALIDATION: 60000,
    CONNECTION: 5000,
    MESSAGE: 3000,
    BATCH: 30000,
    EMERGENCY: 5000,
    MIN: 1000,
    MAX: 600000
  },
  THRESHOLDS: {
    MESSAGE_PROCESSING: 50,
    STATE_SYNC: 100,
    BATCH_PROCESSING: 200,
    PERFORMANCE_WARNING: 16.67,
    STORAGE_WARNING: 0.8,
    SYNC_QUEUE: 100,
    MIN: 10,
    MAX: 1000
  },
  BATCH: {
    MAX_SIZE: 100,
    DEFAULT_SIZE: 10,
    TIMEOUT: 5000,
    FLUSH_SIZE: 50,
    MIN_SIZE: 5,
    MAX_TIMEOUT: 30000
  }
});

/**
 * Configuration validation ranges
 */
export const CONFIG_RANGES = Object.freeze({
  TIMEOUTS: {
    min: CONFIG_DEFAULTS.TIMEOUTS.MIN,
    max: CONFIG_DEFAULTS.TIMEOUTS.MAX
  },
  THRESHOLDS: {
    min: CONFIG_DEFAULTS.THRESHOLDS.MIN,
    max: CONFIG_DEFAULTS.THRESHOLDS.MAX
  },
  BATCH: {
    size: {
      min: CONFIG_DEFAULTS.BATCH.MIN_SIZE,
      max: CONFIG_DEFAULTS.BATCH.MAX_SIZE
    },
    timeout: {
      min: CONFIG_DEFAULTS.TIMEOUTS.MIN,
      max: CONFIG_DEFAULTS.BATCH.MAX_TIMEOUT
    }
  }
});

export const CONFIG_SCHEMAS = Object.freeze({
  timeout: {
    type: 'number',
    minimum: CONFIG_RANGES.TIMEOUTS.min,
    maximum: CONFIG_RANGES.TIMEOUTS.max
  },
  threshold: {
    type: 'number',
    minimum: CONFIG_RANGES.THRESHOLDS.min,
    maximum: CONFIG_RANGES.THRESHOLDS.max
  },
  batchSize: {
    type: 'number',
    minimum: CONFIG_RANGES.BATCH.size.min,
    maximum: CONFIG_RANGES.BATCH.size.max
  },
  // Include RATE_LIMITS here instead of adding it after freeze
  RATE_LIMITS: {
    API_CALLS: {
      WINDOW_MS: 60000, // 1 minute window
      MAX_REQUESTS: 100
    }
  }
});

export const CONFIG_TYPES = Object.freeze({
  TIMEOUT: 'timeout',
  THRESHOLD: 'threshold',
  BATCH_SIZE: 'batchSize'
});

export const validateConfigValue = (type, value) => {
  const schema = CONFIG_SCHEMAS[type];
  if (!schema) {
    return CONFIG_DEFAULTS[type] || null;
  }

  if (typeof value !== schema.type || 
      value < schema.minimum || 
      value > schema.maximum) {
    return CONFIG_DEFAULTS[type] || schema.minimum;
  }

  return value;
};

// Simplify schemas to avoid runtime compilation
export const STATE_SCHEMA = Object.freeze({
  type: 'object',
  required: ['tabs'],
  properties: {
    tabs: {
      type: 'array',
      items: {
        type: 'object',
        required: ['id', 'url'],
        properties: {
          id: { type: 'number', minimum: 0 },
          url: { type: 'string' },
          title: { type: 'string' },
          active: { type: 'boolean' }
        }
      }
    }
  }
});

export const SLICE_SCHEMAS = Object.freeze({
  tabManagement: {
    type: 'object',
    required: ['tabs', 'activity', 'metadata'],
    properties: {
      tabs: { $ref: '#/properties/tabs' },
      activity: { $ref: '#/properties/tabActivity' },
      metadata: {
        type: 'object',
        additionalProperties: {
          type: 'object',
          properties: {
            tags: {
              type: 'array',
              items: { type: 'string' }
            },
            lastUpdated: { type: 'number' }
          }
        }
      }
    }
  },
  sessions: {
    $ref: '#/properties/sessions'
  },
  rules: {
    $ref: '#/properties/rules'
  }
});

export const VALIDATION_ERRORS = {
  // Define your validation errors here
  PERMISSION_DENIED: 'Permission Denied',
  API_UNAVAILABLE: 'API Unavailable',
  INVALID_MESSAGE: 'Invalid Message',
  CONNECTION_ERROR: 'Connection Error',
  TAB_LIMIT_EXCEEDED: 'Tab Limit Exceeded',
  TAGGING_REQUIRED: 'Tagging Required'
};

// Replace Ajv schemas with Yup schemas
export const VALIDATION_SCHEMAS = {
  tab: yup.object({
    id: yup.number().required().positive().integer(),
    url: yup.string().required().url(),
    title: yup.string(),
    active: yup.boolean()
  }),

  message: yup.object().shape({
    type: yup.string()
      .required()
      .oneOf(Object.values(MESSAGE_TYPES)),
    payload: yup.mixed().required(), // Allow empty object
    action: yup.string().when('type', {
      is: (type) => [MESSAGE_TYPES.TAB_ACTION, MESSAGE_TYPES.SESSION_ACTION].includes(type),
      then: yup.string().required(),
      otherwise: yup.string().optional()
    })
  }).noUnknown(true),
};

VALIDATION_SCHEMAS.message = yup.object().shape({
  type: yup.string().oneOf([
    MESSAGE_TYPES.STATE_SYNC,
    MESSAGE_TYPES.CONNECTION_ACK,
    MESSAGE_TYPES.ERROR,
    MESSAGE_TYPES.TAB_ACTION,
    MESSAGE_TYPES.STATE_UPDATE,
    MESSAGE_TYPES.RULE_UPDATE,
    MESSAGE_TYPES.SESSION_ACTION,
    MESSAGE_TYPES.SERVICE_WORKER_UPDATE,
    MESSAGE_TYPES.TAG_ACTION,
    MESSAGE_TYPES.TEST_MESSAGE, // Added TEST_MESSAGE
    MESSAGE_TYPES.GET_SESSIONS, // Added GET_SESSIONS
    MESSAGE_TYPES.INIT_CHECK // Added INIT_CHECK
  ]).required(),
  payload: yup.mixed().required(),
});

export {
  // ...other exports...
  deepEqual,
};