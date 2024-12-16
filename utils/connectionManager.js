// utils/connectionManager.js

import browser from 'webextension-polyfill';
import { MESSAGE_TYPES, PERMISSIONS, ERROR_TYPES, CONFIG, ERROR_CATEGORIES, DYNAMIC_CONFIG_KEYS, CONFIG_SCHEMAS, TELEMETRY_CONFIG, STORAGE_CONFIG } from './constants.js';
import { store } from './stateManager.js';
import { 
  getTab, 
  updateTab, 
  discardTab 
} from './tabManager.js';
import { validateTag } from './tagUtils.js';
import Ajv from 'ajv';
import deepEqual from 'fast-deep-equal';

/**
 * @fileoverview Enhanced Connection Manager with performance monitoring,
 * dedicated message handlers, and improved service worker integration.
 * 
 * Key responsibilities:
 * - Message validation and routing
 * - Connection state management
 * - Permission handling
 * - Batch processing
 * - Service worker registration
 */

// Message schemas
const messageSchema = {
  type: 'object',
  required: ['type', 'payload'],
  properties: {
    type: { type: 'string' },
    payload: { type: 'object' },
    requestId: { type: 'string' }
  }
};

const ajv = new Ajv();
const validateMessage = ajv.compile(messageSchema);

// Add performance monitoring configuration
const PERFORMANCE_THRESHOLDS = {
  MESSAGE_PROCESSING: 50,
  STATE_SYNC: 100,
  BATCH_PROCESSING: 200
};

class ConnectionManager {
  constructor() {
    this.connections = new Map();
    this.messageQueue = [];
    this.isProcessingQueue = false;
    this.retryCount = 0;
    this.maxRetries = CONFIG.RETRY.MAX_ATTEMPTS;
    this.lastStateSync = null;
    this.retryDelays = CONFIG.RETRY.DELAYS;
    this.metrics = {
      errors: new Map(),
      performance: new Map(),
      connections: new Map(),
      lastReport: Date.now()
    };
    this.lastCleanup = Date.now();
    this.cleanupInterval = CONFIG.TIMEOUTS.CLEANUP;

    // Add dynamic configuration storage
    this.dynamicConfig = new Map();
    this._initializeDynamicConfig();

    // Start metrics reporting
    this._setupMetricsReporting();

    // Add rate limiting trackers
    this.apiCalls = new Map();
    this.configValidators = new Map();
    this.initializeValidators();
    
    // Add storage quota tracking
    this.storageQuota = CONFIG.STORAGE.QUOTA.DEFAULT_BYTES;
    this.metricsSize = 0;

    // Add telemetry handling
    this.telemetry = new Map();
    this.unsyncedChanges = new Map();
    this.currentOperations = new Set();
    
    // Initialize dynamic storage quota
    this._initializeStorageQuota();
  }

  /**
   * Initialize dynamic configuration with defaults from CONFIG
   * @private
   */
  async _initializeDynamicConfig() {
    try {
      // Load any stored configuration
      const stored = await browser.storage.local.get('dynamicConfig');
      
      // Initialize with defaults
      this.dynamicConfig = new Map(Object.entries({
        [DYNAMIC_CONFIG_KEYS.TIMEOUTS]: CONFIG.TIMEOUTS,
        [DYNAMIC_CONFIG_KEYS.THRESHOLDS]: CONFIG.METRICS.THRESHOLDS,
        [DYNAMIC_CONFIG_KEYS.RETRY]: CONFIG.RETRY,
        [DYNAMIC_CONFIG_KEYS.BATCH]: CONFIG.QUEUE,
        ...stored.dynamicConfig
      }));

      // Set up storage change listener
      browser.storage.onChanged.addListener((changes) => {
        if (changes.dynamicConfig) {
          this._updateDynamicConfig(changes.dynamicConfig.newValue);
        }
      });
    } catch (error) {
      this._logError(error, { 
        type: ERROR_CATEGORIES.CRITICAL.STATE,
        severity: ERROR_CATEGORIES.SEVERITY.HIGH,
        context: 'dynamic_config_init'
      });
    }
  }

