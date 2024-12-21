// utils/logger.js
import { ERROR_CATEGORIES, TELEMETRY_CONFIG, CONFIG, LOG_LEVELS, LOG_CATEGORIES } from './constants.js';
import browser from 'webextension-polyfill';

// Add default logging preferences
const DEFAULT_PREFERENCES = Object.freeze({
  level: 'production' === 'production' ? LOG_LEVELS.ERROR : LOG_LEVELS.DEBUG,
  categories: new Set([
    LOG_CATEGORIES.SECURITY,
    LOG_CATEGORIES.PERFORMANCE,
    LOG_CATEGORIES.STATE
  ]),
  persistence: true,
  sampling: {
    enabled: true,
    rate: 0.1 // 10% sampling for verbose categories
  }
});

class Logger {
  constructor() {
    // Initialize samplingConfig before it's used
    this.samplingConfig = {
      operationCounts: new Map(),
      highFrequencyThreshold: CONFIG.THRESHOLDS.PERFORMANCE_WARNING || 16.67,
      metricsWindow: CONFIG.METRICS.REPORTING_INTERVAL || 300000,
      sampleRate: 0.1
    };

    this.preferences = { 
      ...DEFAULT_PREFERENCES,
      level: DEFAULT_PREFERENCES.level // Ensure level is initialized without process.env
    };
    this.logs = new Map();
    this.errorCounts = new Map();
    this.performanceMetrics = new Map();
    this.categoryMetrics = new Map();

    // Add persistence config
    this.persistConfig = {
      enabled: true,
      maxStorageSize: 5 * 1024 * 1024, // 5MB
      retentionDays: 7,
      persistenceKey: 'debug_logs'
    };

    // Add telemetry retry config
    this.telemetryConfig = {
      maxRetries: 3,
      baseDelay: 1000,
      maxDelay: 10000,
    };

    this.initialize();
  }

  async initialize() {
    try {
      await this._cleanupOldLogs();
      
      // Restore error counts and metrics from storage
      const stored = await browser.storage.local.get(['errorCounts', 'metrics']);
      if (stored.errorCounts) {
        this.errorCounts = new Map(Object.entries(stored.errorCounts));
      }
      if (stored.metrics) {
        this.performanceMetrics = new Map(Object.entries(stored.metrics));
      }
    } catch (error) {
      console.error('Logger storage initialization failed:', error);
    }
  }

  async _initializePreferences() {
    try {
      const stored = await browser.storage.local.get('loggerPreferences');
      if (stored.loggerPreferences) {
        this.updatePreferences(stored.loggerPreferences);
      }

      // Listen for preference changes
      browser.storage.onChanged.addListener((changes) => {
        if (changes.loggerPreferences) {
          this.updatePreferences(changes.loggerPreferences.newValue);
        }
      });
    } catch (error) {
      console.error('Failed to initialize logger preferences:', error);
    }
  }

  async updatePreferences(newPreferences) {
    const oldPreferences = { ...this.preferences };
    
    try {
      // Validate and merge new preferences
      this.preferences = {
        ...this.preferences,
        ...newPreferences,
        categories: new Set([...newPreferences.categories])
      };

      if (this.preferences.persistence) {
        await browser.storage.local.set({
          loggerPreferences: this.preferences
        });
      }

      // Log preference changes if logging is still enabled
      if (this.shouldLog('info', LOG_CATEGORIES.STATE)) {
        this.info('Logger preferences updated', {
          old: oldPreferences,
          new: this.preferences
        });
      }
    } catch (error) {
      console.error('Failed to update logger preferences:', error);
      this.preferences = oldPreferences; // Rollback on failure
    }
  }

  shouldLog(level, category) {
    // Check logging level
    if (LOG_LEVELS[level.toUpperCase()] > this.preferences.level) {
      return false;
    }

    // Check if category is enabled
    if (category && !this.preferences.categories.has(category)) {
      return false;
    }

    // Apply sampling for verbose categories if enabled
    if (this.preferences.sampling.enabled && 
        level === 'debug' && 
        Math.random() > this.preferences.sampling.rate) {
      return false;
    }

    return true;
  }

