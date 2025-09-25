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

export const STATE = Object.freeze({
  TAB: {
    ACTIVE: 'ACTIVE',
    INACTIVE: 'INACTIVE',
    DISCARDED: 'DISCARDED',
    SUSPENDED: 'SUSPENDED',
    ARCHIVED: 'ARCHIVED',
    EXCEEDED_LIMIT: 'EXCEEDED_LIMIT',
    PENDING_TAG: 'PENDING_TAG',
  },
});

export const ACTION = Object.freeze({
  RULES: {
    UPDATE: 'UPDATE_RULES',
    ACTIVATE: 'ACTIVATE_RULES',
    DEACTIVATE: 'DEACTIVATE_RULES'
  },
  SESSION: {
    DELETE: 'DELETE_SESSION',
    RESTORE: 'RESTORE_SESSION',
    SAVE: 'SAVE_SESSION',
  },
  STATE: {
    INITIALIZE: 'INITIALIZE_STATE',
    RECOVER: 'RECOVER_STATE',
    RESET: 'RESET_STATE',
    SYNC: 'SYNC_STATE'
  },
  TAB: {
    SUSPEND_INACTIVE: 'SUSPEND_INACTIVE',
    TAG_AND_CLOSE: 'TAG_AND_CLOSE',
    GET_OLDEST: 'GET_OLDEST',
    CHECK_LIMIT: 'CHECK_LIMIT',
    ENFORCE_LIMIT: 'ENFORCE_LIMIT',
    BOOKMARK: 'BOOKMARK',
    CAPTURE: 'browser.tabs.create(createProperties)',
    CURRENT: 'browser.tabs.getCurrent()',
    CREATE: 'browser.tabs.create(createProperties)',
    DISCARD: 'browser.tabs.discard(tabId?)',
    DUPLICATE: 'browser.tabs.duplicate(tabId)',
    GET: 'browser.tabs.get(tabId)',
    GROUP: 'browser.tabs.group(options)',
    HIGHLIGHT: 'browser.tabs.highlight(highlightInfo)',
    MESSAGE: 'browser.tabs.sendMessage(tabId, message, options?)',
    MOVE: 'browser.tabs.move(tabIds, moveProperties)',
    LANGUAGE: 'browser.tabs.detectLanguage(tabId?)',
    QUERY: 'browser.tabs.query(queryInfo)',
    RELOAD: 'browser.tabs.reload(tabId?, reloadProperties?)',
    REMOVE: 'browser.tabs.remove(tabIds)',
    UNGROUP: 'browser.tabs.ungroup(tabIds)',
    UPDATE: 'browser.tabs.update(tabId, updateProperties)',
    LISTEN: {
      ACTIVATED: 'browser.tabs.onActivated.addListener(callback)',
      ATTACHED: 'browser.tabs.onAttached.addListener(callback)',
      CREATED: 'browser.tabs.onCreated.addListener(callback)',
      DETACHED: 'browser.tabs.onDetached.addListener(callback)',
      MOVED: 'browser.tabs.onMoved.addListener(callback)',
      REMOVED: 'browser.tabs.onRemoved.addListener(callback)',
      REPLACED: 'browser.tabs.onReplaced.addListener(callback)',
      UPDATED: 'browser.tabs.onUpdated.addListener(callback)',
      ZOOM: 'browser.tabs.onZoomChange.addListener(callback)',
    },
    ZOOM: { 
      FACTOR: {
        GET: 'browser.tabs.getZoom(tabId?)',
        SET: 'browser.tabs.setZoom(tabId?, zoomFactor)',
      },
      SETTINGS: {
        GET: 'browser.tabs.getZoomSettings(tabId?)',
        SET: 'browser.tabs.setZoomSettings(tabId?, zoomSettings)',
      },
    },
  }, 
  TAG: {
    ADD: 'ADD_TAG',
    REMOVE: 'REMOVE_TAG',
    UPDATE: 'UPDATE_TAG',
  },
});

