/**
 * background/background.js
 * @fileoverview Background Service Worker - Core Extension Coordinator
 * @version 0.8.5
 * @date 2024-12-15
 *  * @author JoJo Petersky
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
  createTab,
  validateTab,
  queryTabs,
  updateTabMetadata,
  removeTab,
  processTabs as processTabsBatch,
  processBatchOperations,
  convertToDeclarativeRules,
  activateRules,
  applyRulesToTab
} from '../utils/tabManager.js';
import {
  connection
} from '../utils/connectionManager.js';
import {
  MESSAGE_TYPES,
  TAB_STATES,
  CONFIG,
  VALIDATION_TYPES,
  TELEMETRY_CONFIG,
  ERROR_CATEGORIES,
  STORAGE_CONFIG,
} from '../utils/constants.js';
import { logger } from '../utils/logger.js';

// Initialize connection manager
let isInitialized = false;

// No permissions or error_types imports or usage
// No TabLifecycle usage, removed references
// No addTagToTab, removeTagFromTab, getTagsForTab, archiveTabAction usage

// Schemas and validators for rules
const ruleValidator = {
  validateRule: (rule) => {
    if (!rule?.condition || !rule?.action) {
      throw new Error('Invalid rule format');
    }
    logger.debug('Rule validated successfully', { ruleId: rule.id });
    return true;
  },
  
  validateRuleSet: (rules) => {
    return rules.every(rule => {
      try {
        return ruleValidator.validateRule(rule);
      } catch (error) {
        console.error('Invalid rule:', error);
        return false;
      }
    });
  }
};

const telemetryConfig = {
  thresholds: { ...TELEMETRY_CONFIG.THRESHOLDS },
  
  updateThresholds: async (newThresholds) => {
    Object.assign(telemetryConfig.thresholds, newThresholds);
    await browser.storage.local.set({ 
      telemetryThresholds: telemetryConfig.thresholds 
    });
  }
};

const telemetryAnalyzer = {
  historicalData: new Map(),
  analysisWindow: 3600000,
  minSampleSize: 100,
  updateInterval: 300000,
  
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
    const suggestedThreshold = Math.ceil(stats.p95 + (2 * stats.stdDev));
    const currentThreshold = telemetryConfig.thresholds[category] || CONFIG.THRESHOLDS[category];
    const minThreshold = Math.floor(currentThreshold * 0.5);
    const maxThreshold = Math.ceil(currentThreshold * 2);
    return Math.min(Math.max(suggestedThreshold, minThreshold), maxThreshold);
  }
};

const telemetryAggregator = {
  buffer: new Map(),
  flushThreshold: CONFIG.BATCH.FLUSH_SIZE,
  batchSize: CONFIG.BATCH.DEFAULT.SIZE || 10, // Add fallback value
  aggregationWindow: CONFIG.TELEMETRY.FLUSH_INTERVAL,
  peakLoads: new Map(),
  
  trackMetric(category, value, context = {}) {
    const timestamp = Date.now();
    const window = Math.floor(timestamp / 60000);
    const peak = this.peakLoads.get(category) || {
      value: 0,
      timestamp: 0,
      window
    };
    
    if (value > peak.value || window > peak.window) {
      this.peakLoads.set(category, { value, timestamp, window });
      if (value > peak.value * 1.5) {
        logger.warn('Significant load increase detected', {
          category,
          previousPeak: peak.value,
          newPeak: value,
          context
        });
      }
    }
    this.addEvent(category, 'metric', { value, timestamp, ...context });
  },

  addEvent(category, event, data = {}) {
    const key = `${category}_${event}`;
    const existing = this.buffer.get(key) || {
      count: 0,
      sum: 0,
      min: Infinity,
      max: -Infinity,
      samples: []
    };

    existing.count++;
    if (data.duration) {
      existing.sum += data.duration;
      existing.min = Math.min(existing.min, data.duration);
      existing.max = Math.max(existing.max, data.duration);
    }

    if (existing.samples.length < 5) {
      existing.samples.push(data);
    }

    this.buffer.set(key, existing);
    if (existing.count >= this.flushThreshold) {
      this.flush(key);
    }
  },

  async flush(key = null) {
    const flushStart = performance.now();
    const errors = [];
    
    try {
      const toFlush = key ? [key] : Array.from(this.buffer.keys());
      for (const k of toFlush) {
        const data = this.buffer.get(k);
        if (!data) continue;
        try {
          // Direct logging or future telemetry endpoint
          logger.debug('Flushing telemetry event', { key: k, data });
          this.buffer.delete(k);
        } catch (error) {
          errors.push({ key: k, error: error.message });
          logger.error('Failed to flush telemetry key', {
            key: k,
            error: error.message,
            type: 'TELEMETRY_FLUSH'
          });
        }
      }
    } finally {
      const duration = performance.now() - flushStart;
      logger.debug('Telemetry flush completed', {
        duration,
        errorCount: errors.length
      });
    }
  },

  async flushWithRetry(options = {}) {
    const {
      maxAttempts = CONFIG.RETRY.MAX_ATTEMPTS,
      baseDelay = CONFIG.RETRY.BACKOFF_BASE
    } = options;
    let attempt = 0;
    while (attempt < maxAttempts) {
      try {
        await this.flush();
        return;
      } catch (error) {
        attempt++;
        if (attempt === maxAttempts) {
          await this._persistFailedTelemetry();
          throw error;
        }
        const delay = baseDelay * Math.pow(2, attempt - 1) * (0.75 + Math.random() * 0.5);
        logger.warn('Telemetry flush failed, retrying', {
          attempt,
          nextRetry: delay,
          error: error.message
        });
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  },

  async _persistFailedTelemetry() {
    try {
      const failedData = Array.from(this.buffer.entries());
      await browser.storage.local.set({
        ['failed_telemetry']: {
          data: failedData,
          timestamp: Date.now()
        }
      });
    } catch (error) {
      logger.error('Failed to persist telemetry', { error: error.message });
    }
  }
};

const telemetryTracker = {
  events: new Map(),
  
  logEvent(category, event, data = {}) {
    if (category === 'performance' || data.duration) {
      telemetryAggregator.addEvent(category, event, data);
      return;
    }

    const eventData = {
      timestamp: Date.now(),
      category,
      event,
      data
    };
    this.events.set(crypto.randomUUID(), eventData);
    this._pruneEvents();
  },
  
  _pruneEvents() {
    const now = Date.now();
    const maxAge = STORAGE_CONFIG.RETENTION?.METRICS || 86400000; // Default 24h
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

const ruleManager = {
  rules: new Map(),
  
  async activateRule(rule) {
    try {
      ruleValidator.validateRule(rule);
      // For now, we won't fully apply the rule to all tabs here
      // as it's complex and we have applyRulesToTab for direct invocation.
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
  }
};

function getStateDiff(currentState, lastState) {
  if (!lastState) return currentState;
  const diff = {};
  const processed = new Set();
  
  for (const [key, value] of Object.entries(currentState)) {
    if (!deepEqual(value, lastState[key])) {
      diff[key] = value;
    }
    processed.add(key);
  }

  for (const key of Object.keys(lastState)) {
    if (!processed.has(key)) {
      diff[key] = null;
    }
  }
  
  return Object.keys(diff).length > 0 ? diff : null;
}

/**
 * Validate state payload
 * For demonstration: just a basic fullState schema
 */
