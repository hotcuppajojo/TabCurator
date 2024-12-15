// utils/types.js

export const TAB_STATES = Object.freeze({
  ACTIVE: 'active',
  SUSPENDED: 'suspended',
  ARCHIVED: 'archived'
});

export const MESSAGE_TYPES = Object.freeze({
  STATE_SYNC: 'STATE_SYNC',
  CONNECTION_ACK: 'CONNECTION_ACK',
  ERROR: 'ERROR',
  TAB_ACTION: 'TAB_ACTION',
  STATE_UPDATE: 'STATE_UPDATE',
  RULE_UPDATE: 'RULE_UPDATE',
  SESSION_ACTION: 'SESSION_ACTION'
});

export const ERROR_TYPES = Object.freeze({
  PERMISSION_DENIED: 'PERMISSION_DENIED',
  API_UNAVAILABLE: 'API_UNAVAILABLE',
  INVALID_MESSAGE: 'INVALID_MESSAGE',
  CONNECTION_ERROR: 'CONNECTION_ERROR'
});

export const ACTION_TYPES = Object.freeze({
  STATE: {
    RESET: 'RESET_STATE',
    INITIALIZE: 'INITIALIZE_STATE',
    RECOVER: 'RECOVER_STATE'
  },
  TAB: {
    ARCHIVE: 'ARCHIVE_TAB',
    UPDATE_ACTIVITY: 'UPDATE_TAB_ACTIVITY',
    SET_TAGGING_PROMPT: 'SET_TAGGING_PROMPT'
  },
  SESSION: {
    SAVE: 'SAVE_SESSION',
    DELETE: 'DELETE_SESSION'
  },
  RULES: {
    UPDATE: 'UPDATE_RULES'
  }
});

// Add TypeScript-like type definitions as JSDoc comments
/**
 * @typedef {Object} Tab
 * @property {number} id - The tab ID
 * @property {string} url - The tab URL
 * @property {string} title - The tab title
 * @property {TAB_STATES} state - The tab state
 */

/**
 * @typedef {Object} Rule
 * @property {string} id - Unique rule identifier
 * @property {string} condition - URL or title pattern
 * @property {string} action - Action to take when condition matches
 */

// Add new service types
export const SERVICE_TYPES = Object.freeze({
  WORKER: 'worker',
  CONTENT: 'content',
  POPUP: 'popup'
});

// Add proper TypeScript-like validation types
export const VALIDATION_TYPES = Object.freeze({
  TAB: {
    required: ['id', 'url'],
    optional: ['title', 'active', 'discarded']
  },
  MESSAGE: {
    required: ['type', 'payload'],
    optional: ['meta', 'requestId']
  }
});

// Add proper permission constants
export const PERMISSIONS = Object.freeze({
  REQUIRED: {
    TABS: ['tabs'],
    MESSAGING: ['runtime'],
    STORAGE: ['storage'],
    BOOKMARKS: ['bookmarks']
  },
  OPTIONAL: ['declarativeNetRequest']
});

// Add service worker events
export const SW_EVENTS = Object.freeze({
  INSTALL: 'install',
  ACTIVATE: 'activate',
  MESSAGE: 'message',
  FETCH: 'fetch'
});

// Add batch processing configs
export const BATCH_CONFIG = Object.freeze({
  DEFAULT_SIZE: 10,
  MAX_SIZE: 100,
  TIMEOUT: 5000
});
