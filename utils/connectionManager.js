// utils/connectionManager.js
/**
 * @fileoverview Enhanced Connection Manager with performance monitoring,
 * dedicated message handlers, and improved service worker integration.
 * 
 * Key responsibilities:
 * - Message validation and routing
 * - Connection state management
 * - Batch processing
 * - Service worker registration
 */

import browser from 'webextension-polyfill';
import {
  MESSAGE_TYPES,
  CONFIG,
  ERROR_CATEGORIES,
  DYNAMIC_CONFIG_KEYS,
  CONFIG_SCHEMAS,
  TELEMETRY_CONFIG,
  STORAGE_CONFIG,
  TAB_OPERATIONS,
  TAG_OPERATIONS,
  TAB_STATES,
  VALIDATION_SCHEMAS
} from './constants.js';
import {
  getTab,
  updateTab,
  discardTab
} from './tabManager.js';
import deepEqual from 'fast-deep-equal';
import { logger } from './logger.js';
import stateManager from './stateManager.js'; // Ensure default import

// Add performance monitoring configuration
const PERFORMANCE_THRESHOLDS = {
  MESSAGE_PROCESSING: 50,
  STATE_SYNC: 100,
  BATCH_PROCESSING: 200
};

// Ensure RATE_LIMITS is defined
if (!CONFIG_SCHEMAS.RATE_LIMITS) {
  CONFIG_SCHEMAS.RATE_LIMITS = {
    API_CALLS: {
      WINDOW_MS: 60000,
      MAX_REQUESTS: 100
    }
  };
}

// Ensure METRICS config if not present
if (!CONFIG.METRICS) {
  CONFIG.METRICS = {
    REPORTING_INTERVAL: 300000 // 5 minutes
  };
}

class ConnectionManager {
  constructor() {
    this.initialized = false;
    this.connections = new Map();
    this.nextConnectionId = 1;
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

    this.dynamicConfig = new Map();
    this._initializeDynamicConfig();

    this._setupMetricsReporting();
    this.apiCalls = new Map();
    
    this.storageQuota = CONFIG.STORAGE.QUOTA.DEFAULT_BYTES;
    this.metricsSize = 0;

    this.telemetry = new Map();
    this.unsyncedChanges = new Map();
    this.currentOperations = new Map();
    
    this._initializeStorageQuota();

    this.connectionMetrics = {
      successful: 0,
      failed: 0,
      activeConnections: new Map(),
      latencyHistory: new Map(),
      lastCleanup: Date.now()
    };

    this.validationMetrics = {
      failures: new Map(),
      lastReset: Date.now()
    };

    this.isShuttingDown = false;

    this._metricsInterval = setInterval(() => this._reportMetrics(), CONFIG.METRICS.REPORTING_INTERVAL);
    this._cleanupInterval = setInterval(() => this._cleanupConnections(), this.cleanupInterval);

    this.buffer = new Map();
    this.flushThreshold = CONFIG.BATCH.FLUSH_SIZE;
    this.batchSize = CONFIG.BATCH.DEFAULT?.SIZE || 10;
    this.timeout = CONFIG.BATCH.DEFAULT?.TIMEOUT || 5000;

    this.samplingConfig = {
      operationCounts: new Map(),
      highFrequencyThreshold: CONFIG.THRESHOLDS.PERFORMANCE_WARNING,
      metricsWindow: CONFIG.METRICS.REPORTING_INTERVAL,
      sampleRate: 0.1
    };

    this.messageCallbacks = new Map(); // store callbacks by connectionId

    this.runtimeId = browser.runtime.id;
    
    this.connectionState = {
      isReady: false,
      backgroundInitialized: false,
      reconnectTimeout: null
    };

    this.stateManager = stateManager; // Use singleton instance
    this.logger = null;
  }