  async _persistLogs(entry) {
    if (!this.persistConfig.enabled) return;

    try {
      const key = `log_${Date.now()}`;
      const storedLogs = await browser.storage.local.get(this.persistConfig.persistenceKey);
      const logs = storedLogs[this.persistConfig.persistenceKey] || [];
      
      logs.unshift({
        ...entry,
        persistedAt: Date.now()
      });

      // Keep logs within size limit
      let totalSize = 0;
      const logsToKeep = logs.filter(log => {
        totalSize += JSON.stringify(log).length;
        return totalSize <= this.persistConfig.maxStorageSize;
      });

      await browser.storage.local.set({
        [this.persistConfig.persistenceKey]: logsToKeep
      });
    } catch (error) {
      console.error('Failed to persist log:', error);
    }
  }

  async _cleanupOldLogs() {
    try {
      const cutoff = Date.now() - (this.persistConfig.retentionDays * 86400000);
      const stored = await browser.storage.local.get(this.persistConfig.persistenceKey);
      const logs = stored[this.persistConfig.persistenceKey] || [];
      
      const filteredLogs = logs.filter(log => log.timestamp > cutoff);
      
      if (filteredLogs.length < logs.length) {
        await browser.storage.local.set({
          [this.persistConfig.persistenceKey]: filteredLogs
        });
      }
    } catch (error) {
      console.error('Log cleanup failed:', error);
    }
  }

  async _notifyTelemetry(data) {
    if (!window.telemetry) return;

    const retryId = crypto.randomUUID();
    let attempt = 0;

    const attemptSubmission = async () => {
      try {
        await window.telemetry.send({
          ...data,
          timestamp: Date.now(),
          retryId
        });
        this.telemetryConfig.pendingRetries.delete(retryId);
      } catch (error) {
        attempt++;
        if (attempt < this.telemetryConfig.maxRetries) {
          // Calculate delay with exponential backoff and jitter
          const delay = Math.min(
            this.telemetryConfig.baseDelay * Math.pow(2, attempt) * (0.75 + Math.random() * 0.5),
            this.telemetryConfig.maxDelay
          );

          this.telemetryConfig.pendingRetries.set(retryId, {
            data,
            attempt,
            nextRetry: Date.now() + delay
          });

          setTimeout(() => attemptSubmission(), delay);
        } else {
          this.error('Telemetry submission failed', {
            error: error.message,
            data,
            attempts: attempt
          });
        }
      }
    };

    await attemptSubmission();
  }

  log(level, message, context = {}) {
    const supportedLevels = ['error', 'warn', 'info', 'debug', 'log'];
    const method = supportedLevels.includes(level) ? level : 'error'; // Map unsupported levels to 'error'

    if (!this.shouldLog(level, context.category)) {
      return;
    }

    const entry = {
      timestamp: Date.now(),
      level,
      message,
      context: {
        ...context,
        environment: 'production' // Removed process.env.NODE_ENV
      }
    };

    this._storeLog(entry);
    this._updateCategoryMetrics(context.category, level);
    this._checkThresholds(entry);

    // Only output to console if not sampled out
    if (!this.preferences.sampling.enabled || 
        Math.random() <= this.preferences.sampling.rate) {
      console[method](message, context); // Use the mapped console method
    }
  }

  error(message, context = {}) {
    // Enhance error context
    const enhancedContext = {
      ...context,
      category: context.category || LOG_CATEGORIES.STATE,
      severity: context.severity || ERROR_CATEGORIES.SEVERITY.HIGH,
      timestamp: Date.now(),
      stack: new Error().stack,
      // Removed process.memoryUsage()
      activeOperations: Array.from(this.samplingConfig.operationCounts.entries())
        .map(([op, stats]) => ({
          operation: op,
          opsPerSecond: (stats.count / (stats.lastOp - stats.firstOp)) * 1000
        }))
    };

    this.log('error', message, enhancedContext);
    this._persistLogs({
      level: 'error',
      message,
      context: enhancedContext
    });
  }

  critical(message, context = {}) {
    this.log('critical', message, context);
  }

  warn(message, context = {}) {
    this.log('warn', message, context);
  }