  /**
   * Initialize configuration validators
   * @private
   */
  initializeValidators() {
    Object.entries(CONFIG_SCHEMAS).forEach(([key, schema]) => {
      this.configValidators.set(key, ajv.compile(schema));
    });
  }

  /**
   * Update dynamic configuration
   * @param {string} key - Configuration key
   * @param {any} value - New configuration value
   */
  async updateConfig(key, value) {
    try {
      this._validateConfig(key, value);
      if (!DYNAMIC_CONFIG_KEYS[key]) {
        throw new Error(`Invalid configuration key: ${key}`);
      }

      this.dynamicConfig.set(key, value);
      
      // Persist changes
      await browser.storage.local.set({
        dynamicConfig: Object.fromEntries(this.dynamicConfig)
      });

      // Log configuration change
      console.log(`Configuration updated - ${key}:`, value);
    } catch (error) {
      this._logError(error, {
        type: ERROR_CATEGORIES.CRITICAL.STATE,
        severity: ERROR_CATEGORIES.SEVERITY.MEDIUM,
        context: 'config_update'
      });
    }
  }

  /**
   * Enhanced error logging with context
   * @private
   */
  _logError(error, context = {}) {
    const errorCategory = this._categorizeError(error);
    const errorLog = {
      timestamp: Date.now(),
      message: error.message,
      stack: error.stack,
      category: errorCategory,
      severity: context.severity || ERROR_CATEGORIES.SEVERITY.MEDIUM,
      type: context.type || 'unknown',
      context: {
        ...context,
        connectionId: context.connectionId,
        retry: this.retryCount
      }
    };

    // Log based on severity
    if (errorLog.severity >= ERROR_CATEGORIES.SEVERITY.HIGH) {
      console.error('Critical error:', errorLog);
    } else {
      console.warn('Non-critical error:', errorLog);
    }

    // Store error metrics with categorization
    const errorKey = `${errorLog.category}_${errorLog.type}`;
    const currentErrors = this.metrics.errors.get(errorKey) || { count: 0, samples: [] };
    
    this.metrics.errors.set(errorKey, {
      count: currentErrors.count + 1,
      lastOccurrence: Date.now(),
      severity: Math.max(currentErrors.severity || 0, errorLog.severity),
      samples: [errorLog, ...currentErrors.samples].slice(0, 5)
    });

    return errorLog;
  }

  /**
   * Categorize error types
   * @private
   */
  _categorizeError(error) {
    if (error.name === 'TimeoutError' || error.message.includes('timeout')) {
      return ERROR_CATEGORIES.TRANSIENT.TIMEOUT;
    }
    if (error.message.includes('rate limit')) {
      return ERROR_CATEGORIES.TRANSIENT.RATE_LIMIT;
    }
    if (error.message.includes('permission')) {
      return ERROR_CATEGORIES.CRITICAL.PERMISSION;
    }
    if (error.message.includes('authentication') || error.message.includes('unauthorized')) {
      return ERROR_CATEGORIES.CRITICAL.AUTHENTICATION;
    }
    if (error.message.includes('API')) {
      return ERROR_CATEGORIES.CRITICAL.API;
    }
    if (error.name === 'QuotaExceededError' || error.message.includes('quota')) {
      return ERROR_CATEGORIES.CRITICAL.STORAGE;
    }
    if (error.name === 'ValidationError') {
      return ERROR_CATEGORIES.CRITICAL.VALIDATION;
    }
    if (error.message.includes('storage')) {
      return ERROR_CATEGORIES.CRITICAL.PERSISTENCE;
    }
    if (error.message.includes('format')) {
      return ERROR_CATEGORIES.CRITICAL.FORMAT;
    }

    return error.name === 'NetworkError' ? 
      ERROR_CATEGORIES.TRANSIENT.NETWORK : 
      ERROR_CATEGORIES.TRANSIENT.UNKNOWN;
  }

