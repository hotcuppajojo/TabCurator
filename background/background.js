/**
 * background/background.js
 * @fileoverview Background Service Worker - Core Extension Coordinator
 * @version 0.8.5
 * @date 2024-12-15
 * @author JoJo Petersky
 * 
 * Architecture Overview:
 * - Handles UI interactions and tab lifecycle management
 * - Coordinates state synchronization between modules
 * - Manages telemetry aggregation and reporting
 * - Provides rule validation and execution
 * 
 * Cross-Module Interactions:
 * - tabManager.js: Tab lifecycle and operations
 * - connectionManager.js: Message routing and connection state
 * - stateManager.js: Redux store and state persistence
 * - constants.js: Shared configuration and types
 * 
 * State Synchronization Flow:
 * 1. UI action triggers state update
 * 2. Update validated by background.js
 * 3. State change processed by stateManager
 * 4. Changes broadcasted to all connections
 * 
 * Telemetry Aggregation:
 * - Events buffered using telemetryAggregator
 * - Periodic flushing to reduce storage operations
 * - Performance metrics tracked against thresholds
 * 
 * Error Handling Strategy:
 * - Critical errors trigger emergency backup
 * - Non-critical errors logged with context
 * - Automatic retry for transient failures
 * 
 * @changelog
 * 0.8.5 (2024-12-15):
 * - Added telemetry aggregation with buffering
 * - Enhanced graceful shutdown with recovery
 * - Improved cross-module state synchronization
 */

import browser from 'webextension-polyfill';
import deepEqual from 'fast-deep-equal';
import {
  store,
  actions,
  validateStateUpdate
} from '../utils/stateManager.js';
import {
  getTab,
  updateTab,
  discardTab,
  validateTab,
  addTagToTab,
  removeTagFromTab,
  getTagsForTab,
  processBatchOperations,
  TabLifecycle
} from '../utils/tabManager.js';
import {
  connection,
  validateMessage,
  checkPermissions,
  requestPermissions,
  removePermissions
} from '../utils/connectionManager.js';
import {
  MESSAGE_TYPES,
  ERROR_TYPES,
  TAB_STATES,
  CONFIG,
  VALIDATION_TYPES,
  PERMISSION_TYPES,
  TAG_VALIDATION,
  TELEMETRY_CONFIG,
  ERROR_CATEGORIES,
  STORAGE_CONFIG
} from '../utils/constants.js';

// Initialize connection manager
let isInitialized = false;
let metricsInterval;
let shutdownTimer;

// ========================================
// Type Definitions
// ========================================

/**
 * @typedef {Object} Rule
 * @property {string} id - Unique identifier for the rule
 * @property {string} condition - URL pattern or condition to match
 * @property {string} action - Action to perform when condition matches
 * @property {Object} [payload] - Additional data for the action
 * @property {string[]} [domains] - Optional domain restrictions
 */

/**
 * @typedef {Object} TelemetryEvent
 * @property {number} count - Number of occurrences
 * @property {number} sum - Sum of all event durations
 * @property {number} min - Minimum duration
 * @property {number} max - Maximum duration
 * @property {Array<Object>} samples - Sample events for debugging
 */

/**
 * @typedef {Object} ShutdownStep
 * @property {string} name - Name of the shutdown step
 * @property {function(): Promise<void>} action - Async function to execute
 * @property {boolean} [critical=false] - Whether step failure should halt shutdown
 */

// ========================================
// Configuration and Utilities
// ========================================

const { TIMEOUTS, THRESHOLDS, BATCH, STORAGE, TELEMETRY } = CONFIG;

/**
 * Rule validator with detailed validation rules
 * @typedef {Object} RuleValidator
 * @property {function(Rule): boolean} validateRule - Validates single rule structure and content
 * @property {function(Rule[]): boolean} validateRuleSet - Validates a set of rules for consistency
 * @throws {Error} When validation fails with specific reason
 * 
 * @example
 * try {
 *   await ruleValidator.validateRule({
 *     id: 'rule1',
 *     condition: 'https://*.example.com/*',
 *     action: 'suspend'
 *   });
 * } catch (error) {
 *   console.error('Rule validation failed:', error);
 * }
 */
const ruleValidator = {
  validateRule: (rule) => {
    try {
      if (!rule?.condition || !rule?.action) {
        throw new Error('Invalid rule format');
      }
      logger.debug('Rule validated successfully', { ruleId: rule.id });
      return true;
    } catch (error) {
      logger.error('Rule validation failed', { 
        rule,
        error: error.message 
      });
      throw error;
    }
  },
  
  validateRuleSet: (rules) => {
    return rules.every(rule => {
      try {
        return ruleValidator.validateRule(rule);
      } catch (error) {
        console.error(`Invalid rule:`, error);
        return false;
      }
    });
  }
};