  async connect(options = {}) {
    try {
      // First check if background is initialized
      const response = await browser.runtime.sendMessage({
        type: MESSAGE_TYPES.INIT_CHECK
      });

      if (!response?.initialized) {
        throw new Error('Background service not initialized');
      }

      const connectionId = crypto.randomUUID();
      const port = browser.runtime.connect(undefined, {
        name: options.name || 'tabActivity'
      });

      if (!port) {
        throw new Error('Failed to create connection port');
      }

      this.connectionMetrics.activeConnections.set(connectionId, {
        established: Date.now(),
        port,
        messageCount: 0,
        lastActivity: Date.now()
      });

      this.connections.set(connectionId, port);

      return connectionId;
    } catch (error) {
      this.connectionMetrics.failed++;
      logger.error('Connection failed', { error: error.message });
      throw error;
    }
  }

  getPort(connectionId) {
    return this.connectionMetrics.activeConnections.get(connectionId)?.port;
  }

  async waitForBackground(timeout = 5000) {
    return new Promise((resolve, reject) => {
      const checkInterval = 100; // Check every 100ms
      const maxAttempts = timeout / checkInterval;
      let attempts = 0;

      const check = () => {
        attempts++;
        if (this.connectionState.backgroundInitialized) {
          resolve();
        } else if (attempts >= maxAttempts) {
          reject(new Error('Background initialization timeout'));
        } else {
          setTimeout(check, checkInterval);
        }
      };

      check();
    });
  }

  _scheduleReconnect(options) {
    // Prevent multiple reconnect attempts
    if (this.connectionState.reconnectTimeout) return;

    this.connectionState.reconnectTimeout = setTimeout(async () => {
      try {
        await this.connect(options);
        this.connectionState.reconnectTimeout = null;
      } catch (error) {
        logger.error('Reconnection failed:', { error: error.message });
      }
    }, 1000);
  }

  async _initializeDynamicConfig() {
    try {
      const stored = await browser.storage.local.get('dynamicConfig');
      this.dynamicConfig = new Map(Object.entries({
        [DYNAMIC_CONFIG_KEYS.TIMEOUTS]: CONFIG.TIMEOUTS,
        [DYNAMIC_CONFIG_KEYS.THRESHOLDS]: CONFIG.THRESHOLDS,
        [DYNAMIC_CONFIG_KEYS.RETRY]: CONFIG.RETRY,
        [DYNAMIC_CONFIG_KEYS.BATCH]: CONFIG.BATCH,
        ...(stored.dynamicConfig || {})
      }));

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

  async updateConfig(key, value) {
    try {
      this._validateConfig(key, value);
      if (!Object.values(DYNAMIC_CONFIG_KEYS).includes(key)) {
        throw new Error(`Invalid configuration key: ${key}`);
      }

      this.dynamicConfig.set(key, value);
      
      await browser.storage.local.set({
        dynamicConfig: Object.fromEntries(this.dynamicConfig)
      });

      console.log(`Configuration updated - ${key}:`, value);
    } catch (error) {
      this._logError(error, {
        type: ERROR_CATEGORIES.CRITICAL.STATE,
        severity: ERROR_CATEGORIES.SEVERITY.MEDIUM,
        context: 'config_update'
      });
    }
  }

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

    if (errorLog.severity >= ERROR_CATEGORIES.SEVERITY.HIGH) {
      console.error('Critical error:', errorLog);
      logger.error('Message validation failed', {
        type: 'MESSAGE_VALIDATION',
        severity: errorLog.severity,
        ...context
      });
    } else {
      console.warn('Non-critical error:', errorLog);
    }

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

  _categorizeError(error) {
    if (error.name === 'TimeoutError' || error.message.includes('timeout')) {
      return ERROR_CATEGORIES.TRANSIENT.TIMEOUT;
    }
    if (error.message.includes('rate limit')) {
      return ERROR_CATEGORIES.TRANSIENT.RATE_LIMIT;
    }
    if (error.message.includes('permission')) {
      // Permission errors handled by logger directly, no constants needed
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
      return ERROR_CATEGORIES.CRITICAL.STATE;
    }
    if (error.message.includes('format')) {
      return ERROR_CATEGORIES.CRITICAL.STATE;
    }
    return error.name === 'NetworkError' ? ERROR_CATEGORIES.TRANSIENT.CONNECTION : ERROR_CATEGORIES.TRANSIENT.UNKNOWN;
  }

  _setupMetricsReporting() {
    // Handled by constructor intervals
  }

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
      memory: typeof process !== 'undefined' && process.memoryUsage ? process.memoryUsage() : {}
    };

    try {
      console.log('Performance report:', report);
      await this._storeMetrics(report);
      this._cleanupMetrics();
      this.metrics.lastReport = now;
    } catch (error) {
      this._logError(error, { type: 'METRICS_REPORTING' });
    }
  }