  /**
   * Metrics reporting setup
   * @private
   */
  _setupMetricsReporting() {
    setInterval(() => {
      this._reportMetrics();
    }, CONFIG.METRICS.REPORTING_INTERVAL);
  }

  /**
   * Aggregate and report metrics
   * @private
   */
  async _reportMetrics() {
    const now = Date.now();
    const report = {
      timestamp: now,
      period: now - this.metrics.lastReport,
      connections: {
        active: this.connections.size,
        total: this.metrics.connections.size
      },
      performance: Object.fromEntries(this.metrics.performance),
      errors: Object.fromEntries(this.metrics.errors),
      memory: process.memoryUsage()
    };

    try {
      // Log metrics
      console.log('Performance report:', report);

      // Store metrics in extension storage for debugging
      await this._storeMetrics(report);

      // Clean up old metrics
      this._cleanupMetrics();
      this.metrics.lastReport = now;
    } catch (error) {
      this._logError(error, { type: 'METRICS_REPORTING' });
    }
  }

  /**
   * Clean up old metrics data
   * @private
   */
  _cleanupMetrics() {
    const now = Date.now();
    const maxAge = CONFIG.METRICS.REPORTING_INTERVAL * 12; // Keep 1 hour of data

    // Clean up performance metrics
    for (const [key, data] of this.metrics.performance) {
      if (now - data.lastUpdated > maxAge) {
        this.metrics.performance.delete(key);
      }
    }

    // Clean up error metrics
    for (const [key, data] of this.metrics.errors) {
      if (now - data.lastOccurrence > maxAge) {
        this.metrics.errors.delete(key);
      }
    }
  }