/**
 * Telemetry configuration manager
 * @typedef {Object} TelemetryConfig
 * @property {Object} thresholds - Performance thresholds by operation type
 * @property {function(Object): Promise<void>} updateThresholds - Updates thresholds dynamically
 * 
 * @example
 * await telemetryConfig.updateThresholds({
 *   messageProcessing: 100,  // 100ms threshold
 *   stateSync: 200          // 200ms threshold
 * });
 */
const telemetryConfig = {
  thresholds: { ...TELEMETRY_CONFIG.THRESHOLDS },
  
  updateThresholds: async (newThresholds) => {
    Object.assign(telemetryConfig.thresholds, newThresholds);
    await browser.storage.local.set({ 
      telemetryThresholds: telemetryConfig.thresholds 
    });
  }
};

/**
 * Analytics engine for dynamic telemetry adjustments
 */
const telemetryAnalyzer = {
  historicalData: new Map(),
  analysisWindow: 3600000, // 1 hour
  minSampleSize: 100,
  updateInterval: 300000, // 5 minutes
  
  addSample(category, duration) {
    const data = this.historicalData.get(category) || {
      samples: [],
      lastUpdate: 0,
      thresholdUpdates: []
    };
    
    data.samples.push({
      duration,
      timestamp: Date.now()
    });
    
    this.historicalData.set(category, data);
    this._pruneOldSamples(category);
  },

  _pruneOldSamples(category) {
    const data = this.historicalData.get(category);
    if (!data) return;

    const cutoff = Date.now() - this.analysisWindow;
    data.samples = data.samples.filter(sample => sample.timestamp > cutoff);
  },

  analyzePerformance(category) {
    const data = this.historicalData.get(category);
    if (!data || data.samples.length < this.minSampleSize) return null;

    const durations = data.samples.map(s => s.duration);
    const mean = durations.reduce((a, b) => a + b, 0) / durations.length;
    const stdDev = Math.sqrt(
      durations.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / durations.length
    );

    return {
      mean,
      stdDev,
      p95: this._calculatePercentile(durations, 0.95),
      sampleSize: durations.length
    };
  },

  _calculatePercentile(values, p) {
    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.ceil(sorted.length * p) - 1;
    return sorted[index];
  },

  suggestThreshold(category) {
    const stats = this.analyzePerformance(category);
    if (!stats) return null;

    // Use p95 + 2 standard deviations for dynamic threshold
    const suggestedThreshold = Math.ceil(stats.p95 + (2 * stats.stdDev));
    
    // Ensure threshold is within reasonable bounds
    const currentThreshold = telemetryConfig.thresholds[category] || CONFIG.THRESHOLDS[category];
    const minThreshold = Math.floor(currentThreshold * 0.5);
    const maxThreshold = Math.ceil(currentThreshold * 2);
    
    return Math.min(Math.max(suggestedThreshold, minThreshold), maxThreshold);
  }
};

// ========================================
// Rule Management
// ========================================

/**
 * Manages rule activation, deactivation, and application across tabs.
 * @typedef {Object} RuleManager
 * @property {Map<string, Object>} rules - Active rules mapped by ID
 * @property {function(Object): Promise<boolean>} activateRule - Activates a rule
 * @property {function(Object): Promise<void>} _applyRule - Internal rule application
 */
const ruleManager = {
  rules: new Map(),
  
  async activateRule(rule) {
    try {
      ruleValidator.validateRule(rule);
      await this._applyRule(rule);
      this.rules.set(rule.id, {
        ...rule,
        activatedAt: Date.now()
      });
      return true;
    } catch (error) {
      connection.logError(error, {
        context: 'ruleActivation',
        ruleId: rule.id,
        severity: ERROR_CATEGORIES.SEVERITY.HIGH
      });
      return false;
    }
  },

  async _applyRule(rule) {
    const tabs = await browser.tabs.query({ url: rule.condition });
    return processBatchOperations(tabs, async (tab) => {
      try {
        await handleTabAction({
          action: rule.action,
          tabId: tab.id,
          payload: rule.payload
        });
      } catch (error) {
        connection.logError(error, {
          context: 'ruleApplication',
          ruleId: rule.id,
          tabId: tab.id
        });
      }
    });
  }
};

// ========================================
// Telemetry and Performance Monitoring
// ========================================