  _cleanupMetrics() {
    const now = Date.now();
    const maxAge = CONFIG.METRICS.REPORTING_INTERVAL * 12;

    for (const [key, data] of this.metrics.performance) {
      if (now - (data.samples[0]?.timestamp || now) > maxAge) {
        this.metrics.performance.delete(key);
      }
    }

    for (const [key, data] of this.metrics.errors) {
      if (now - data.lastOccurrence > maxAge) {
        this.metrics.errors.delete(key);
      }
    }
  }

  async _retryWithBackoff(operation, options) {
    const retryConfig = this.getConfig(DYNAMIC_CONFIG_KEYS.RETRY);
    const maxAttempts = options?.maxAttempts || retryConfig.MAX_ATTEMPTS;
    const delays = retryConfig.DELAYS;
    let attempt = 0;
    
    while (attempt < maxAttempts) {
      try {
        return await operation();
      } catch (error) {
        if (attempt === maxAttempts - 1) {
          throw error;
        }
        const delay = delays[Math.min(attempt, delays.length - 1)] * (0.8 + Math.random() * 0.4);
        await new Promise(resolve => setTimeout(resolve, delay));
        attempt++;
      }
    }
  }

  async validateMessage(message) {
    const startTime = performance.now();
    try {
      await VALIDATION_SCHEMAS.message.validate(message, { 
        abortEarly: false,
        strict: true,
        messages: {
          required: ({ path }) => `${path} is required`,
          notType: ({ path, type }) => `${path} must be of type ${type}`,
          noUnknown: 'Message contains unknown properties',
          strict: 'Message structure is invalid'
        }
      });
      return true;
    } catch (error) {
      const validationErrors = error.inner.length ? 
        error.inner.map(err => err.message) :
        [error.message];

      const errorContext = {
        type: 'MESSAGE_VALIDATION',
        messageType: message?.type,
        errors: validationErrors,
        severity: ERROR_CATEGORIES.SEVERITY.HIGH
      };
      
      logger.error('Message validation failed', errorContext);

      throw new Error(validationErrors.join('; '));
    } finally {
      const duration = performance.now() - startTime;
      logger.logPerformance('messageValidation', duration, {
        messageType: message?.type,
        validationTime: duration
      });
    }
  }

  async sendMessage(connectionId, message) {
    this._checkRateLimit('API_CALLS');
    await this.validateMessage(message);
    return this._retryWithBackoff(() => this._sendMessage(connectionId, message));
  }

  async disconnect(connectionId) {
    const startTime = performance.now();
    const connection = this.connectionMetrics.activeConnections.get(connectionId);
    
    if (connection) {
      try {
        connection.port.disconnect();
        this.connectionMetrics.activeConnections.delete(connectionId);
        this.connections.delete(connectionId);
        
        const duration = performance.now() - startTime;
        logger.logPerformance('connectionTerminate', duration, {
          connectionId,
          lifetime: Date.now() - connection.established
        });
      } catch (error) {
        logger.error('Disconnect error', {
          connectionId,
          error: error.message,
          type: 'DISCONNECT_ERROR'
        });
        throw error;
      }
    }
  }

  _handleDisconnect(connectionId) {
    const connection = this.connectionMetrics.activeConnections.get(connectionId);
    if (connection) {
      const duration = Date.now() - connection.established;
      logger.info('Connection disconnected', {
        connectionId,
        duration,
        messageCount: connection.messageCount
      });
      this.connectionMetrics.activeConnections.delete(connectionId);
      this.connections.delete(connectionId);
    }
  }

  async _measurePerformance(operation, type) {
    const startTime = performance.now();
    try {
      return await operation();
    } finally {
      const duration = performance.now() - startTime;
      this._logPerformance(type, duration);
    }
  }