  info(message, context = {}) {
    this.log('info', message, context);
  }

  debug(message, context = {}) {
    this.log('debug', message, context);
  }

  logPerformance(operation, duration, context = {}) {
    this.log('info', `Performance: ${operation}`, {
      ...context,
      category: LOG_CATEGORIES.PERFORMANCE,
      duration
    });
  }

  logSecurity(message, context = {}) {
    this.log('warn', message, {
      ...context,
      category: LOG_CATEGORIES.SECURITY
    });
  }

  logState(message, context = {}) {
    this.log('info', message, {
      ...context,
      category: LOG_CATEGORIES.STATE
    });
  }

  _storeLog(entry) {
    const key = `${entry.level}_${entry.context.type || 'general'}`;
    const entries = this.logs.get(key) || [];
    entries.unshift(entry);
    entries.splice(TELEMETRY_CONFIG.MAX_ENTRIES); // Keep limited history
    this.logs.set(key, entries);
  }

  _incrementErrorCount(type) {
    const count = this.errorCounts.get(type) || 0;
    this.errorCounts.set(type, count + 1);
  }

  _storePerformanceMetric(metric) {
    const { operation, duration, timestamp, context } = metric;
    
    // Check if operation is high frequency
    const operationStats = this.samplingConfig.operationCounts.get(operation) || {
      count: 0,
      firstOp: timestamp,
      lastOp: timestamp
    };

    operationStats.count++;
    operationStats.lastOp = timestamp;
    this.samplingConfig.operationCounts.set(operation, operationStats);

    // Calculate operations per second
    const timeWindow = operationStats.lastOp - operationStats.firstOp;
    const opsPerSecond = timeWindow > 0 ? 
      (operationStats.count / timeWindow) * 1000 : 
      0;

    // Apply sampling for high-frequency operations
    if (opsPerSecond > this.samplingConfig.highFrequencyThreshold) {
      if (Math.random() > this.samplingConfig.sampleRate) {
        return; // Skip this sample
      }
    }

    // Reset counter for next window if needed
    if (timestamp - operationStats.firstOp > this.samplingConfig.metricsWindow) {
      operationStats.count = 1;
      operationStats.firstOp = timestamp;
    }

    const metrics = this.performanceMetrics.get(operation) || {
      count: 0,
      totalDuration: 0,
      samples: [],
      samplingEnabled: opsPerSecond > this.samplingConfig.highFrequencyThreshold
    };

    metrics.count++;
    metrics.totalDuration += duration;
    metrics.samples.unshift({
      duration,
      timestamp,
      context,
      sampled: metrics.samplingEnabled
    });

    // Keep limited samples with preference for recent and outliers
    if (metrics.samples.length > TELEMETRY_CONFIG.SAMPLE_SIZE) {
      // Keep first/last samples and outliers
      const sorted = metrics.samples
        .slice(1, -1)
        .sort((a, b) => b.duration - a.duration);
      
      metrics.samples = [
        metrics.samples[0],
        ...sorted.slice(0, TELEMETRY_CONFIG.SAMPLE_SIZE - 2),
        metrics.samples[metrics.samples.length - 1]
      ];
    }

    this.performanceMetrics.set(operation, metrics);
  }

  _checkThresholds(entry) {
    if (entry.level === 'error') {
      const count = this.errorCounts.get(entry.context.type) || 0;
      if (count >= TELEMETRY_CONFIG.ERROR_THRESHOLD) {
        this._notifyTelemetry({
          type: 'ERROR_THRESHOLD_EXCEEDED',
          errorType: entry.context.type,
          count
        });
      }
    }
  }

  _checkPerformanceThresholds(metric) {
    const metrics = this.performanceMetrics.get(metric.operation);
    const avgDuration = metrics.totalDuration / metrics.count;

    if (avgDuration > TELEMETRY_CONFIG.PERFORMANCE_THRESHOLD) {
      this._notifyTelemetry({
        type: 'PERFORMANCE_THRESHOLD_EXCEEDED',
        operation: metric.operation,
        avgDuration
      });
    }
  }

