// utls/core/schemas.js
/**
 * @fileoverview Central repository for validation schemas.
 * Defines argument validation schemas for methods across modules.
 *
 * @module utils/core/schemas
 */

/**
 * Validation schemas for browser.tabs methods.
 * Define the expected argument types and whether they are required.
 */
export const VALIDATION_SCHEMAS = {
  create: [{ type: 'object', required: true }], // createProperties
  get: [{ type: 'number', required: true }], // tabId
  duplicate: [{ type: 'number', required: true }], // tabId
  query: [{ type: 'object', required: true }], // queryInfo
  update: [
    { type: 'number', required: true }, // tabId
    { type: 'object', required: true }, // updateProperties
  ],
  move: [
    { type: 'number', required: true }, // tabIds
    { type: 'object', required: true }, // moveProperties
  ],
  reload: [
    { type: 'number', required: false }, // tabId
    { type: 'object', required: false }, // reloadProperties
  ],
  highlight: [{ type: 'object', required: true }], // highlightInfo
  remove: [{ type: 'number', required: true }], // tabIds
  discard: [{ type: 'number', required: false }], // tabId
  group: [{ type: 'object', required: true }], // groupProperties
  ungroup: [{ type: 'number', required: true }], // tabIds
  zoom: [
    { type: 'number', required: false }, // tabId
    { type: 'number', required: true }, // zoomFactor
  ],
  initialize: [{ type: "object", required: true }],
  tagTabAndBookmark: [
    { type: 'number', required: true }, // tabId
    { type: 'string', required: true }, // tag
  ],
  // Add session validation schemas
  saveSession: [], // Empty array means no validation required
};

/**
 * Tag validation constants.
 * @readonly
 * @type {Object}
 */
export const TAG_VALIDATION = Object.freeze({
  TAG: {
    MAX_LENGTH: 50,
    PATTERN: /^[a-zA-Z0-9-_]+$/
  },
  RULE: {
    MAX_CONDITIONS: 10
  }
});

/**
 * State schema for validation.
 * @readonly
 * @type {Object}
 */
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

/**
 * Slice schemas for validation.
 * @readonly
 * @type {Object}
 */
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

/**
 * Validation error messages.
 * @readonly
 * @type {Object}
 */
export const VALIDATION_ERRORS = Object.freeze({
  PERMISSION_DENIED: 'Permission Denied',
  API_UNAVAILABLE: 'API Unavailable',
  INVALID_MESSAGE: 'Invalid Message',
  CONNECTION_ERROR: 'Connection Error',
  TAB_LIMIT_EXCEEDED: 'Tab Limit Exceeded',
  TAGGING_REQUIRED: 'Tagging Required'
});

/**
 * Validation schemas for permission-related functions
 * Used by jr() validation function
 */
export const PERMISSION_SCHEMAS = {
  initialize: [{ type: "object", required: true }]
};

/**
 * Advanced schemas for complex validation (for reference or runtime use).
 * @readonly
 * @type {Object}
 */
export const advancedSchemas = {
  message: {
    type: 'object',
    required: ['type', 'payload'],
    properties: {
      type: { 
        type: 'string',
        enum: ['TAB_ACTION', 'SESSION_ACTION', 'STATE_SYNC', 'TAG_ACTION']
      },
      payload: { type: 'object' },
      action: { type: 'string' }
    }
  },
  tab: {
    type: 'object',
    required: ['id', 'url'],
    properties: {
      id: { type: 'number', minimum: 0 },
      url: { type: 'string', format: 'uri' },
      title: { type: 'string' },
      active: { type: 'boolean' },
      discarded: { type: 'boolean' }
    }
  },
  config: {
    type: 'object',
    properties: {
      TIMEOUTS: { type: 'object' },
      THRESHOLDS: { type: 'object' },
      BATCH: { type: 'object' }
    }
  }
};