/**
 * Aggregates and manages telemetry events with buffering.
 * @typedef {Object} TelemetryAggregator
 * @property {Map<string, Object>} buffer - Buffered telemetry events
 * @property {number} flushThreshold - Events before auto-flush
 * @property {function(string, string, Object): void} addEvent - Adds event
 * @property {function(string?): Promise<void>} flush - Flushes events
 */
const telemetryAggregator = {
  buffer: new Map(),
  flushThreshold: CONFIG.BATCH.FLUSH_SIZE,
  aggregationWindow: CONFIG.TELEMETRY.FLUSH_INTERVAL,

  addEvent(category, event, data = {}) {
    const key = `${category}_${event}`;
    const existing = this.buffer.get(key) || {
      count: 0,
      sum: 0,
      min: Infinity,
      max: -Infinity,
      samples: []
    };

    // Update aggregates
    existing.count++;
    if (data.duration) {
      existing.sum += data.duration;
      existing.min = Math.min(existing.min, data.duration);
      existing.max = Math.max(existing.max, data.duration);
    }

    // Keep limited samples
    if (existing.samples.length < 5) {
      existing.samples.push(data);
    }

    this.buffer.set(key, existing);

    // Flush if threshold reached
    if (existing.count >= this.flushThreshold) {
      this.flush(key);
    }
  },

  async flush(key = null) {
    const toFlush = key ? [key] : Array.from(this.buffer.keys());
    
    for (const k of toFlush) {
      const data = this.buffer.get(k);
      if (data) {
        await telemetryTracker.logEvent(k.split('_')[0], 'aggregate', {
          ...data,
          average: data.sum / data.count,
          timestamp: Date.now()
        });
        this.buffer.delete(k);
      }
    }
  }
};

// Update telemetryTracker to use aggregation
const telemetryTracker = {
  events: new Map(),
  
  logEvent(category, event, data = {}) {
    // Use aggregation for performance events
    if (category === 'performance' || data.duration) {
      telemetryAggregator.addEvent(category, event, data);
      return;
    }

    // Direct logging for critical events
    const eventData = {
      timestamp: Date.now(),
      category,
      event,
      data
    };
    
    this.events.set(crypto.randomUUID(), eventData);
    this._checkThresholds(eventData);
  },
  
  _checkThresholds(event) {
    const { category, data } = event;
    const threshold = telemetryConfig.thresholds[category];
    
    if (data.duration) {
      telemetryAnalyzer.addSample(category, data.duration);
    }
    
    if (threshold && data.duration > threshold) {
      logger.warn('Performance threshold exceeded', {
        category,
        duration: data.duration,
        threshold,
        ...data
      });
      connection.logPerformance(category, data.duration, data);
    }
  },
  
  _pruneEvents() {
    const now = Date.now();
    const maxAge = STORAGE_CONFIG.RETENTION_PERIOD_MS;
    let prunedCount = 0;
    
    for (const [id, event] of this.events) {
      if (now - event.timestamp > maxAge) {
        this.events.delete(id);
        prunedCount++;
      }
    }
    
    if (prunedCount > 0) {
      logger.debug('Pruned old telemetry events', { prunedCount });
    }
  }
};

// Enhanced state diffing
/**
 * Computes state differences for efficient updates
 * @param {Object} currentState - Current application state
 * @param {Object} lastState - Previous application state
 * @returns {Object|null} State differences or null if no changes
 * 
 * @example
 * const diff = getStateDiff(currentState, lastState);
 * if (diff) {
 *   await connection.broadcastMessage({
 *     type: MESSAGE_TYPES.STATE_SYNC,
 *     payload: diff
 *   });
 * }
 */
function getStateDiff(currentState, lastState) {
  if (!lastState) return currentState;
  
  const diff = {};
  const processed = new Set();
  
  // Compare each key in both states
  for (const [key, value] of Object.entries(currentState)) {
    if (!deepEqual(value, lastState[key])) {
      diff[key] = value;
    }
    processed.add(key);
  }
  
  // Check for deleted keys
  for (const key of Object.keys(lastState)) {
    if (!processed.has(key)) {
      diff[key] = null; // Mark as deleted
    }
  }
  
  return Object.keys(diff).length > 0 ? diff : null;
}

/**
 * Initialize background service worker
 */