const stateUpdateSchemas = {
  fullState: {
    type: 'object',
    required: ['tabs'],
    properties: {
      tabs: { type: 'array' },
      // Add more fields as needed
    }
  }
};

const validateStatePayload = (type, payload) => {
  const schema = stateUpdateSchemas[type];
  if (!schema) return true; // No specific schema, assume valid
  const validator = new Ajv().compile(schema);
  if (!validator(payload)) {
    logger.error('State payload validation failed', { type, errors: validator.errors, payload });
    throw new Error(`Invalid state payload: ${JSON.stringify(validator.errors)}`);
  }
  return true;
};

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

    browser.runtime.onStartup.addListener(handleStartup);
    browser.runtime.onSuspend.addListener(handleSuspend);
    browser.runtime.onSuspendCanceled.addListener(handleSuspendCanceled);

    browser.runtime.onMessage.addListener((message, sender) => 
      handleMessage(message, sender).catch(console.error)
    );

    browser.runtime.onConnect.addListener((port) => {
      if (port.name === 'tabActivity') {
        // handleConnection logic is integrated into connectionManager
        // which listens on onConnect events or we can call something similar
        // If needed, we can call connection.handleConnection(port)
        connection.handlePort(port);
      }
    });

    browser.tabs.onUpdated.addListener(handleTabUpdate);
    browser.tabs.onRemoved.addListener(handleTabRemove);

    setupPeriodicTasks();

    await connection.recoverFromCrash();

    const stored = await browser.storage.local.get('telemetryThresholds');
    if (stored.telemetryThresholds) {
      Object.assign(telemetryConfig.thresholds, stored.telemetryThresholds);
    }

    const storedRules = await browser.storage.local.get('rules');
    if (storedRules.rules) {
      for (const rule of storedRules.rules) {
        await ruleManager.activateRule(rule);
      }
    }

    setupTelemetryOptimization();

    isInitialized = true;
    logger.info('Background service worker initialized');
  } catch (error) {
    logger.critical('Background initialization failed', { error: error.message });
    throw error;
  }
}