  _logPerformance(type, duration) {
    const threshold = PERFORMANCE_THRESHOLDS[type] || 50;
    if (duration > threshold) {
      console.warn(`Performance warning: ${type} took ${duration.toFixed(2)}ms`);
      const existing = this.metrics.performance.get(type) || { count: 0, totalDuration: 0, failures: 0, samples: [] };
      existing.count++;
      existing.totalDuration += duration;
      existing.samples.unshift({
        type,
        duration,
        timestamp: Date.now(),
        success: true
      });
      existing.samples = existing.samples.slice(0, 10);
      this.metrics.performance.set(type, existing);
    }
  }

  _messageHandlers = {
    [MESSAGE_TYPES.STATE_SYNC]: async (payload) => {
      await this.syncState();
      return { success: true };
    },
    [MESSAGE_TYPES.TAB_ACTION]: async (payload) => {
      const response = await this._handleTabAction(payload);
      return response;
    },
    [MESSAGE_TYPES.TAG_ACTION]: async (payload) => {
      const response = await this._handleTagAction(payload);
      return response;
    },
    [MESSAGE_TYPES.SESSION_ACTION]: async (payload) => {
      const response = await this.stateManager.handleSessionAction(payload);
      return response;
    },
    [MESSAGE_TYPES.GET_SESSIONS]: async () => {
      const state = this.stateManager.getState();
      return { sessions: state.sessions || [] };
    }
  };

  // Add the onMessage method
  onMessage(connectionId, callback) {
    this.messageCallbacks.set(connectionId, callback);
  }

  // Update the handleMessage method to invoke callbacks
  async handleMessage(message, senderPort) {
    await this.validateMessage(message);
    
    const handler = this._messageHandlers[message.type];
    if (!handler) {
      // Return a standardized error response for unhandled message types
      return { error: `Unhandled message type: ${message.type}` };
    }

    try {
      // Execute handler to get result
      const result = await this._measurePerformance(
        () => handler(message.payload, senderPort),
        'MESSAGE_PROCESSING'
      );

      // Ensure the handler returns a response object
      if (typeof result !== 'object' || result === null) {
        return { error: 'Handler did not return a valid response object' };
      }

      // Then invoke any registered callbacks
      const connectionId = this._findConnectionIdByPort(senderPort);
      const callback = this.messageCallbacks.get(connectionId);
      if (callback) {
        callback(message);
      }

      return result;
    } catch (error) {
      // Return error in a standardized response object
      return { error: error.message || 'An unknown error occurred' };
    }
  }

  _findConnectionIdByPort(port) {
    for (const [id, info] of this.connectionMetrics.activeConnections) {
      if (info.port === port) {
        return id; // Return the connection ID if port matches
      }
    }
    return null;
  }