async function initialize() {
  if (isInitialized) return;
  
  try {
    // Check for emergency backup
    const { emergencyBackup } = await browser.storage.local.get('emergencyBackup');
    if (emergencyBackup) {
      logger.warn('Recovering from emergency backup...', { emergencyBackup });
      await recoverFromEmergencyBackup(emergencyBackup);
      await browser.storage.local.remove('emergencyBackup');
    }

    // Add startup handling
    browser.runtime.onStartup.addListener(handleStartup);
    browser.runtime.onSuspend.addListener(handleSuspend);
    browser.runtime.onSuspendCanceled.addListener(handleSuspendCanceled);

    // Set up enhanced message handling with validation
    browser.runtime.onMessage.addListener((message, sender) => 
      handleMessage(message, sender).catch(console.error)
    );

    // Set up connection handling with telemetry
    browser.runtime.onConnect.addListener((port) => {
      if (port.name === 'tabActivity') {
        connection.handleConnection(port);
      }
    });

    // Set up tab lifecycle management
    browser.tabs.onUpdated.addListener(handleTabUpdate);
    browser.tabs.onRemoved.addListener(handleTabRemove);

    // Initialize periodic tasks with performance monitoring
    setupPeriodicTasks();

    // Add crash recovery
    await connection.recoverFromCrash();

    // Load stored telemetry configuration
    const stored = await browser.storage.local.get('telemetryThresholds');
    if (stored.telemetryThresholds) {
      Object.assign(telemetryConfig.thresholds, stored.telemetryThresholds);
    }

    // Initialize rule manager
    const storedRules = await browser.storage.local.get('rules');
    if (storedRules.rules) {
      for (const rule of storedRules.rules) {
        await ruleManager.activateRule(rule);
      }
    }

    // Initialize telemetry optimization
    setupTelemetryOptimization();

    isInitialized = true;
    logger.info('Background service worker initialized');
  } catch (error) {
    logger.critical('Background initialization failed', { error });
    throw error;
  }
}

/**
 * Handles incoming messages with validation and telemetry tracking.
 * @param {Object} message - The message to process
 * @param {string} message.type - Message type from MESSAGE_TYPES enum
 * @param {Object} message.payload - Message data specific to the type
 * @param {string} [message.requestId] - Optional request identifier
 * @param {Object} sender - Information about message sender
 * @param {string} sender.id - Unique identifier of sender
 * @param {Tab} [sender.tab] - Tab object if sent from content script
 * @returns {Promise<Object>} Response data for the message
 * @throws {Error} If message validation fails or processing errors occur
 * 
 * @example
 * // Success case
 * const response = await handleMessage({
 *   type: MESSAGE_TYPES.TAB_ACTION,
 *   payload: { action: 'suspend', tabId: 123 }
 * }, { id: 'sender1' });
 * 
 * // Error case - invalid message type
 * try {
 *   await handleMessage({ type: 'INVALID' }, { id: 'sender1' });
 * } catch (error) {
 *   // Handles: "Unhandled message type: INVALID"
 * }
 */
async function handleMessage(message, sender) {
  const startTime = performance.now();
  
  try {
    validateMessage(message);
    await checkPermissions(PERMISSION_TYPES.MESSAGING);

    const response = await messageRouter(message, sender);
    
    // Track performance
    const duration = performance.now() - startTime;
    if (duration > CONFIG.METRICS.THRESHOLDS.MESSAGE_PROCESSING) {
      connection.logPerformance('messageProcessing', duration, { 
        type: message.type 
      });
    }

    return response;
  } catch (error) {
    connection.logError(error, {
      context: 'messageHandling',
      messageType: message?.type
    });
    return { error: error.message };
  }
}

/**
 * Enhanced message router with telemetry
 * @param {Object} message - Incoming message
 * @param {string} message.type - Message type from MESSAGE_TYPES
 * @param {Object} message.payload - Message data
 * @param {Object} sender - Message sender information
 * @returns {Promise<Object>} Response data
 * @throws {Error} On invalid message or processing failure
 * 
 * @example
 * const response = await messageRouter({
 *   type: MESSAGE_TYPES.TAB_ACTION,
 *   payload: { action: 'suspend', tabId: 123 }
 * }, sender);
 */
async function messageRouter(message, sender) {
  logger.debug('Routing message', { 
    type: message.type, 
    sender: sender.id 
  });
  
  try {
    switch (message.type) {
      case MESSAGE_TYPES.TAB_ACTION:
        return handleTabAction(message.payload, sender);
      case MESSAGE_TYPES.TAG_ACTION:
        return handleTagAction(message.payload, sender);
      case MESSAGE_TYPES.PERMISSION_REQUEST:
        return handlePermissionRequest(message.payload);
      case MESSAGE_TYPES.STATE_UPDATE:
        return handleStateUpdate(message.payload);
      case MESSAGE_TYPES.STATE_SYNC:
        return handleStateSync();
      case MESSAGE_TYPES.RULE_ACTION:
        return handleRuleAction(message.payload, sender);
      default:
        throw new Error(`Unhandled message type: ${message.type}`);
    }
  } finally {
    telemetryTracker.logEvent('message', 'completed', {
      type: message.type,
      duration: Date.now() - message.timestamp
    });
  }
}

