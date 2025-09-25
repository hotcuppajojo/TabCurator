// utils/core/config.js
/**
 * @fileoverview Minimal global configuration constants for TabCurator.
 * Only includes runtime, batch, storage, telemetry, and dynamic config keys.
 * 
 * @module utils/core/config
 */

/**
 * Main configuration object for runtime, batch, storage, telemetry, and thresholds.
 * @readonly
 * @type {Object}
 */
export const CONFIG = Object.freeze({
  // Dynamic configuration keys for runtime updates.
  DYNAMIC_CONFIG_KEYS: {
    TIMEOUTS: 'TIMEOUTS',
    THRESHOLDS: 'THRESHOLDS',
    RETRY: 'RETRY',
    BATCH: 'BATCH'
  },
  INACTIVITY_THRESHOLDS: {
    DEFAULT: 60,
    PROMPT: 600000,
    SUSPEND: 1800000,
  },
  RETRY: {
    DELAYS: [1000, 2000, 4000, 8000],
    MAX_ATTEMPTS: 4,
    JITTER_RANGE: 0.2,
    BACKOFF_BASE: 1000,
  },
  TIMEOUTS: {
    API_CALL: 5000,
    CONNECTION: 3000,
    SHUTDOWN: 5000,
    SYNC: 10000,
    CLEANUP: 300000,
  },
  THRESHOLDS: {
    TAB_WARNING: 0.9,
    MESSAGE_PROCESSING: 50,
    STATE_SYNC: 100,
    STORAGE_WARNING: 0.8,
    PERFORMANCE_WARNING: 16.67,
    SYNC_QUEUE: 100,
  },
  TAB_LIMITS: {
    MIN: 1,
    MAX: 1000,
    DEFAULT: 30,
  },
  TELEMETRY: {
    BATCH_SIZE: 10,
    FLUSH_INTERVAL: 30000,
    REPORTING_INTERVAL: 300000,
    MAX_ENTRIES: 1000,
    SAMPLE_SIZE: 5,
    ERROR_THRESHOLD: 10,
    PERFORMANCE_THRESHOLD: 100,
  },
  BATCH: {
    MAX_SIZE: 100,
    DEFAULT_SIZE: 10,
    TIMEOUT: 5000,
    FLUSH_SIZE: 50,
  },
  // Service types for background processing
  SERVICE_TYPES: {
    WORKER: 'WORKER',
    BACKGROUND: 'BACKGROUND'
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
    }
  },
  METRICS: {
    REPORTING_INTERVAL: 300000
  }
});
/**
 * Utility function to get a timeout value from CONFIG.
 * @param {string} key - The timeout key.
 * @param {number} [fallback=CONFIG.TIMEOUTS.API_CALL] - Fallback value if key is not found.
 * @returns {number} Timeout value in milliseconds.
 */
export const getTimeout = (key, fallback = CONFIG.TIMEOUTS.API_CALL) =>
  CONFIG.TIMEOUTS[key] || fallback;

/**
 * Utility function to get a threshold value from CONFIG.
 * @param {string} key - The threshold key.
 * @param {number} [fallback=CONFIG.THRESHOLDS.TAB_WARNING] - Fallback value if key is not found.
 * @returns {number} Threshold value.
 */
export function getThreshold(key, fallback) {
  return CONFIG.THRESHOLDS[key] !== undefined
    ? CONFIG.THRESHOLDS[key]
    : fallback;
}

/**
 * Utility function to get a batch size value from CONFIG.
 * @param {string} key - The batch size key.
 * @param {number} [fallback=CONFIG.BATCH.DEFAULT_SIZE] - Fallback value if key is not found.
 * @returns {number} Batch size value.
 */
export function getBatchSize(key, fallback) {
  return CONFIG.BATCH[key] !== undefined
    ? CONFIG.BATCH[key]
    : fallback;
}