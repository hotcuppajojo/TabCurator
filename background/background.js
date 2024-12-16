// background/background.js
/**
 * @fileoverview Background Service Worker
 * Coordinates between UI, tab management, and state synchronization
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

// Add rule validation utilities
const ruleValidator = {
  validateRule: (rule) => {
    if (!rule?.condition || !rule?.action) {
      throw new Error('Invalid rule format');
    }
    return true;
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

// Add dynamic telemetry configuration
const telemetryConfig = {
  thresholds: { ...TELEMETRY_CONFIG.THRESHOLDS },
  
  updateThresholds: async (newThresholds) => {
    Object.assign(telemetryConfig.thresholds, newThresholds);
    await browser.storage.local.set({ 
      telemetryThresholds: telemetryConfig.thresholds 
    });
  }
};

// Add telemetry aggregation
const telemetryAggregator = {
  buffer: new Map(),
  flushThreshold: 50,
  aggregationWindow: 60000, // 1 minute

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

// Enhanced rule management
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
    
    if (threshold && data.duration > threshold) {
      connection.logPerformance(category, data.duration, data);
    }
  },
  
  _pruneEvents() {
    const now = Date.now();
    const maxAge = STORAGE_CONFIG.RETENTION_PERIOD_MS;
    
    for (const [id, event] of this.events) {
      if (now - event.timestamp > maxAge) {
        this.events.delete(id);
      }
    }
  }
};

// Enhanced state diffing
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
      console.warn('Recovering from emergency backup...');
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

    isInitialized = true;
    console.log('Background service worker initialized');
  } catch (error) {
    console.error('Background initialization failed:', error);
    throw error;
  }
}

/**
 * Enhanced message handling with validation and telemetry
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
 * Add centralized message routing
 */
async function messageRouter(message, sender) {
  telemetryTracker.logEvent('message', 'received', {
    type: message.type,
    timestamp: Date.now()
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
      if (activity?.lastAccessed < Date.now() - CONFIG.INACTIVITY_THRESHOLDS.SUSPEND) {
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
async function gracefulShutdown() {
  const SHUTDOWN_TIMEOUT = 5000;
  const errors = [];
  
  try {
    // Signal shutdown start
    const shutdownStarted = Date.now();
    
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
        }, SHUTDOWN_TIMEOUT);
      })
    ]);

    // Clear timeout if successful
    if (shutdownTimer) {
      clearTimeout(shutdownTimer);
    }

    // Log shutdown results
    const shutdownDuration = Date.now() - shutdownStarted;
    console.log(`Graceful shutdown completed in ${shutdownDuration}ms`);
    
    // Report any non-critical errors
    if (errors.length > 0) {
      console.warn('Non-critical shutdown errors:', errors);
    }
  } catch (error) {
    // Log critical shutdown failure
    connection.logError(error, {
      context: 'shutdown',
      severity: ERROR_CATEGORIES.SEVERITY.CRITICAL,
      errors: errors
    });
    
    // Attempt emergency cleanup
    await emergencyCleanup();
    throw error;
  }
}

// Add helper for sequential shutdown steps
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
  } catch (error) {
    console.error('Emergency cleanup failed:', error);
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

    // ...existing initialization code...
  } catch (error) {
    console.error('Background initialization failed:', error);
    throw error;
  }
}

// Add recovery from emergency backup
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
  }
}

// Export for testing
export const __testing__ = {
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
  recoverFromEmergencyBackup
};