export const ERROR = Object.freeze({
  LEVEL: {
    CRITICAL: 'CRITICAL',
    DEBUG: 'DEBUG',
    INFO: 'INFO',
    WARNING: 'WARNING',
  },
  CATEGORIES:{
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
  },
});

export const LOG = Object.freeze({
  CATEGORIES: {
    SECURITY: 'security',
    PERFORMANCE: 'performance',
    STATE: 'state',
    TELEMETRY: 'telemetry',
    API: 'api',
    UI: 'ui',
    RULES: 'rules',
    TABS: 'tabs'
  },
  LEVELS:{
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
  },
});

export const MESSAGE = Object.freeze({
  ACTION: {
    TAB: {
      CAPTURE: 'Captured the visible area of the current tab.',
      CURRENT: 'Retrieved the current active tab.',
      CREATE: 'Created a new tab.',
      DISCARD: 'Discarded tabId: ',
      DUPLICATE: 'Duplicated tabId: ',
      GET: 'Retrieved tabId: ',
      GROUP: 'Grouped tabs with tabIds: ',
      HIGHLIGHT: 'Highlighted tabs with tabIds: ',
      LANGUAGE: 'Detected the primary language of tabId: ',
      MESSAGE: 'Sent a message to tabId: ',
      MOVE: 'Moved tabs with tabIds: ',
      QUERY: 'Retrieved tabs matching query.',
      RELOAD: 'Reloaded tabId: ',
      REMOVE: 'Closed tabs with tabIds: ',
      UNGROUP: 'Ungrouped tabs with tabIds: ',
      UPDATE: 'Updated tabId: ',
      LISTEN: {
        ACTIVATED: 'Listening for tab activation events.',
        ATTACHED: 'Listening for tab attachment events.',
        CREATED: 'Listening for tab creation events.',
        DETACHED: 'Listening for tab detachment events.',
        MOVED: 'Listening for tab movement events.',
        REMOVED: 'Listening for tab removal events.',
        REPLACED: 'Listening for tab replacement events.',
        UPDATED: 'Listening for tab update events.',
        ZOOM: 'Listening for tab zoom change events.',
      },
      ZOOM: {
        FACTOR: {
          GET: 'Retrieved zoom factor of tabId: ',
          SET: 'Set zoom factor for tabId: ',
        },
        SETTINGS: {
          GET: 'Retrieved zoom settings of tabId: ',
          SET: 'Set zoom settings for tabId: ',
        },
      },
    },
  },
  CONNECTION: {

  },
  ERROR: {

    CONNECTION: {

    },
    TAB: {
      TAB: {
        CAPTURE: 'Failed to capture the visible area of the current tab.',
        CURRENT: 'Could not retrieve the current active tab.',
        CREATE: 'Creating a new tab failed.',
        DISCARD: 'Discarding tab failed.',
        DUPLICATE: 'Failed to duplicate tab.',
        GET: 'Failed to retrieve tab.',
        GROUP: 'Grouping tabs failed.',
        HIGHLIGHT: 'Highlighting tabs failed.',
        LANGUAGE: 'Primary language detection failed.',
        LISTEN: {
          ACTIVATED: 'Unable to listen for tab activation events.',
          ATTACHED: 'Unable to listen for tab attachment events.',
          CREATED: 'Unable to listen for tab creation events.',
          DETACHED: 'Unable to listen for tab detachment events.',
          MOVED: 'Unable to listen for tab movement events.',
          REMOVED: 'Unable to listen for tab removal events.',
          REPLACED: 'Unable to listen for tab replacement events.',
          UPDATED: 'Unable to listen for tab update events.',
          ZOOM: 'Unable to listen for tab zoom change events.',
        },
        MESSAGE: 'Failed to send message to tab.',
        MOVE: 'Moveing tabs failed.',
        QUERY: 'Failed to retrieve tabs matching query.',
        RELOAD: 'Reloading tab(s) failed.',
        REMOVE: 'Closing tabs failed.',
        UNGROUP: 'Unable to ungroup tabs.',
        UPDATE: 'Failed to update tab.',
        ZOOM: {
          FACTOR: {
            GET: 'Failed to retrieve zoom factor of tab.',
            SET: 'Setting zoom factor for tab failed.',
          },
          SETTINGS: {
            GET: 'Failed to retrieve zoom settings of tab.',
            SET: 'Setting zoom settings for tab failed.',
          },
        },
      },

    },
    TAG: {

    },
    PERMISSION: {

    },
    STORAGE: {

    },
    SYNC: {

    },
    VALIDATION: {
      PERMISSION_DENIED: 'PERMISSION_DENIED',
      API_UNAVAILABLE: 'API_UNAVAILABLE',
      INVALID_MESSAGE: 'INVALID_MESSAGE',
      CONNECTION_ERROR: 'CONNECTION_ERROR',
      TAB_LIMIT_EXCEEDED: 'TAB_LIMIT_EXCEEDED',
      TAGGING_REQUIRED: 'TAGGING_REQUIRED'
    },
  },
  RULES: {

  },
  SESSION: {

  },
  STATE: {

  },
});