async function handleMessage(message, sender) {
  const startTime = performance.now();
  const context = {
    messageType: message?.type,
    senderId: sender?.id,
    timestamp: Date.now()
  };
  
  try {
    // Removed permission checks or error_types references
    const response = await messageRouter(message, sender);
    const duration = performance.now() - startTime;
    telemetryAggregator.trackMetric('messageProcessing', duration, context);

    if (duration > CONFIG.METRICS.THRESHOLDS.MESSAGE_PROCESSING) {
      logger.warn('Message processing threshold exceeded', {
        ...context,
        duration,
        threshold: CONFIG.METRICS.THRESHOLDS.MESSAGE_PROCESSING
      });
    }

    return response;
  } catch (error) {
    logger.error('Message handling failed', {
      ...context,
      error: error.message,
      stack: error.stack,
      duration: performance.now() - startTime
    });
    return { error: error.message };
  }
}

async function messageRouter(message, sender) {
  logger.debug('Routing message', { 
    type: message.type, 
    sender: sender.id 
  });
  
  switch (message.type) {
    case MESSAGE_TYPES.TAB_ACTION:
      return handleTabAction(message.payload, sender);
    case MESSAGE_TYPES.TAG_ACTION:
      return handleTagAction(message.payload, sender);
    case MESSAGE_TYPES.STATE_UPDATE:
      return handleStateUpdate(message.payload);
    case MESSAGE_TYPES.STATE_SYNC:
      return handleStateSync();
    case MESSAGE_TYPES.RULE_ACTION:
      return handleRuleAction(message.payload, sender);
    default:
      throw new Error(`Unhandled message type: ${message.type}`);
  }
}

async function handleTagAction({ action, tabId, tag }, sender) {
  // No addTagToTab or removeTagFromTab from tabManager anymore, so let's just log:
  // If needed, implement simple tagging logic: updating tab metadata with given tag
  if (!tabId || !tag) throw new Error('Invalid tag action payload');
  
  try {
    const tab = await getTab(tabId);
    const updatedTags = [...(tab.tags || []), tag];
    await updateTab(tabId, { title: `[${tag}] ${tab.title}` });
    store.dispatch(actions.tabManagement.updateMetadata(tabId, {
      tags: updatedTags,
      lastTagged: Date.now()
    }));
    return { tabId, tags: updatedTags };
  } catch (error) {
    logger.error('Tag action failed', { action, tabId, tag, error: error.message });
    throw error;
  }
}

async function handleStateUpdate(payload) {
  try {
    validateStatePayload(payload.type, payload.data);
    await validateStateUpdate(payload.type, payload.data);
    store.dispatch({
      type: payload.type,
      payload: payload.data
    });
    return true;
  } catch (error) {
    logger.error('State update failed', {
      type: payload.type,
      error: error.message,
      data: payload.data
    });
    throw error;
  }
}

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