/**
 * Handle tag-related actions
 */
async function handleTagAction({ action, tabId, tag }, sender) {
  try {
    await checkPermissions(PERMISSION_TYPES.TABS);
    
    switch (action) {
      case 'add': {
        const result = await addTagToTab(tabId, tag);
        store.dispatch(actions.tabManagement.updateMetadata(tabId, {
          tags: result.tags,
          lastTagged: Date.now()
        }));
        return result;
      }
      case 'remove':
        return removeTagFromTab(tabId, tag);
      case 'get':
        return getTagsForTab(tabId);
      default:
        throw new Error(`Unsupported tag action: ${action}`);
    }
  } catch (error) {
    connection.logError(error, {
      context: 'tagAction',
      action,
      severity: ERROR_CATEGORIES.SEVERITY.MEDIUM
    });
    throw error;
  }
}

/**
 * Handle permission requests
 */
async function handlePermissionRequest({ permissions }) {
  try {
    const granted = await requestPermissions(permissions);
    return { granted };
  } catch (error) {
    console.error('Permission request failed:', error);
    throw error;
  }
}

/**
 * Enhanced tab action handling with validation
 */
async function handleTabAction({ action, tabId, payload }, sender) {
  try {
    await checkPermissions(PERMISSION_TYPES.TABS);
    
    switch (action) {
      case TAB_OPERATIONS.UPDATE: {
        validateTab(payload);
        const updatedTab = await updateTab(tabId, payload);
        store.dispatch(actions.tabManagement.updateTab(updatedTab));
        return updatedTab;
      }
      
      case TAB_OPERATIONS.DISCARD: {
        const tab = await getTab(tabId);
        await discardTab(tabId);
        store.dispatch(actions.tabManagement.updateTab({
          id: tabId,
          status: TAB_STATES.SUSPENDED
        }));
        return tab;
      }
      
      case TAB_OPERATIONS.TAG: {
        // Use tabManager's tag validation
        if (!TAG_VALIDATION.TAG.PATTERN.test(payload.tag)) {
          throw new Error('Invalid tag format');
        }
        return addTagToTab(tabId, payload.tag);
      }

      case 'suspend':
        return TabLifecycle.suspend(tabId);
      case 'resume':
        return TabLifecycle.resume(tabId);
      default:
        throw new Error(`Unsupported tab action: ${action}`);
    }
  } catch (error) {
    connection.logError(error, { context: 'tabAction', action });
    throw error;
  }
}

/**
 * Handle state updates with validation
 */
async function handleStateUpdate(payload) {
  try {
    await validateStateUpdate(payload.type, payload.data);
    store.dispatch({
      type: payload.type,
      payload: payload.data
    });
    return true;
  } catch (error) {
    console.error('State update failed:', error);
    throw error;
  }
}

/**
 * Handle state synchronization using connectionManager
 */
async function handleStateSync() {
  const currentState = store.getState();
  const diff = getStateDiff(currentState, connection.lastSyncedState);
  
  if (diff) {
    try {
      await connection.broadcastMessage({
        type: MESSAGE_TYPES.STATE_SYNC,
        payload: diff
      });
      connection.lastSyncedState = currentState;
      return true;
    } catch (error) {
      connection.logError(error, {
        context: 'stateSync',
        severity: ERROR_CATEGORIES.SEVERITY.HIGH,
        stateDiff: Object.keys(diff)
      });
      throw error;
    }
  }
  return false;
}

/**
 * Handle new connections using connectionManager
 */
function handleConnection(port) {
  if (port.name === 'tabActivity') {
    connection.handleConnection(port, async (msg) => {
      try {
        const response = await handleMessage(msg, port.sender);
        return {
          type: msg.type,
          payload: response,
          requestId: msg.requestId
        };
      } catch (error) {
        return {
          type: ERROR_TYPES.ERROR,
          payload: { error: error.message },
          requestId: msg.requestId
        };
      }
    });
  }
}

/**
 * Handle tab updates
 */
async function handleTabUpdate(tabId, changeInfo, tab) {
  if (changeInfo.status === 'complete') {
    store.dispatch(actions.tabManagement.updateTab({
      ...tab,
      lastAccessed: Date.now()
    }));
  }
}

/**
 * Handle tab removal
 */
function handleTabRemove(tabId) {
  store.dispatch(actions.tabManagement.removeTab(tabId));
}

/**
 * Enhanced periodic tasks using connectionManager state sync
 */