export const PERMISSION = Object.freeze({
  PERMISSONS: {
    ACTIVE_TAB: 'activeTab',
    ALARMS: 'alarms',
    BACKGROUND: 'background',
    BOOKMARKS: 'bookmarks',
    DECLARATIVE_NET_REQUEST: 'declarativeNetRequest',
    STORAGE: 'storage',
    SESSIONS: 'sessions',
    SCRIPTING: 'scripting',
    TABS: 'tabs',
    TAB_GROUPS: 'tabGroups',
    WEB_NAVIGATION: 'webNavigation',
  },
});

export const CONNECTION = Object.freeze({
  INITIALIZE: 'CONNECTION_INITIALIZED',

});

export const DYNAMIC_CONFIG_KEYS = Object.freeze({
  TIMEOUTS: 'TIMEOUTS',
  THRESHOLDS: 'THRESHOLDS',
  RETRY: 'RETRY',
  BATCH: 'BATCH'
});

export const VALIDATION = Object.freeze({
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

export const CONFIG = Object.freeze({
  TYPES: {
    TIMEOUT: 'TIMEOUT',
    THRESHOLD: 'THRESHOLD',
    BATCH_SIZE: 'BATCH_SIZE',
  },
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
    LIMITS: {
      MIN: 1,
      MAX: 1000,
      DEFAULT: 100,
      WARNING_THRESHOLD: 0.9 // 90% of max tabs
    },
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

export const INACTIVITY_THRESHOLDS = {
  PROMPT: 600000,
  SUSPEND: 1800000,
  DEFAULT: 600000 // Add this line
};

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
  FOLDER_NAME: 'TabCurator',
  DEFAULT_FOLDER_ID: null // Will be set during initialization
});

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
  RATE_LIMITS: {
    API_CALLS: {
      WINDOW_MS: 60000, // 1 minute window
      MAX_REQUESTS: 100
    }
  }
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
      .oneOf(Object.values(messageTypes)),
    payload: yup.mixed().required(), // Allow empty object
    action: yup.string().when('type', {
      is: (type) => [messageTypes.TAB_ACTION, messageTypes.SESSION_ACTION].includes(type),
      then: yup.string().required(),
      otherwise: yup.string().optional()
    })
  }).noUnknown(true),
};

VALIDATION_SCHEMAS.message = yup.object().shape({
  type: yup.string().oneOf([
    messageTypes.STATE_SYNC,
    messageTypes.CONNECTION_ACK,
    messageTypes.ERROR,
    messageTypes.TAB_ACTION,
    messageTypes.STATE_UPDATE,
    messageTypes.RULE_UPDATE,
    messageTypes.SESSION_ACTION,
    messageTypes.SERVICE_WORKER_UPDATE,
    messageTypes.TAG_ACTION,
    messageTypes.TEST_MESSAGE, // Added TEST_MESSAGE
    messageTypes.GET_SESSIONS, // Added GET_SESSIONS
    messageTypes.INIT_CHECK // Added INIT_CHECK
  ]).required(),
  payload: yup.mixed().required(),
});

export {
  // ...other exports...
  deepEqual,
};