async function handleRuleAction({ action, rule }, sender) {
  const startTime = Date.now();
  
  try {
    switch (action) {
      case 'activate':
        return ruleManager.activateRule(rule);
      case 'deactivate':
        return ruleManager.rules.delete(rule.id);
      case 'update':
        ruleManager.rules.delete(rule.id);
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
    const duration = Date.now() - startTime;
    telemetryTracker.logEvent('rule', action, {
      ruleId: rule?.id,
      duration,
      success: !error
    });
  }
}

async function handleTabAction({ action, tabId, payload }, sender) {
  try {
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

      case TAB_OPERATIONS.TAG_AND_CLOSE:
        if (!payload?.tag) throw new Error('Tag required for tagAndClose');
        const tab = await getTab(tabId);
        const updatedTags = [...(tab.tags || []), payload.tag];
        await updateTab(tabId, { tags: updatedTags, state: TAB_STATES.ARCHIVED });
        await browser.tabs.remove(tabId);
        store.dispatch(actions.tabManagement.removeTab(tabId));
        return true;
      default:
        throw new Error(`Unsupported tab action: ${action}`);
    }
  } catch (error) {
    connection.logError(error, { context: 'tabAction', action });
    throw error;
  }
}

function setupPeriodicTasks() {
  setInterval(async () => {
    const state = store.getState();
    const tabs = await browser.tabs.query({});
    
    // Inactivity handling
    for (const tab of tabs) {
      const activity = state.tabManagement.activity[tab.id];
      if (activity && (Date.now() - activity.lastAccessed) > CONFIG.INACTIVITY_THRESHOLDS.SUSPEND) {
        await discardTab(tab.id);
      }
    }

    // Tab limit enforcement
    if (tabs.length > state.settings.maxTabs) {
      const oldestTab = findOldestTab(tabs);
      if (oldestTab) {
        store.dispatch(actions.tabManagement.updateOldestTab(oldestTab));
      }
    }
  }, CONFIG.TIMEOUTS.CLEANUP);

  // State sync on idle
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

  // Rule validation check
  setInterval(async () => {
    for (const [id, rule] of ruleManager.rules) {
      try {
        ruleValidator.validateRule(rule);
      } catch (error) {
        console.error(`Rule validation error for ${id}:`, error);
        ruleManager.rules.delete(id);
      }
    }
  }, CONFIG.TIMEOUTS.RULE_VALIDATION);
}

function setupTelemetryOptimization() {
  setInterval(async () => {
    for (const category of Object.keys(CONFIG.THRESHOLDS)) {
      const suggestedThreshold = telemetryAnalyzer.suggestThreshold(category);
      if (suggestedThreshold) {
        const currentThreshold = telemetryConfig.thresholds[category];
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

async function shutdown() {
  try {
    await connection.shutdown();
    console.log('Background service worker shutdown complete');
  } catch (error) {
    console.error('Shutdown error:', error);
  }
}

async function handleStartup() {
  try {
    await connection.recoverFromCrash();
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
  // If we had a shutdown timer, clear it
}

async function gracefulShutdown() {
  logger.info('Initiating graceful shutdown...');
  // Minimal steps, flush telemetry
  try {
    await telemetryAggregator.flushWithRetry();
    logger.info('Graceful shutdown completed');
  } catch (error) {
    logger.error('Graceful shutdown failed', { error: error.message });
    throw error;
  }
}

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

    // Minimal state persistence
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
    logger.error('Emergency cleanup failed', { error: error.message });
  }
}

async function recoverFromEmergencyBackup(backup) {
  try {
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

function handleTabUpdate(tabId, changeInfo, tab) {
  if (changeInfo.status === 'complete') {
    store.dispatch(actions.tabManagement.updateTab({
      ...tab,
      lastAccessed: Date.now()
    }));
  }
}

function handleTabRemove(tabId) {
  store.dispatch(actions.tabManagement.removeTab(tabId));
}

function findOldestTab(tabs) {
  const state = store.getState();
  const activity = state.tabManagement.activity;
  
  return tabs.reduce((oldest, tab) => {
    const lastAccessed = activity[tab.id]?.lastAccessed || 0;
    if (!oldest || lastAccessed < (activity[oldest.id]?.lastAccessed || 0)) {
      return tab;
    }
    return oldest;
  }, null);
}

// Initialize after definitions
initialize().catch(console.error);

browser.runtime.onSuspend.addListener(() => {
  shutdown().catch(console.error);
});

// Export testing interfaces if needed
export const __testing__ = {
  handleMessage,
  messageRouter,
  gracefulShutdown,
  emergencyCleanup,
  recoverFromEmergencyBackup,
  ruleValidator,
  telemetryConfig,
  telemetryAggregator,
  telemetryAnalyzer,
  telemetryTracker,
  convertToDeclarativeRules,
  ruleManager
};
