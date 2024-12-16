// utils/chromePromise.js

import browser from 'webextension-polyfill';
import { CONFIG } from './constants.js';
import { logger } from './logger.js';

// Validation helpers
const validateStorageKey = (key) => {
  if (!key || (typeof key !== 'string' && !Array.isArray(key))) {
    throw new TypeError('Storage key must be a string or array of strings');
  }
  if (Array.isArray(key) && !key.every(k => typeof k === 'string')) {
    throw new TypeError('All storage keys must be strings');
  }
};

const validateStorageItems = (items) => {
  if (!items || typeof items !== 'object') {
    throw new TypeError('Storage items must be an object');
  }
  // Check if serializable
  try {
    JSON.stringify(items);
  } catch (error) {
    throw new TypeError('Storage items must be JSON serializable');
  }
};

// Add API performance tracking
const API_METRICS = {
  storage: {
    threshold: 100, // 100ms
    samples: new Map()
  },
  tabs: {
    threshold: 50, // 50ms
    samples: new Map()
  },
  runtime: {
    threshold: 30, // 30ms
    samples: new Map()
  }
};

// Add performance tracking wrapper
const trackAPIPerformance = async (category, operation, fn) => {
  const startTime = performance.now();
  try {
    const result = await fn();
    const duration = performance.now() - startTime;
    
    // Log performance metric
    logger.logPerformance('browserAPI', duration, {
      category,
      operation,
      timestamp: Date.now()
    });

    // Track threshold breaches
    if (duration > API_METRICS[category].threshold) {
      logger.warn('Browser API threshold exceeded', {
        category,
        operation,
        duration,
        threshold: API_METRICS[category].threshold
      });
    }

    // Store sample
    const samples = API_METRICS[category].samples;
    samples.set(Date.now(), {
      operation,
      duration,
      success: true
    });

    // Cleanup old samples
    const cutoff = Date.now() - 3600000; // 1 hour
    for (const [timestamp] of samples) {
      if (timestamp < cutoff) samples.delete(timestamp);
    }

    return result;
  } catch (error) {
    const duration = performance.now() - startTime;
    logger.error('Browser API error', {
      category,
      operation,
      duration,
      error: error.message
    });
    throw error;
  }
};

export const chromePromise = {
  storage: {
    sync: {
      get: async (keys) => {
        validateStorageKey(keys);
        return trackAPIPerformance('storage', 'sync.get', async () => {
          const result = await browser.storage.sync.get(keys);
          if (browser.runtime.lastError) {
            throw new Error(`Storage get error: ${browser.runtime.lastError.message}`);
          }
          return result || {};
        });
      },

      set: async (items) => {
        validateStorageItems(items);
        return trackAPIPerformance('storage', 'sync.set', async () => {
          await browser.storage.sync.set(items);
          if (browser.runtime.lastError) {
            throw new Error(`Storage set error: ${browser.runtime.lastError.message}`);
          }
        });
      },

      remove: async (keys) => {
        validateStorageKey(keys);
        return trackAPIPerformance('storage', 'sync.remove', async () => {
          await browser.storage.sync.remove(keys);
          if (browser.runtime.lastError) {
            throw new Error(`Storage remove error: ${browser.runtime.lastError.message}`);
          }
        });
      },

      clear: async () => {
        return trackAPIPerformance('storage', 'sync.clear', async () => {
          await browser.storage.sync.clear();
          if (browser.runtime.lastError) {
            throw new Error(`Storage clear error: ${browser.runtime.lastError.message}`);
          }
        });
      }
    },

    local: {
      get: async (keys) => {
        validateStorageKey(keys);
        return trackAPIPerformance('storage', 'local.get', async () => {
          const result = await browser.storage.local.get(keys);
          if (browser.runtime.lastError) {
            throw new Error(`Local storage get error: ${browser.runtime.lastError.message}`);
          }
          return result || {};
        });
      },

      set: async (items) => {
        validateStorageItems(items);
        return trackAPIPerformance('storage', 'local.set', async () => {
          await browser.storage.local.set(items);
          if (browser.runtime.lastError) {
            throw new Error(`Local storage set error: ${browser.runtime.lastError.message}`);
          }
        });
      },

      remove: async (keys) => {
        validateStorageKey(keys);
        return trackAPIPerformance('storage', 'local.remove', async () => {
          await browser.storage.local.remove(keys);
          if (browser.runtime.lastError) {
            throw new Error(`Local storage remove error: ${browser.runtime.lastError.message}`);
          }
        });
      },

      clear: async () => {
        return trackAPIPerformance('storage', 'local.clear', async () => {
          await browser.storage.local.clear();
          if (browser.runtime.lastError) {
            throw new Error(`Local storage clear error: ${browser.runtime.lastError.message}`);
          }
        });
      }
    }
  },

  runtime: {
    sendMessage: async (message, options = {}) => {
      if (!message || typeof message !== 'object') {
        throw new TypeError('Message must be an object');
      }
      
      return trackAPIPerformance('runtime', 'sendMessage', async () => {
        const response = await browser.runtime.sendMessage(message, options);
        if (browser.runtime.lastError) {
          throw new Error(`Message send error: ${browser.runtime.lastError.message}`);
        }
        return response;
      });
    },

    connect: (connectInfo = {}) => {
      try {
        if (connectInfo && typeof connectInfo !== 'object') {
          throw new TypeError('Connection info must be an object');
        }

        const port = browser.runtime.connect(connectInfo);
        
        if (browser.runtime.lastError) {
          throw new Error(`Connection error: ${browser.runtime.lastError.message}`);
        }
        
        return port;
      } catch (error) {
        throw new Error(`Connection failed: ${error.message}`);
      }
    }
  },

  tabs: {
    query: async (queryInfo = {}) => {
      if (typeof queryInfo !== 'object') {
        throw new TypeError('Query info must be an object');
      }

      return trackAPIPerformance('tabs', 'query', async () => {
        const tabs = await browser.tabs.query(queryInfo);
        if (browser.runtime.lastError) {
          throw new Error(`Tab query error: ${browser.runtime.lastError.message}`);
        }
        return tabs;
      });
    },

    update: async (tabId, updateProperties) => {
      if (!updateProperties || typeof updateProperties !== 'object') {
        throw new TypeError('Update properties must be an object');
      }

      return trackAPIPerformance('tabs', 'update', async () => {
        const tab = await browser.tabs.update(tabId, updateProperties);
        if (browser.runtime.lastError) {
          throw new Error(`Tab update error: ${browser.runtime.lastError.message}`);
        }
        return tab;
      });
    }
  }
};

// Add performance metrics reporting
export const getAPIMetrics = () => {
  const metrics = {};
  
  for (const [category, data] of Object.entries(API_METRICS)) {
    const samples = Array.from(data.samples.values());
    const durations = samples.map(s => s.duration);
    
    metrics[category] = {
      avgDuration: durations.reduce((a, b) => a + b, 0) / durations.length,
      maxDuration: Math.max(...durations),
      minDuration: Math.min(...durations),
      sampleCount: samples.length,
      thresholdBreaches: samples.filter(s => s.duration > data.threshold).length,
      operations: Object.groupBy(samples, s => s.operation)
    };
  }
  
  return metrics;
};

// Add metrics cleanup
setInterval(() => {
  const cutoff = Date.now() - 3600000; // 1 hour
  for (const metric of Object.values(API_METRICS)) {
    for (const [timestamp] of metric.samples) {
      if (timestamp < cutoff) metric.samples.delete(timestamp);
    }
  }
}, 300000); // Clean every 5 minutes