  async syncState() {
    const retryOptions = {
      maxAttempts: STORAGE_CONFIG.SYNC.MAX_RETRIES,
      backoff: STORAGE_CONFIG.SYNC.BACKOFF_MS
    };
    let stateUpdates;
    
    try {
      await this._trackPerformance(
        async () => {
          const currentState = this.stateManager.store.getState();
          stateUpdates = this._getStateDiff(currentState);
          
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

      this.unsyncedChanges.clear();
    } catch (error) {
      this._storeUnsyncedChanges(stateUpdates);
      throw error;
    }
  }

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

  async broadcastMessage(message) {
    await this.validateMessage(message);
    const errors = [];

    for (const [id, connectionPort] of this.connections) {
      try {
        await this._sendWithRetry(connectionPort, message);
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

  async _cleanupConnections() {
    const now = Date.now();
    if (now - this.connectionMetrics.lastCleanup < CONFIG.TIMEOUTS.CLEANUP) {
      return;
    }

    const staleConnections = [];
    for (const [id, connection] of this.connectionMetrics.activeConnections) {
      if (now - connection.lastActivity > CONFIG.TIMEOUTS.CONNECTION) {
        staleConnections.push(id);
      }
    }

    if (staleConnections.length > 0) {
      logger.warn('Cleaning up stale connections', {
        count: staleConnections.length,
        totalActive: this.connectionMetrics.activeConnections.size
      });

      await Promise.all(
        staleConnections.map(id => this.disconnect(id))
      );
    }

    this.connectionMetrics.lastCleanup = now;
  }

  async registerServiceWorker(scriptURL, options = {}) {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
      throw new Error('Service Worker API not available');
    }

    try {
      const registration = await navigator.serviceWorker.register(scriptURL, options);

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

      if (navigator.userAgent.includes('Safari')) {
        await this._handleSafariRegistration(registration);
      }

      return registration;
    } catch (error) {
      console.error('Service worker registration failed:', error);
      throw error;
    }
  }

  async processBatchMessages(messages, { 
    batchSize = CONFIG.BATCH.DEFAULT_SIZE,
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

  async shutdown() {
    console.log('Initiating graceful shutdown...');
    try {
      this.isShuttingDown = true;

      // Stop all recurring tasks
      clearInterval(this._metricsInterval);
      clearInterval(this._cleanupInterval);

      // Interrupt ongoing operations
      await this._interruptOperations();

      // Attempt to sync pending changes
      await this._syncPendingChanges();

      // Cleanup connections
      await Promise.allSettled(
        Array.from(this.connections.keys()).map(id => this.disconnect(id))
      );

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

      await browser.storage.local.set({ ['shutdown_state']: shutdownState });

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

  async recoverFromCrash() {
    try {
      const { shutdown_state } = await browser.storage.local.get('shutdown_state');
      
      if (shutdown_state) {
        this.dynamicConfig = new Map(shutdown_state.dynamicConfig);
        this.metrics.performance = new Map(shutdown_state.metrics.performance);
        this.metrics.errors = new Map(shutdown_state.metrics.errors);
        
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

  async _initializeStorageQuota() {
    try {
      // Add check for test environment
      if (process.env.NODE_ENV === 'test') {
        this.storageQuota = CONFIG.STORAGE.QUOTA.DEFAULT_BYTES;
        return;
      }

      let quota = CONFIG.STORAGE.QUOTA.DEFAULT_BYTES;
      // Only try to get estimate if navigator.storage exists
      if (typeof navigator !== 'undefined' && navigator.storage?.estimate) {
        const estimate = await navigator.storage.estimate();
        quota = Math.min(
          CONFIG.STORAGE.QUOTA.MAX_BYTES,
          Math.max(CONFIG.STORAGE.QUOTA.MIN_BYTES, estimate.quota * 0.1)
        );
      }
      
      this.storageQuota = quota;
      await this._monitorStorageUsage();
    } catch (error) {
      this._logError(error, {
        type: "STORAGE_QUOTA_INIT",
        severity: ERROR_CATEGORIES.SEVERITY.HIGH
      });
      this.storageQuota = CONFIG.STORAGE.QUOTA.DEFAULT_BYTES;
    }
  }

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

  _recordMetric(metric) {
    const { type, duration, success } = metric;
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
    existing.samples = existing.samples.slice(0, 10);
    this.metrics.performance.set(type, existing);

    if (duration > CONFIG.THRESHOLDS[type]) {
      this._sendTelemetry({
        ...metric,
        avgDuration: existing.totalDuration / existing.count,
        failureRate: existing.failures / existing.count
      });
    }
  }

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

  async _storeUnsyncedChanges(changes) {
    if (this.unsyncedChanges.size >= CONFIG.THRESHOLDS.SYNC_QUEUE) {
      this._sendTelemetry({
        type: 'SYNC_QUEUE_FULL',
        severity: TELEMETRY_CONFIG.SEVERITY || 2,
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

  async _interruptOperations() {
    const timeoutPromise = new Promise(resolve => setTimeout(resolve, 5000));
    const operations = Array.from(this.currentOperations.keys()).map(async (opId) => {
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

  getConnectionMetrics() {
    const now = Date.now();
    const activeConnections = this.connectionMetrics.activeConnections.size;
    const totalConnections = this.connectionMetrics.successful + this.connectionMetrics.failed;
    
    return {
      successful: this.connectionMetrics.successful,
      failed: this.connectionMetrics.failed,
      activeConnections,
      successRate: totalConnections ? 
        (this.connectionMetrics.successful / totalConnections) * 100 : 0,
      validationFailures: Object.fromEntries(this.validationMetrics.failures),
      timestamp: now
    };
  }

  __testing__ = {
    validateMessage: async (message) => {
      try {
        await this.validateMessage(message);
        return true;
      } catch (error) {
        return { valid: false, error: error.message };
      }
    },

    getMetrics: () => ({
      connections: this.getConnectionMetrics(),
      validation: {
        failures: Object.fromEntries(this.validationMetrics.failures),
        lastReset: this.validationMetrics.lastReset
      }
    }),

    simulateLoad: async (connectionCount, messageRate) => {
      const results = [];
      for (let i = 0; i < connectionCount; i++) {
        try {
          const connectionId = await this.connect();
          results.push({ connectionId, success: true });
        } catch (error) {
          results.push({ error: error.message, success: false });
        }
      }
      return results;
    }
  };

  getConfig(key) {
    return this.dynamicConfig.get(key) || CONFIG[key];
  }

  _validateConfig(key, value) {
    try {
      VALIDATION_SCHEMAS.config.validateSync({ [key]: value });
      
      if (CONFIG[key] && deepEqual(CONFIG[key], value)) {
        throw new Error(`Configuration ${key} matches default, use default instead`);
      }
      
      return true;
    } catch (error) {
      throw new Error(`Invalid configuration: ${error.message}`);
    }
  }

  _checkRateLimit(type) {
    const limits = (CONFIG_SCHEMAS.RATE_LIMITS && CONFIG_SCHEMAS.RATE_LIMITS[type]) || null;
    if (!limits) return true;

    const now = Date.now();
    const calls = this.apiCalls.get(type) || [];
    const recentCalls = calls.filter(time => now - time < limits.WINDOW_MS);
    this.apiCalls.set(type, recentCalls);

    if (recentCalls.length >= limits.MAX_REQUESTS) {
      throw new Error(`Rate limit exceeded for ${type}`);
    }

    recentCalls.push(now);
    return true;
  }

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

  async _syncPendingChanges() {
    for (const [id, record] of this.unsyncedChanges) {
      try {
        await this.broadcastMessage({
          type: MESSAGE_TYPES.STATE_SYNC,
          payload: record.changes
        });
        this.unsyncedChanges.delete(id);
      } catch (error) {
        record.attempts++;
        if (record.attempts >= STORAGE_CONFIG.SYNC.MAX_RETRIES) {
          logger.error('Failed to sync changes after max retries', { id, error: error.message });
          this.unsyncedChanges.delete(id);
        } else {
          this.unsyncedChanges.set(id, record);
        }
      }
    }
  }

  _resetInternalState() {
    this.connections.clear();
    this.messageQueue = [];
    this.metrics = {
      errors: new Map(),
      performance: new Map(),
      connections: new Map(),
      lastReport: Date.now()
    };
    this.unsyncedChanges.clear();
    this.currentOperations.clear();
  }

  async _monitorStorageUsage() {
    try {
      const estimate = await navigator.storage.estimate();
      const used = estimate.usage || 0;
      const ratio = used / this.storageQuota;
      if (ratio > CONFIG.THRESHOLDS.STORAGE_WARNING) {
        logger.warn('Storage usage exceeds warning threshold', {
          used,
          quota: this.storageQuota,
          ratio
        });
      }
    } catch (error) {
      logger.error('Error monitoring storage usage', { error: error.message });
    }
  }

  async _getEnabledTelemetryProviders() {
    // No providers implemented, return empty array
    return [];
  }

  async _sendToProvider(provider, data) {
    logger.info('Sending telemetry to provider', { provider, data });
  }

  async _sendMessage(connectionId, message) {
    if (!connectionId) {
      return;
    }

    const port = this.connectionMetrics.activeConnections.get(connectionId)?.port;
    if (!port) {
      throw new Error('Connection not found');
    }

    port.postMessage(message);
  }

  async _sendWithRetry(connectionPort, message) {
    return this._retryWithBackoff(async () => {
      connectionPort.postMessage(message);
    });
  }

  async _handleTabAction(payload) {
    if (!payload || !payload.action || !payload.tabId) {
      return { error: 'Invalid payload for TAB_ACTION' };
    }

    const { action, tabId } = payload;
    switch (action) {
      case TAB_OPERATIONS.DISCARD:
        await discardTab(tabId);
        return { success: true };
      case TAB_OPERATIONS.UPDATE:
        if (payload.updates) {
          await updateTab(tabId, payload.updates);
          return { success: true };
        }
        return { error: 'No updates provided' };
      case TAB_OPERATIONS.ARCHIVE:
        await updateTab(tabId, { state: TAB_STATES.ARCHIVED });
        return { success: true };
      case TAB_OPERATIONS.TAG_AND_CLOSE:
        if (payload.tag) {
          const tab = await getTab(tabId);
          const updatedTags = [...(tab.tags || []), payload.tag];
          await updateTab(tabId, { tags: updatedTags, state: TAB_STATES.ARCHIVED });
          await browser.tabs.remove(tabId);
          return { success: true };
        }
        return { error: 'No tag provided' };
      case TAB_OPERATIONS.GET_OLDEST:
        const state = this.stateManager.getState();
        return { tab: state.tabManagement?.oldestTab || null };
      default:
        return { error: `Unhandled TAB_ACTION: ${action}` };
    }
  }

  async _handleTagAction(payload) {
    if (!payload || !payload.operation || !payload.tabId || !payload.tag) {
      return { error: 'Invalid payload for TAG_ACTION' };
    }

    const { operation, tabId, tag } = payload;
    const tab = await getTab(tabId);
    if (!tab) {
      return { error: `Tab with ID ${tabId} not found` };
    }

    const currentTags = tab.tags || [];

    switch (operation) {
      case TAG_OPERATIONS.ADD:
        if (!currentTags.includes(tag)) {
          await updateTab(tabId, { tags: [...currentTags, tag] });
          return { success: true };
        }
        return { error: 'Tag already exists' };
      case TAG_OPERATIONS.REMOVE:
        await updateTab(tabId, { tags: currentTags.filter(t => t !== tag) });
        return { success: true };
      case TAG_OPERATIONS.UPDATE:
        if (currentTags.length > 0) {
          await updateTab(tabId, { tags: [tag, ...currentTags.slice(1)] });
          return { success: true };
        } else {
          await updateTab(tabId, { tags: [tag] });
          return { success: true };
        }
      default:
        return { error: `Unhandled TAG_ACTION: ${operation}` };
    }
  }

  async _handleTabActivity(tabId, timestamp) {
    if (!tabId) {
      const activeTab = await browser.tabs.query({ active: true, currentWindow: true });
      if (activeTab.length > 0) {
        tabId = activeTab[0].id;
      }
    }
    
    if (tabId) {
      await this.stateManager.dispatch(
        actions.tabManagement.updateTab({
          id: tabId,
          lastAccessed: timestamp || Date.now()
        })
      );
      return { success: true };
    }
    return { error: 'No active tab found' };
  }

  async _handleSafariRegistration(registration) {
    logger.info('Handling Safari registration quirks');
    await registration.update();
  }

  setMessageHandler(messageHandler) {
    this._externalMessageHandler = messageHandler;
  }

  /**
   * Handles a new port connection.
   * @param {Object} port - The connected port.
   * @returns {string} connId - A unique connection ID.
   */
  handlePort(port) {
    const connId = `conn-${this.nextConnectionId++}`;
    this.connections.set(connId, port);

    port.onDisconnect.addListener(() => {
      this.handleDisconnect(connId);
    });

    port.onMessage.addListener(async (message) => {
      try {
        const response = await this.handleMessage(message, port);
        port.postMessage(response);
      } catch (error) {
        logger.error('Handle Message Error:', { error: error.message });
        port.postMessage({ error: error.message });
      }
    });

    return connId;
  }

  /**
   * Handles the disconnection of a port.
   * @param {string} connId - The connection ID of the disconnected port.
   */
  handleDisconnect(connId) {
    this.connections.delete(connId);
    logger.info('Connection disconnected', { connectionId: connId });
    this.messageCallbacks.delete(connId);
  }

  /**
   * Public method to clean up stale connections.
   */
  async cleanupConnections() {
    return this._cleanupConnections();
  }

  handleDisconnect(connectionId) {
    return this._handleDisconnect(connectionId);
  }

  async initialize(stateManagerInstance) {
    if (this.initialized) return true;

    if (!stateManagerInstance?.store || !stateManagerInstance.initialized) {
      throw new Error('Valid initialized StateManager instance required');
    }

    this.stateManager = stateManagerInstance;
    this.connectionState.isReady = true;
    this.connectionState.backgroundInitialized = true;
    
    // Store instance reference for access by message handlers
    this.initialized = true;
    logger.info('Connection manager initialized', { initialized: true });
    
    return true;
  }

  async handleMessage(message, sender, stateManagerInstance = this.stateManager) {
    if (!this.initialized || !stateManagerInstance?.initialized) {
      return { error: 'ConnectionManager or StateManager not initialized' };
    }

    if (!this.stateManager) {
      throw new Error('StateManager not initialized');
    }

    switch (message.type) {
      case MESSAGE_TYPES.GET_SESSIONS:
        try {
          const state = this.stateManager.getState();
          const sessions = state.sessions || [];
          return { sessions };
        } catch (error) {
          return { error: error.message };
        }

      case MESSAGE_TYPES.SESSION_ACTION:
        try {
          const result = await this.stateManager.handleSessionAction(message.payload);
          return result;
        } catch (error) {
          return { error: error.message };
        }

      default:
        return { error: `Unhandled message type: ${message.type}` };
    }
  }

  handlePortConnection(port) {
    if (!port) return;

    connection.handlePort(port); // Assuming `connection` is part of this class or imported

    port.onMessage.addListener(async (message) => {
      try {
        if (message.type === this.messageTypes.SESSION_ACTION) {
          this.stateManager.logger.debug(`Handling SESSION_ACTION: ${message.action}`, { payload: message.payload });
          const response = await this.stateManager.tabManager[message.action]?.(message.payload);
          this.stateManager.logger.debug('Response from TabManager:', { response });
          port.postMessage({
            type: message.type,
            action: message.action,
            payload: {
              sessions: response
            }
          });
        } else {
          const response = await this.stateManager.tabManager[message.action]?.(message.payload);
          if (response) {
            port.postMessage({
              type: message.type,
              action: message.action,
              payload: response
            });
          }
        }
      } catch (error) {
        this.stateManager.logger.error('Message handling error:', error);
        port.postMessage({ 
          type: this.messageTypes.ERROR,
          error: error.message 
        });
      }
    });

    port.onDisconnect.addListener(() => {
      connection.handleDisconnect(connId); // Ensure `connection` and `connId` are properly managed
    });
  }

  handleTabUpdate(tabId, changeInfo, tab) {
    this.stateManager.tabManager.handleTabUpdate(tabId, changeInfo, tab);
  }

  handleTabRemove(tabId, removeInfo) {
    this.stateManager.tabManager.handleTabRemove(tabId, removeInfo);
  }

  async performPeriodicTasks() {
    await Promise.all([
      this.stateManager.tabManager.cleanupInactiveTabs(),
      this.stateManager.tabManager.enforceTabLimits(),
      this.cleanupConnections()
    ]);
  }

  async cleanupConnections() {
    await connection.cleanupConnections(); // Ensure `connection` is properly referenced
  }
}

// Create and export singleton instance
export const connection = new ConnectionManager();

// Export additional utilities as needed
export async function sendMessage(message) {
  return connection.sendMessage(message);
}

export async function initializeConnection(messageHandler) {
  return connection.initializeConnection(messageHandler);
}

export async function createAlarm(name, alarmInfo) {
  if (!browser.alarms) {
    throw new Error('Alarms API not available');
  }
  await browser.alarms.create(name, alarmInfo);
}

export async function onAlarm(callback) {
  if (!browser.alarms) {
    throw new Error('Alarms API not available');
  }
  browser.alarms.onAlarm.addListener(callback);
}

export async function processBatchMessages(messages, { 
  batchSize = CONFIG.BATCH.DEFAULT_SIZE,
  onProgress
} = {}) {
  return connection.processBatchMessages(messages, { batchSize, onProgress });
}

export async function registerServiceWorker(scriptURL, options = {}) {
  return connection.registerServiceWorker(scriptURL, options);
}

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => {
    connection.shutdown().catch(console.error);
  });
  
  window.addEventListener('load', () => {
    connection.recoverFromCrash().catch(console.error);
  });
}