  async connect() {
    const connectionId = crypto.randomUUID();
    const port = browser.runtime.connect({ name: 'tabActivity' });

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this._logError(new Error('Connection timeout'), {
          type: 'CONNECTION',
          connectionId
        });
        reject(new Error('Connection timeout'));
      }, CONFIG.TIMEOUTS.CONNECTION);

      port.onMessage.addListener((msg) => {
        if (msg.type === MESSAGE_TYPES.CONNECTION_ACK) {
          clearTimeout(timeoutId);
          const connection = { port, timestamp: Date.now() };
          this.connections.set(connectionId, connection);
          this.metrics.connections.set(connectionId, {
            established: Date.now(),
            messageCount: 0
          });
          resolve(connectionId);
        }
      });

      port.onDisconnect.addListener(() => {
        clearTimeout(timeoutId);
        this._handleDisconnect(connectionId);
        reject(new Error('Connection lost'));
      });
    });
  }

  /**
   * Implements exponential backoff with jitter for retries
   * @private
   */
  async _retryWithBackoff(operation) {
    const retryConfig = this.getConfig(DYNAMIC_CONFIG_KEYS.RETRY);
    let attempt = 0;
    
    while (attempt < retryConfig.MAX_ATTEMPTS) {
      try {
        return await operation();
      } catch (error) {
        if (attempt === retryConfig.MAX_ATTEMPTS - 1) {
          throw error;
        }
        
        const delay = retryConfig.DELAYS[attempt] * (0.8 + Math.random() * 0.4);
        await new Promise(resolve => setTimeout(resolve, delay));
        attempt++;
      }
    }
  }

  /**
   * Validates message structure and content
   * @private
   */
  _validateMessage(message) {
    if (!validateMessage(message)) {
      throw new Error(`Invalid message format: ${JSON.stringify(validateMessage.errors)}`);
    }
    return true;
  }

  async sendMessage(connectionId, message) {
    this._checkRateLimit('API_CALLS');
    this._validateMessage(message);
    return this._retryWithBackoff(() => this._sendMessage(connectionId, message));
  }

  disconnect(connectionId) {
    const connection = this.connections.get(connectionId);
    if (connection) {
      connection.port.disconnect();
      this.connections.delete(connectionId);
    }
  }

  /**
   * Monitors performance of async operations
   * @private
   */
  async _measurePerformance(operation, type) {
    const startTime = performance.now();
    try {
      return await operation();
    } finally {
      const duration = performance.now() - startTime;
      this._logPerformance(type, duration);
    }
  }

  /**
   * Logs performance metrics
   * @private
   */
  _logPerformance(type, duration) {
    const threshold = PERFORMANCE_THRESHOLDS[type] || 50;
    if (duration > threshold) {
      console.warn(`Performance warning: ${type} took ${duration.toFixed(2)}ms`);
      this.metrics.set(type, {
        count: (this.metrics.get(type)?.count || 0) + 1,
        avgDuration: (this.metrics.get(type)?.avgDuration || 0) * 0.9 + duration * 0.1
      });
    }
  }

  /**
   * Dedicated message handlers for different message types
   * @private
   */
  _messageHandlers = {
    [MESSAGE_TYPES.STATE_SYNC]: async (payload) => {
      return this._measurePerformance(
        async () => this.syncState(payload),
        'STATE_SYNC'
      );
    },

    [MESSAGE_TYPES.TAB_ACTION]: async (payload) => {
      return this._measurePerformance(
        async () => this._handleTabAction(payload),
        'TAB_ACTION'
      );
    },

    [MESSAGE_TYPES.TAG_ACTION]: async (payload) => {
      return this._measurePerformance(
        async () => this._handleTagAction(payload),
        'TAG_ACTION'
      );
    }
  };

  /**
   * Enhanced message handler with performance monitoring
   */
  async handleMessage(message, sender) {
    this._validateMessage(message);
    
    const handler = this._messageHandlers[message.type];
    if (!handler) {
      throw new Error(`Unhandled message type: ${message.type}`);
    }

    return this._measurePerformance(
      () => handler(message.payload, sender),
      'MESSAGE_PROCESSING'
    );
  }

  /**
   * Enhanced state synchronization with diff checking
   */
  async syncState() {
    const currentState = store.getState();
    const stateUpdates = this._getStateDiff(currentState);
    
    if (Object.keys(stateUpdates).length > 0) {
      await this.broadcastMessage({
        type: MESSAGE_TYPES.STATE_SYNC,
        payload: stateUpdates
      });
      this.lastStateSync = currentState;
    }
  }

  /**
   * Computes differential state updates
   * @private
   */
  _getStateDiff(currentState) {
    if (!this.lastStateSync) return currentState;

    const updates = {};
    for (const [key, value] of Object.entries(currentState)) {
      if (!deepEqual(value, this.lastStateSync[key])) {
        updates[key] = value;
      }
    }
    return updates;
  }

  /**
   * Broadcasts message to all active connections
   */
  async broadcastMessage(message) {
    this._validateMessage(message);
    const errors = [];

    for (const [id, connection] of this.connections) {
      try {
        await this._sendWithRetry(connection, message);
      } catch (error) {
        errors.push({ connectionId: id, error });
        this.connections.delete(id);
      }
    }

    if (errors.length > 0) {
      console.error('Broadcast errors:', errors);
      if (errors.length === this.connections.size) {
        throw new Error('Broadcast failed to all connections');
      }
    }
  }

  // Add alarm management methods
  async createAlarm(name, alarmInfo) {
    if (!browser.alarms) {
      throw new Error('Alarms API not available');
    }
    await browser.alarms.create(name, alarmInfo);
  }

  async onAlarm(callback) {
    if (!browser.alarms) {
      throw new Error('Alarms API not available');
    }
    browser.alarms.onAlarm.addListener(callback);
  }

  /**
   * Periodic cleanup of stale connections
   * @private
   */
  async _cleanupConnections() {
    const now = Date.now();
    if (now - this.lastCleanup < this.cleanupInterval) return;

    const staleConnections = [];
    for (const [id, connection] of this.connections) {
      if (now - connection.timestamp > this.cleanupInterval) {
        staleConnections.push(id);
      }
    }

    staleConnections.forEach(id => this.disconnect(id));
    this.lastCleanup = now;

    console.log(`Cleaned up ${staleConnections.length} stale connections`);
  }

  /**
   * Enhanced service worker registration with update handling
   */
  async registerServiceWorker(scriptURL, options = {}) {
    if (!('serviceWorker' in navigator)) {
      throw new Error('Service Worker API not available');
    }

    try {
      const registration = await navigator.serviceWorker.register(scriptURL, options);

      // Handle updates
      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed') {
            this.broadcastMessage({
              type: MESSAGE_TYPES.SERVICE_WORKER_UPDATE,
              payload: { updateAvailable: true }
            });
          }
        });
      });

      // Handle browser-specific quirks
      if (navigator.userAgent.includes('Safari')) {
        await this._handleSafariRegistration(registration);
      }

      return registration;
    } catch (error) {
      console.error('Service worker registration failed:', error);
      throw error;
    }
  }

  // Add comprehensive permission management
  async requestPermissions(permissions) {
    try {
      const result = await browser.permissions.request({
        permissions: Array.isArray(permissions) ? permissions : [permissions]
      });
      
      if (!result) {
        throw new Error(`Permission denied: ${permissions.join(', ')}`);
      }
      
      store.dispatch({
        type: 'PERMISSIONS_UPDATED',
        payload: { permissions, granted: true }
      });
      
      return result;
    } catch (error) {
      store.dispatch({
        type: 'PERMISSIONS_ERROR',
        payload: { permissions, error: error.message }
      });
      throw error;
    }
  }

  async removePermissions(permissions) {
    try {
      await browser.permissions.remove({
        permissions: Array.isArray(permissions) ? permissions : [permissions]
      });
      
      store.dispatch({
        type: 'PERMISSIONS_UPDATED',
        payload: { permissions, granted: false }
      });
    } catch (error) {
      console.error('Error removing permissions:', error);
      throw error;
    }
  }

  /**
   * Enhanced batch processing with performance monitoring
   */
  async processBatchMessages(messages, { 
    batchSize = CONFIG.QUEUE.BATCH_SIZE,
    onProgress
  } = {}) {
    return this._measurePerformance(
      async () => {
        const results = [];
        let processed = 0;
        
        for (let i = 0; i < messages.length; i += batchSize) {
          const batch = messages.slice(i, Math.min(i + batchSize, messages.length));
          const batchResults = await Promise.all(
            batch.map(msg => this._retryWithBackoff(() => this.sendMessage(undefined, msg)))
          );
          
          results.push(...batchResults);
          processed += batch.length;
          
          if (onProgress) {
            onProgress(processed / messages.length);
          }
        }
        
        return results;
      },
      'BATCH_PROCESSING'
    );
  }

  /**
   * Graceful shutdown implementation
   */
  async shutdown() {
    console.log('Initiating graceful shutdown...');
    
    try {
      // Stop metrics reporting
      clearInterval(this._metricsInterval);

      // Clean up all connections
      const disconnectPromises = Array.from(this.connections.entries())
        .map(async ([id, connection]) => {
          try {
            await this.disconnect(id);
          } catch (error) {
            this._logError(error, { type: 'SHUTDOWN', connectionId: id });
          }
        });

      await Promise.allSettled(disconnectPromises);

      // Clear internal state
      this.connections.clear();
      this.messageQueue = [];
      this.metrics = {
        errors: new Map(),
        performance: new Map(),
        connections: new Map(),
        lastReport: Date.now()
      };

      console.log('Graceful shutdown completed.');
    } catch (error) {
      this._logError(error, { type: 'SHUTDOWN' });
      throw error;
    }
  }

  /**
   * Get current configuration value
   * @param {string} key - Configuration key
   * @returns {any} Configuration value
   */
  getConfig(key) {
    return this.dynamicConfig.get(key) || CONFIG[key];
  }

  /**
   * Enhanced configuration validation
   * @private
   */
  _validateConfig(key, value) {
    const validator = this.configValidators.get(key);
    if (!validator) {
      throw new Error(`No validator found for config key: ${key}`);
    }

    if (!validator(value)) {
      throw new Error(`Invalid configuration: ${JSON.stringify(validator.errors)}`);
    }

    // Ensure no overlap with default CONFIG
    if (CONFIG[key] && deepEqual(CONFIG[key], value)) {
      throw new Error(`Configuration ${key} matches default, use default instead`);
    }

    return true;
  }

  /**
   * Rate limiting check
   * @private
   */
  _checkRateLimit(type) {
    const limits = CONFIG_SCHEMAS.RATE_LIMITS[type];
    if (!limits) return true;

    const now = Date.now();
    const calls = this.apiCalls.get(type) || [];
    
    // Clean up old entries
    const recentCalls = calls.filter(time => now - time < limits.WINDOW_MS);
    this.apiCalls.set(type, recentCalls);

    if (recentCalls.length >= limits.MAX_REQUESTS) {
      throw new Error(`Rate limit exceeded for ${type}`);
    }

    recentCalls.push(now);
    return true;
  }

  /**
   * Enhanced metrics storage with quota management
   * @private
   */
  async _storeMetrics(metrics) {
    const serialized = JSON.stringify(metrics);
    const size = new Blob([serialized]).size;

    if (this.metricsSize + size > this.storageQuota) {
      await this._pruneMetrics(size);
    }

    this.metricsSize += size;
    return browser.storage.local.set({
      [`metrics_${Date.now()}`]: metrics
    });
  }

  /**
   * Prune old metrics to free up space
   * @private
   */
  async _pruneMetrics(requiredSpace) {
    const allMetrics = await browser.storage.local.get(null);
    const metricEntries = Object.entries(allMetrics)
      .filter(([key]) => key.startsWith('metrics_'))
      .sort(([a], [b]) => parseInt(b.split('_')[1]) - parseInt(a.split('_')[1]));

    let freedSpace = 0;
    const keysToRemove = [];

    for (const [key, value] of metricEntries) {
      const size = new Blob([JSON.stringify(value)]).size;
      freedSpace += size;
      keysToRemove.push(key);
      this.metricsSize -= size;

      if (freedSpace >= requiredSpace) break;
    }

    await browser.storage.local.remove(keysToRemove);
  }

  /**
   * Enhanced shutdown with state persistence
   */
  async shutdown() {
    console.log('Initiating graceful shutdown...');
    
    try {
      // Stop all recurring tasks
      clearInterval(this._metricsInterval);
      clearInterval(this._cleanupInterval);

      // Save current state
      const shutdownState = {
        timestamp: Date.now(),
        connections: Array.from(this.connections.entries()),
        metrics: {
          performance: Array.from(this.metrics.performance.entries()),
          errors: Array.from(this.metrics.errors.entries())
        },
        dynamicConfig: Array.from(this.dynamicConfig.entries())
      };

      // Persist shutdown state
      await browser.storage.local.set({
        ['shutdown_state']: shutdownState
      });

      // Cleanup connections
      await Promise.allSettled(
        Array.from(this.connections.entries())
          .map(async ([id]) => this.disconnect(id))
      );

      // Clear internal state
      this._resetInternalState();

      console.log('Graceful shutdown completed.');
    } catch (error) {
      this._logError(error, { 
        type: 'SHUTDOWN',
        severity: ERROR_CATEGORIES.SEVERITY.CRITICAL
      });
      throw error;
    }
  }

  /**
   * Recover from unexpected shutdown
   */
  async recoverFromCrash() {
    try {
      const { shutdown_state } = await browser.storage.local.get('shutdown_state');
      
      if (shutdown_state) {
        // Restore dynamic configuration
        this.dynamicConfig = new Map(shutdown_state.dynamicConfig);
        
        // Restore metrics
        this.metrics.performance = new Map(shutdown_state.metrics.performance);
        this.metrics.errors = new Map(shutdown_state.metrics.errors);
        
        // Clean up old shutdown state
        await browser.storage.local.remove('shutdown_state');
        
        console.log('Recovered from previous shutdown');
      }
    } catch (error) {
      this._logError(error, {
        type: 'RECOVERY',
        severity: ERROR_CATEGORIES.SEVERITY.HIGH
      });
    }
  }

  /**
   * Initialize dynamic storage quota management
   * @private
   */
  async _initializeStorageQuota() {
    try {
      const { quota } = await navigator.storage.estimate();
      const availableQuota = Math.min(
        STORAGE_CONFIG.QUOTA.MAX_BYTES,
        Math.max(STORAGE_CONFIG.QUOTA.MIN_BYTES, quota * 0.1) // Use 10% of available quota
      );

      this.storageQuota = availableQuota;
      this._monitorStorageUsage();
    } catch (error) {
      this._logError(error, {
        type: 'STORAGE_QUOTA_INIT',
        severity: ERROR_CATEGORIES.SEVERITY.HIGH
      });
      this.storageQuota = STORAGE_CONFIG.QUOTA.DEFAULT_BYTES;
    }
  }

  /**
   * Enhanced performance tracking per operation type
   * @private
   */
  async _trackPerformance(operation, type, context = {}) {
    const start = performance.now();
    const metric = {
      type,
      context,
      timestamp: Date.now()
    };

    try {
      const result = await operation();
      metric.duration = performance.now() - start;
      metric.success = true;
      return result;
    } catch (error) {
      metric.duration = performance.now() - start;
      metric.success = false;
      metric.error = error.message;
      throw error;
    } finally {
      this._recordMetric(metric);
    }
  }

  /**
   * Record detailed performance metrics
   * @private
   */
  _recordMetric(metric) {
    const { type, context, duration, success } = metric;
    const existing = this.metrics.performance.get(type) || {
      count: 0,
      totalDuration: 0,
      failures: 0,
      samples: []
    };

    existing.count++;
    existing.totalDuration += duration;
    if (!success) existing.failures++;
    existing.samples.unshift(metric);
    existing.samples = existing.samples.slice(0, 10); // Keep last 10 samples

    this.metrics.performance.set(type, existing);

    // Send to telemetry if threshold exceeded
    if (duration > CONFIG.METRICS.THRESHOLDS[type]) {
      this._sendTelemetry({
        ...metric,
        avgDuration: existing.totalDuration / existing.count,
        failureRate: existing.failures / existing.count
      });
    }
  }

  /**
   * Send telemetry data to configured providers
   * @private
   */
  async _sendTelemetry(data) {
    try {
      const providers = await this._getEnabledTelemetryProviders();
      
      await Promise.allSettled(
        providers.map(provider => 
          this._sendToProvider(provider, {
            ...data,
            timestamp: Date.now(),
            extension: 'TabCurator',
            version: browser.runtime.getManifest().version
          })
        )
      );
    } catch (error) {
      console.warn('Telemetry delivery failed:', error);
    }
  }

  /**
   * Enhanced state synchronization with retries
   */
  async syncState() {
    const retryOptions = {
      maxAttempts: STORAGE_CONFIG.SYNC.MAX_RETRIES,
      backoff: STORAGE_CONFIG.SYNC.BACKOFF_MS
    };

    try {
      await this._trackPerformance(
        async () => {
          const currentState = store.getState();
          const stateUpdates = this._getStateDiff(currentState);
          
          if (Object.keys(stateUpdates).length > 0) {
            await this._retryWithBackoff(
              () => this.broadcastMessage({
                type: MESSAGE_TYPES.STATE_SYNC,
                payload: stateUpdates
              }),
              retryOptions
            );
            this.lastStateSync = currentState;
          }
        },
        'STATE_SYNC'
      );

      // Clear synced changes
      this.unsyncedChanges.clear();
    } catch (error) {
      // Store unsynced changes for retry
      this._storeUnsyncedChanges(stateUpdates);
      throw error;
    }
  }

  /**
   * Store unsynced changes for later retry
   * @private
   */
  _storeUnsyncedChanges(changes) {
    if (this.unsyncedChanges.size >= CONFIG.THRESHOLDS.SYNC_QUEUE) {
      this._sendTelemetry({
        type: 'SYNC_QUEUE_FULL',
        severity: TELEMETRY_CONFIG.LEVELS.WARN,
        count: this.unsyncedChanges.size
      });
      return;
    }

    const changeId = crypto.randomUUID();
    this.unsyncedChanges.set(changeId, {
      changes,
      timestamp: Date.now(),
      attempts: 0
    });
  }

  /**
   * Enhanced graceful shutdown with operation interruption
   */
  async shutdown() {
    console.log('Initiating graceful shutdown...');
    
    try {
      // Signal shutdown to prevent new operations
      this.isShuttingDown = true;

      // Interrupt long-running operations
      await this._interruptOperations();

      // Attempt to sync any pending changes
      await this._syncPendingChanges();

      // Clean up connections
      await this._cleanupConnections();
      this._resetState();

      console.log('Graceful shutdown completed');
    } catch (error) {
      this._logError(error, {
        type: 'SHUTDOWN',
        severity: ERROR_CATEGORIES.SEVERITY.CRITICAL
      });
      throw error;
    }
  }

  /**
   * Interrupt long-running operations
   * @private
   */
  async _interruptOperations() {
    const timeoutPromise = new Promise(resolve => setTimeout(resolve, 5000));
    
    const operations = Array.from(this.currentOperations).map(async (opId) => {
      try {
        const operation = this.currentOperations.get(opId);
        if (operation?.controller) {
          operation.controller.abort();
        }
      } catch (error) {
        console.warn(`Failed to interrupt operation ${opId}:`, error);
      }
    });

    await Promise.race([
      Promise.all(operations),
      timeoutPromise
    ]);
  }
}