function setupPeriodicTasks() {
  // Critical tasks remain interval-based
  setInterval(async () => {
    const tabs = await browser.tabs.query({});
    await processBatchOperations(tabs, async (tab) => {
      const activity = store.getState().tabActivity[tab.id];
      if (activity?.lastAccessed < Date.now() - CONFIG.INACTIVITY.SUSPEND) {
        await TabLifecycle.suspend(tab.id);
      }
    });
  }, CONFIG.TIMEOUTS.CLEANUP);

  // Non-urgent tasks use requestIdleCallback
  const scheduleSync = () => {
    requestIdleCallback(async () => {
      try {
        await connection.syncState();
      } finally {
        scheduleSync();
      }
    }, { timeout: 10000 });
  };

  scheduleSync();

  // Add rule validation check
  setInterval(async () => {
    for (const [id, rule] of ruleManager.rules) {
      try {
        const isValid = await ruleValidator.validateRule(rule);
        if (!isValid) {
          connection.logError(new Error('Rule validation failed'), {
            context: 'ruleValidation',
            ruleId: id,
            severity: ERROR_CATEGORIES.SEVERITY.HIGH
          });
          ruleManager.rules.delete(id);
        }
      } catch (error) {
        console.error(`Rule validation error for ${id}:`, error);
      }
    }
  }, CONFIG.TIMEOUTS.RULE_VALIDATION);
}

/**
 * Initialize periodic telemetry optimization
 * @throws {Error} If telemetry storage or analysis fails
 * 
 * @example
 * // High latency detection
 * // If message processing consistently exceeds threshold:
 * // Old threshold: 50ms
 * // New threshold: 75ms (adjusted based on p95 + 2σ)
 * 
 * // Performance improvement detection
 * // If processing times decrease significantly:
 * // Old threshold: 100ms
 * // New threshold: 65ms
 */
function setupTelemetryOptimization() {
  setInterval(async () => {
    for (const category of Object.keys(CONFIG.THRESHOLDS)) {
      const suggestedThreshold = telemetryAnalyzer.suggestThreshold(category);
      if (suggestedThreshold) {
        const currentThreshold = telemetryConfig.thresholds[category];
        
        // Only update if significant change (>10%)
        if (Math.abs(suggestedThreshold - currentThreshold) / currentThreshold > 0.1) {
          logger.info('Updating telemetry threshold', {
            category,
            oldThreshold: currentThreshold,
            newThreshold: suggestedThreshold,
            samplesAnalyzed: telemetryAnalyzer.historicalData.get(category)?.samples.length
          });
          
          await telemetryConfig.updateThresholds({
            [category]: suggestedThreshold
          });
        }
      }
    }
  }, telemetryAnalyzer.updateInterval);
}

/**
 * Add graceful shutdown
 */
async function shutdown() {
  try {
    clearInterval(metricsInterval);
    await connection.shutdown();
    await store.persist();
    console.log('Background service worker shutdown complete');
  } catch (error) {
    console.error('Shutdown error:', error);
  }
}

// Add lifecycle event handlers
async function handleStartup() {
  try {
    await connection.recoverFromCrash();
    await store.rehydrate();
    console.log('Service worker started');
  } catch (error) {
    connection.logError(error, {
      context: 'startup',
      severity: ERROR_CATEGORIES.SEVERITY.HIGH
    });
  }
}

async function handleSuspend() {
  try {
    await gracefulShutdown();
  } catch (error) {
    connection.logError(error, {
      context: 'suspend',
      severity: ERROR_CATEGORIES.SEVERITY.HIGH
    });
  }
}

function handleSuspendCanceled() {
  if (shutdownTimer) {
    clearTimeout(shutdownTimer);
    shutdownTimer = null;
  }
}

// Add enhanced shutdown with recovery steps
/**
 * Manages graceful shutdown with timeout protection and error tracking.
 * @param {Array<ShutdownStep>} steps - Ordered shutdown steps to execute
 * @param {Array<Object>} errors - Collection for non-critical errors
 * @returns {Promise<void>}
 * @throws {Error} If critical steps fail or timeout occurs
 * 
 * @example
 * // Successful shutdown
 * const errors = [];
 * await gracefulShutdown([
 *   { name: 'flush', action: async () => {...} },
 *   { name: 'persist', action: async () => {...} }
 * ], errors);
 * 
 * // Timeout case
 * try {
 *   await gracefulShutdown([
 *     { name: 'slow', action: async () => await sleep(6000) }
 *   ], []);
 * } catch (error) {
 *   // Handles: "Shutdown timed out"
 * }
 */