  _updateCategoryMetrics(category, level) {
    if (!category) return;

    const metrics = this.categoryMetrics.get(category) || {
      counts: {},
      lastUpdate: Date.now()
    };

    metrics.counts[level] = (metrics.counts[level] || 0) + 1;
    this.categoryMetrics.set(category, metrics);

    // Cleanup old metrics periodically
    this._cleanupMetricsIfNeeded();
  }

  _cleanupMetricsIfNeeded() {
    const now = Date.now();
    if (now - this._lastMetricsCleanup > CONFIG.TELEMETRY.REPORTING_INTERVAL) {
      this._lastMetricsCleanup = now;
      this._reportAndCleanupMetrics();
    }
  }

  async _reportAndCleanupMetrics() {
    const metrics = {};
    
    for (const [category, data] of this.categoryMetrics) {
      metrics[category] = {
        ...data.counts,
        timeSinceUpdate: Date.now() - data.lastUpdate
      };
    }

    // Report metrics if significant logging activity
    if (Object.keys(metrics).length > 0) {
      await this._notifyTelemetry({
        type: 'LOGGING_METRICS',
        metrics,
        timestamp: Date.now()
      });
    }

    this.categoryMetrics.clear();
  }

  getErrorCounts() {
    return Object.fromEntries(this.errorCounts);
  }

  getPerformanceMetrics() {
    return Object.fromEntries(
      Array.from(this.performanceMetrics.entries()).map(([key, value]) => [
        key,
        {
          count: value.count,
          avgDuration: value.totalDuration / value.count,
          recentSamples: value.samples
        }
      ])
    );
  }

  // Add method to retrieve persisted logs
  async getStoredLogs(options = {}) {
    const { 
      startTime = 0, 
      endTime = Date.now(),
      levels = ['error', 'warn', 'info', 'debug'],
      limit = 1000
    } = options;

    try {
      const stored = await browser.storage.local.get(this.persistConfig.persistenceKey);
      const logs = stored[this.persistConfig.persistenceKey] || [];

      return logs
        .filter(log => 
          log.timestamp >= startTime &&
          log.timestamp <= endTime &&
          levels.includes(log.level)
        )
        .slice(0, limit);
    } catch (error) {
      console.error('Failed to retrieve stored logs:', error);
      return [];
    }
  }

  // Add category management methods
  enableCategory(category) {
    if (LOG_CATEGORIES[category]) {
      this.preferences.categories.add(category);
      this._persistPreferences();
    }
  }

  disableCategory(category) {
    this.preferences.categories.delete(category);
    this._persistPreferences();
  }

  setCategoryLevel(category, level) {
    if (!LOG_CATEGORIES[category] || !LOG_LEVELS[level]) {
      return false;
    }
    
    this.preferences.categoryLevels = {
      ...this.preferences.categoryLevels,
      [category]: LOG_LEVELS[level]
    };
    
    this._persistPreferences();
    return true;
  }

  async _persistPreferences() {
    if (!this.preferences.persistence) return;

    try {
      await browser.storage.local.set({
        loggerPreferences: {
          ...this.preferences,
          categories: Array.from(this.preferences.categories)
        }
      });
    } catch (error) {
      console.error('Failed to persist logger preferences:', error);
    }
  }

  // Add logging statistics
  getStatistics() {
    return {
      preferences: {
        level: this.preferences.level,
        enabledCategories: Array.from(this.preferences.categories),
        sampling: this.preferences.sampling
      },
      metrics: Object.fromEntries(this.categoryMetrics),
      errorCounts: Object.fromEntries(this.errorCounts),
      performance: this.getPerformanceMetrics()
    };
  }

  info(message, meta) {
    console.info(`[INFO] ${message}`, meta);
  }

  error(message, meta) {
    console.error(`[ERROR] ${message}`, meta);
  }

  warn(message, meta) {
    console.warn(`[WARN] ${message}`, meta);
  }

  debug(message, meta) {
    console.debug(`[DEBUG] ${message}`, meta);
  }

  logPerformance(type, duration, meta) {
    console.log(`[Performance] ${type}: ${duration}ms`, meta);
  }
}

const logger = new Logger();
export { logger };