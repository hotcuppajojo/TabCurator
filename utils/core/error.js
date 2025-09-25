// utils/core/error.js
/**
 * @fileoverview Custom error classes and error/logging constants for centralized error handling.
 * @module utils/core/error
 */

/**
 * Error categories for classification and severity.
 * @readonly
 * @type {Object}
 */
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

/**
 * Error types for common error scenarios.
 * @readonly
 * @type {Object}
 */
export const ERROR_TYPES = Object.freeze({
  PERMISSION_DENIED: 'PERMISSION_DENIED',
  API_UNAVAILABLE: 'API_UNAVAILABLE',
  INVALID_MESSAGE: 'INVALID_MESSAGE',
  CONNECTION_ERROR: 'CONNECTION_ERROR',
  TAB_LIMIT_EXCEEDED: 'TAB_LIMIT_EXCEEDED',
  TAGGING_REQUIRED: 'TAGGING_REQUIRED'
});

/**
 * Log categories for structured logging.
 * @readonly
 * @type {Object}
 */
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

/**
 * Log levels for controlling verbosity.
 * @readonly
 * @type {Object}
 */
export const LOG_LEVELS = Object.freeze({
  NONE: 0,
  ERROR: 1,
  WARN: 2,
  INFO: 3,
  DEBUG: 4,
  ALL: 5
});

/**
 * Validation error for schema or argument validation failures.
 */
export class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
  }
}

/**
 * API error for failed API calls.
 */
export class APIError extends Error {
  constructor(message) {
    super(message);
    this.name = 'APIError';
  }
}

/**
 * Error for exceeding the tab limit.
 */
export class TabLimitExceededError extends Error {
  constructor(limit) {
    super(`Tab limit of ${limit} exceeded.`);
    this.name = 'TabLimitExceededError';
  }
}