async function gracefulShutdown() {
  const errors = [];
  
  try {
    const shutdownStarted = Date.now();
    logger.info('Initiating graceful shutdown...');
    
    // Execute shutdown steps with individual error handling
    const steps = [
      {
        name: 'flushTelemetry',
        action: async () => {
          await telemetryAggregator.flush();
          clearInterval(metricsInterval);
        }
      },
      {
        name: 'persistState',
        action: async () => {
          await store.persist();
        }
      },
      {
        name: 'cleanupConnections',
        action: async () => {
          await connection.shutdown();
        }
      }
    ];

    // Execute steps with timeout protection
    await Promise.race([
      executeShutdownSteps(steps, errors),
      new Promise((_, reject) => {
        shutdownTimer = setTimeout(() => {
          reject(new Error('Shutdown timed out'));
        }, CONFIG.TIMEOUTS.SHUTDOWN);
      })
    ]);

    // Clear timeout if successful
    if (shutdownTimer) {
      clearTimeout(shutdownTimer);
    }

    // Log shutdown results
    const shutdownDuration = Date.now() - shutdownStarted;
    logger.info(`Graceful shutdown completed`, { durationMs: shutdownDuration });
    
    // Report any non-critical errors
    if (errors.length > 0) {
      logger.warn('Non-critical shutdown errors occurred', { errors });
    }
  } catch (error) {
    // Log critical shutdown failure
    logger.critical('Critical shutdown failure', {
      error,
      errors,
      context: 'shutdown'
    });
    
    // Attempt emergency cleanup
    await emergencyCleanup();
    throw error;
  }
}

// Add helper for sequential shutdown steps
/**
 * Executes shutdown steps with error tracking
 * @param {Array<ShutdownStep>} steps - Shutdown steps to execute
 * @param {Array} errors - Array to collect non-critical errors
 * @returns {Promise<void>}
 * @throws {Error} On critical shutdown failure
 * 
 * @example
 * const errors = [];
 * await executeShutdownSteps([
 *   { name: 'cleanup', action: async () => {...} },
 *   { name: 'persist', action: async () => {...} }
 * ], errors);
 */
async function executeShutdownSteps(steps, errors) {
  for (const { name, action } of steps) {
    try {
      await action();
    } catch (error) {
      errors.push({ step: name, error: error.message });
      // Continue with next step unless fatal
      if (name === 'persistState') {
        throw error; // State persistence is critical
      }
    }
  }
}

// Add emergency cleanup for critical failures
async function emergencyCleanup() {
  logger.warn('Initiating emergency cleanup');
  
  try {
    // Force close all connections
    for (const [id] of connection.connections) {
      try {
        await connection.disconnect(id);
      } catch (e) {
        console.error(`Failed to close connection ${id}:`, e);
      }
    }

    // Attempt minimal state persistence
    const criticalState = {
      timestamp: Date.now(),
      tabs: store.getState().tabs,
      rules: Array.from(ruleManager.rules.values())
    };

    await browser.storage.local.set({
      emergencyBackup: criticalState
    });

    logger.info('Emergency cleanup completed');
  } catch (error) {
    logger.critical('Emergency cleanup failed', { error });
  }
}

// Update initialization to check for emergency backup
async function initialize() {
  if (isInitialized) return;
  
  try {
    // Check for emergency backup
    const { emergencyBackup } = await browser.storage.local.get('emergencyBackup');
    if (emergencyBackup) {
      console.warn('Recovering from emergency backup...');
      await recoverFromEmergencyBackup(emergencyBackup);
      await browser.storage.local.remove('emergencyBackup');
    }
  } catch (error) {
    console.error('Background initialization failed:', error);
    throw error;
  }
}

// Add recovery from emergency backup
/**
 * Recovers state from emergency backup after unexpected shutdown.
 * @param {Object} backup - Emergency backup data
 * @param {Array<Tab>} backup.tabs - Saved tab state
 * @param {Array<Rule>} backup.rules - Saved rules
 * @returns {Promise<void>}
 * @throws {Error} If recovery fails or backup data is invalid
 * 
 * @example
 * // Successful recovery
 * await recoverFromEmergencyBackup({
 *   tabs: [{ id: 1, url: 'https://example.com' }],
 *   rules: [{ id: 'rule1', condition: '*.example.com' }]
 * });
 * 
 * // Invalid backup data
 * try {
 *   await recoverFromEmergencyBackup({ 
 *     tabs: 'invalid' 
 *   });
 * } catch (error) {
 *   // Handles: "Invalid backup data structure"
 * }
 */