// developer documentation
/**
 * @typedef {Object} ConnectionManagerOptions
 * @property {number} [storageQuota] - Custom storage quota in bytes
 * @property {Object} [telemetry] - Telemetry configuration
 * @property {string[]} [telemetry.providers] - Enabled telemetry providers
 * @property {number} [telemetry.sampleRate] - Telemetry sampling rate (0-1)
 * 
 * @example
 * // Initialize with custom options
 * const manager = new ConnectionManager({
 *   storageQuota: 10485760, // 10MB
 *   telemetry: {
 *     providers: ['sentry'],
 *     sampleRate: 0.1
 *   }
 * });
 * 
 * // Dynamic quota adjustment
 * await manager.updateStorageQuota(8388608); // 8MB
 * 
 * // Monitor performance
 * manager.on('performanceAlert', (metric) => {
 *   console.warn('Performance threshold exceeded:', metric);
 * });
 */

// Add shutdown handler to window events
if (typeof window !== 'undefined') {
  window.addEventListener('unload', () => {
    connection.shutdown().catch(console.error);
  });
}

// Add crash recovery to initialization
if (typeof window !== 'undefined') {
  window.addEventListener('load', () => {
    connection.recoverFromCrash().catch(console.error);
  });
}

// Create and export singleton instance
export const connection = new ConnectionManager();

// Export utility functions that use the singleton
export async function sendMessage(message) {
  return connection.sendMessage(undefined, message);
}

export async function initializeConnection(messageHandler) {
  await connection.connect();
  if (messageHandler) {
    connection.setMessageHandler(messageHandler);
  }
}

export async function validatePermissions(permissions) {
  try {
    const granted = await browser.permissions.contains({
      permissions: Array.isArray(permissions) ? permissions : [permissions]
    });
    
    if (!granted) {
      store.dispatch({
        type: 'PERMISSION_DENIED',
        payload: { permissions }
      });
    }
    
    return granted;
  } catch (error) {
    console.error('Permission validation error:', error);
    throw error;
  }
}

// Add additional utility exports
export const {
  createAlarm,
  onAlarm,
  registerServiceWorker,
  requestPermissions,
  removePermissions,
  processBatchMessages
} = connection;