async function recoverFromEmergencyBackup(backup) {
  try {
    // Restore critical state
    if (backup.tabs) {
      store.dispatch(actions.tabManagement.restoreTabs(backup.tabs));
    }
    
    if (backup.rules) {
      for (const rule of backup.rules) {
        await ruleManager.activateRule(rule);
      }
    }

    console.log('Emergency backup recovery completed');
  } catch (error) {
    console.error('Failed to recover from emergency backup:', error);
    throw error;
  }
}

// Initialize with crash recovery and shutdown handling
initialize().catch(console.error);

browser.runtime.onSuspend.addListener(() => {
  shutdown().catch(console.error);
});

// Initialize with enhanced error handling
initialize().catch(error => {
  connection.logError(error, {
    context: 'initialization',
    severity: ERROR_CATEGORIES.SEVERITY.CRITICAL
  });
});

// Add rule-specific message handling
async function handleRuleAction({ action, rule }, sender) {
  const startTime = Date.now();
  
  try {
    switch (action) {
      case 'activate':
        return ruleManager.activateRule(rule);
      case 'deactivate':
        return ruleManager.rules.delete(rule.id);
      case 'update':
        await ruleManager.rules.delete(rule.id);
        return ruleManager.activateRule(rule);
      default:
        throw new Error(`Unsupported rule action: ${action}`);
    }
  } catch (error) {
    connection.logError(error, {
      context: 'ruleAction',
      action,
      ruleId: rule?.id
    });
    throw error;
  } finally {
    // Log telemetry for rule operation
    telemetryTracker.logEvent('rule', action, {
      ruleId: rule?.id,
      duration: Date.now() - startTime,
      success: !error
    });
  }
}

// Export for testing
export const __testing__ = {
  /**
   * Message handling test utility
   * @param {Object} message - Test message
   * @param {Object} sender - Test sender
   * @returns {Promise<Object>} Handler response
   * 
   * @example
   * const response = await __testing__.handleMessage({
   *   type: MESSAGE_TYPES.TAB_ACTION,
   *   payload: { action: 'suspend', tabId: 123 }
   * }, { id: 'test' });
   */
  handleMessage,
  messageRouter,
  handleTabAction,
  handleTagAction,
  handlePermissionRequest,
  handleStateSync,
  ruleValidator,
  telemetryConfig,
  gracefulShutdown,
  ruleManager,
  telemetryTracker,
  getStateDiff,
  telemetryAggregator,
  executeShutdownSteps,
  emergencyCleanup,
  recoverFromEmergencyBackup,
  telemetryAnalyzer,
  setupTelemetryOptimization,
  
  /**
   * Rule validation test utility
   * @param {Rule} rule - Rule to validate
   * @returns {boolean} Validation result
   * @throws {Error} With detailed validation failure
   * 
   * @example
   * expect(() => __testing__.validateRule({
   *   invalid: 'rule'
   * })).toThrow('Invalid rule format');
   */
  validateRule,
  
  /**
   * Utility for testing shutdown behavior
   * @param {Array<ShutdownStep>} steps - Custom shutdown steps
   * @returns {Promise<void>}
   */
  executeCustomShutdown: async (steps) => {
    const errors = [];
    await executeShutdownSteps(steps, errors);
    return errors;
  }
};

/**
 * Enhanced logging utility using TELEMETRY_CONFIG.LEVELS
 * @type {Object}
 */
const logger = {
  _log(level, message, data = {}) {
    const logData = {
      timestamp: Date.now(),
      level,
      message,
      ...data
    };

    switch (level) {
      case TELEMETRY_CONFIG.LEVELS.DEBUG:
        console.debug(message, data);
        break;
      case TELEMETRY_CONFIG.LEVELS.INFO:
        console.log(message, data);
        break;
      case TELEMETRY_CONFIG.LEVELS.WARN:
        console.warn(message, data);
        break;
      case TELEMETRY_CONFIG.LEVELS.ERROR:
      case TELEMETRY_CONFIG.LEVELS.CRITICAL:
        console.error(message, data);
        break;
    }

    // Add to telemetry buffer if above INFO level
    if (level > TELEMETRY_CONFIG.LEVELS.INFO) {
      telemetryAggregator.addEvent('log', level.toString(), logData);
    }
  },

  debug(message, data) {
    this._log(TELEMETRY_CONFIG.LEVELS.DEBUG, message, data);
  },

  info(message, data) {
    this._log(TELEMETRY_CONFIG.LEVELS.INFO, message, data);
  },

  warn(message, data) {
    this._log(TELEMETRY_CONFIG.LEVELS.WARN, message, data);
  },

  error(message, data) {
    this._log(TELEMETRY_CONFIG.LEVELS.ERROR, message, data);
  },

  critical(message, data) {
    this._log(TELEMETRY_CONFIG.LEVELS.CRITICAL, message, data);
  }
};