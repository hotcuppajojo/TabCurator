// utils/connectionManager.js
/**
 * @fileoverview Connection Manager - Manages messaging between extension components
 * Uses core modules for constants, error handling, and validation.
 */

import browser from 'webextension-polyfill';
import {
  MESSAGE_TYPES,
  ACTION,
  CONFIG,
  ERROR_CATEGORIES,
  ERROR_TYPES,
  LOG_CATEGORIES,
  LOG_LEVELS,
  MESSAGES,
  MESSAGE_TEMPLATES,
  CONNECTION_STATES,
  formatMessage,
  VALIDATION_SCHEMAS,
  validateMessage,
  validateArgs,
  recordTelemetry,
  recordPerformance,
  TELEMETRY_EVENTS,
  flushTelemetry,
  isTelemetryEnabled,
  setTelemetryEnabled,
  PERMISSION_SCHEMAS // Add this import
} from './core/index.js';
import { logger } from './logger.js';
import { PERMISSIONS } from './core/permission.js';
import { selectors } from './core/state.js';

/**
 * ConnectionManager class handles communication between different parts of the extension
 * @class ConnectionManager
 */
class ConnectionManager {
  /**
   * Creates a new ConnectionManager instance or returns existing singleton
   */
  constructor() {
    if (ConnectionManager.instance) return ConnectionManager.instance;
    
    this.initialized = false;
    this.connections = new Map();
    this.ports = new Map();
    this.stateManager = null;
    this.connectionState = {
      state: CONNECTION_STATES.INITIALIZE,
      isReady: false,
      backgroundInitialized: false,
      reconnectTimeout: null
    };
    
    // Use METRICS.REPORTING_INTERVAL for telemetry flush
    this._metricsInterval = setInterval(
      () => this._reportMetrics(),
      CONFIG.METRICS.REPORTING_INTERVAL
    );

    // Use TIMEOUTS.CLEANUP for stale connection pruning
    this._cleanupInterval = setInterval(
      () => this._cleanupConnections(),
      CONFIG.TIMEOUTS.CLEANUP
    );

    // Batch config
    this.batchFlushSize = CONFIG.BATCH.FLUSH_SIZE;
    this.batchTimeout = CONFIG.BATCH.TIMEOUT;

    // Inactivity threshold for auto‐disconnect
    this.inactivityThreshold = CONFIG.INACTIVITY_THRESHOLDS.SUSPEND;

    // Annotate service type
    this.connectionState.serviceType = CONFIG.SERVICE_TYPES.BACKGROUND;
    
    // derive connection name from CONFIG or fall back to a sensible default
    // prefer an explicit SERVICE_NAME, otherwise use a background-service identifier
    this.connectionName = CONFIG.SERVICE_NAME || `${CONFIG.SERVICE_TYPES.BACKGROUND}-connection`;

    // Retry config
    this.retries = {
      delays: CONFIG.RETRY.DELAYS,
      maxAttempts: CONFIG.RETRY.MAX_ATTEMPTS,
      jitter: CONFIG.RETRY.JITTER_RANGE
    };

    // Timeouts for connect/send
    this.timeouts = {
      connection: CONFIG.TIMEOUTS.CONNECTION,
      message:    CONFIG.TIMEOUTS.MESSAGE
    };
    
    // schedule periodic telemetry flush
    setInterval(() => {
      if (isTelemetryEnabled()) {
        flushTelemetry();
      }
    }, CONFIG.TELEMETRY.FLUSH_INTERVAL);

    // initialize telemetry enabled state
    setTelemetryEnabled(true);
    this.selectors = selectors;

    ConnectionManager.instance = this;
  }

  /**
   * Initializes the connection manager with stateManager
   * @param {Object} stateManager - StateManager instance
   * @returns {Promise<boolean>} - True if successfully initialized
   */
  async initialize(stateManager) {
    try {
      // validate that a proper StateManager is provided
      validateArgs('initialize', [stateManager], PERMISSION_SCHEMAS.initialize);
    } catch (err) {
      logger.error('Initialization arguments invalid', {
        error: err.message,
        category: LOG_CATEGORIES.STATE,
        severity: ERROR_CATEGORIES.CRITICAL.VALIDATION,
        type: ERROR_TYPES.INVALID_MESSAGE
      });
      throw new ValidationError(`initialize: ${err.message}`);
    }
    
    if (this.initialized) return true;
    
    if (!stateManager?.store || !stateManager.initialized) {
      throw new Error('Valid initialized StateManager instance required');
    }
    
    this.stateManager = stateManager;

    // Announce extension connection readiness
    this.stateManager.dispatch({
      type: ACTION.STATE.INITIALIZE,
      payload: { timestamp: Date.now() }
    });

    // Ensure core permissions at startup
    for (const perm of [
      PERMISSIONS.TABS,
      PERMISSIONS.STORAGE,
      PERMISSIONS.BOOKMARKS,
      PERMISSIONS.ACTIVE_TAB
    ]) {
      if (browser.permissions && !await browser.permissions.contains({ permissions: [perm] })) {
        await browser.permissions.request({ permissions: [perm] });
      }
    }

    this.messageHandlers = this._setupMessageHandlers();
    
    // Setup browser event listeners
    listenForMessages((message, sender, sendResponse) => {
      this.handleMessage(message, sender)
        .then(response => sendResponse(response))
        .catch(err => sendResponse({ error: err.message }));
    });

    this.initialized = true;

    // mark app as initialized in the global state
    this.stateManager.dispatch({
      type: STATE.APP.INITIALIZED,
      payload: { timestamp: Date.now() }
    });

    logger.info('Connection manager initialized', { initialized: true });
    recordTelemetry(TELEMETRY_EVENTS.PERFORMANCE, { 
      operation: 'CONNECTION_MANAGER_INIT', 
      success: true 
    });
    // Announce connection-manager ready
    logger.info(formatMessage(MESSAGES.CONNECTION.ESTABLISHED));
    // Ensure bookmark folder is ready at startup
    await initializeBookmarkFolder();

    // ensure bookmarks permission for any future bookmark operations
    if (browser.permissions) {
      const hasBookmark = await browser.permissions.contains({
        permissions: [PERMISSIONS.BOOKMARKS]
      });
      if (!hasBookmark) {
        await browser.permissions.request({
          permissions: [PERMISSIONS.BOOKMARKS]
        });
      }
    }

    // Schedule periodic state sync using SYNC timeout
    setInterval(() => this.syncState(), CONFIG.TIMEOUTS.SYNC);

    // record that connectionManager has initialized
    if (isTelemetryEnabled()) {
recordTelemetry(TELEMETRY_EVENTS.PERFORMANCE, {
        operation: 'connectionManager.initialize',
        timestamp: Date.now()
      });
    }

    return true;
  }

  /**
   * Sets up message handlers mapped by message type
   * @private
   * @returns {Object} Map of message types to handler functions
   */
  _setupMessageHandlers() {
    const { TAB, SESSION, TAG, STATE: ACTION_STATE } = ACTION;
    return {
      [MESSAGE_TYPES.STATE_SYNC]: async () => {
        // Use STATE.SYNC to mark sync start
        this.stateManager.dispatch({ type: STATE.SYNC });
        await this.stateManager.syncWithServiceWorker();
        return { success: true };
      },

      [MESSAGE_TYPES.STATE_UPDATE]: async ({ payload }) => {
        // Reset to new state snapshot
        this.stateManager.dispatch({ type: STATE.RESET, payload });
        return { success: true };
      },

      [MESSAGE_TYPES.TAB_ACTION]: async (message) => {
        // ensure tabs permission
        if (browser.permissions && !await browser.permissions.contains({ permissions: [PERMISSIONS.TABS] })) {
          await browser.permissions.request({ permissions: [PERMISSIONS.TABS] });
        }
        const { action, payload } = message;
        if (!Object.values(TAB).includes(action)) {
          return { error: `Invalid tab action: ${action}` };
        }
        // Log/record the tab action
        this.stateManager.dispatch({ type: action, payload });
        return this.stateManager.handleTabAction(message);
      },

      [MESSAGE_TYPES.SESSION_ACTION]: async (message) => {
        // ensure storage permission
        if (browser.permissions && !await browser.permissions.contains({ permissions: [PERMISSIONS.STORAGE] })) {
          await browser.permissions.request({ permissions: [PERMISSIONS.STORAGE] });
        }
        const { action, payload } = message;
        if (!Object.values(SESSION).includes(action)) {
          return { error: `Invalid session action: ${action}` };
        }
        this.stateManager.dispatch({ type: action, payload });
        return this.stateManager.handleSessionAction(message);
      },

      [MESSAGE_TYPES.TAG_ACTION]: async (message) => {
        const { action, payload } = message;
        if (!Object.values(TAG).includes(action)) {
          return { error: `Invalid tag action: ${action}` };
        }
        this.stateManager.dispatch({ type: action, payload });
        return this.stateManager.handleTagAction(message);
      },

      [MESSAGE_TYPES.GET_SESSIONS]: async () => {
        // use selector to retrieve sessions
        const allSessions = this.selectors.selectSessions(this.stateManager.getState());
        return { sessions: allSessions };
      },

      // add GET_SETTINGS to expose current settings via state selectors
      [MESSAGE_TYPES.CONFIG_UPDATE]: async () => {
        const settings = this.selectors.selectSettings(this.stateManager.getState());
        return { settings };
      },

      // Support bookmark operations via a new message type
      [MESSAGE_TYPES.BOOKMARK_ACTION]: async (message) => {
        // ensure bookmarks permission
        if (browser.permissions && !await browser.permissions.contains({ permissions: [PERMISSIONS.BOOKMARKS] })) {
          await browser.permissions.request({ permissions: [PERMISSIONS.BOOKMARKS] });
        }
        const { action, payload } = message;
        switch (action) {
          case ACTION.TAB.BOOKMARK:
            const folderId = await getOrCreateBookmarkFolder();
            const bm = await addBookmark({
              parentId: folderId,
              title: payload.title,
              url: payload.url
            });
            return { success: !!bm, bookmarkId: bm?.id };

          case ACTION.TAB.REMOVE:
            await removeBookmark(payload.bookmarkId);
            return { success: true };

          case ACTION.TAB.SEARCH:
            const results = await searchBookmarks({ url: payload.url });
            return { success: true, results };

          default:
            return { error: `Unhandled bookmark action: ${action}` };
        }
      }
    };
  }

  /**
   * Handles messages from runtime.onMessage
   * @private
   * @param {Object} message - Message object
   * @param {Object} sender - Sender information
   * @param {Function} sendResponse - Function to send response
   * @returns {boolean} - True to keep the message channel open
   */
  _handleRuntimeMessage(message, sender, sendResponse) {
    const handleAsync = async () => {
      try {
        const start = performance.now();
        const response = await this.handleMessage(message, sender);
        recordPerformance('handleRuntimeMessage', performance.now() - start);
        sendResponse(response);
      } catch (error) {
        logger.error('Error handling message:', error);
        sendResponse({ error: error.message || 'Unknown error' });
      }
    };

    handleAsync();
    return true; // Keep message channel open for async response
  }

  /**
   * Handles new port connections
   * @private
   * @param {Object} port - Connection port
   */
  _handleConnect(port) {
    const connId = `conn-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    this.ports.set(connId, port);
    
    logger.info('New connection', { connectionId: connId, name: port.name });
    
    port.onMessage.addListener((message) => {
      this.handleMessage(message, { port }).then(response => {
        try {
          port.postMessage(response);
        } catch (error) {
          logger.error('Error sending response:', error);
        }
      });
    });
    
    port.onDisconnect.addListener(() => {
      this._handleDisconnect(connId);
    });
  }

  /**
   * Handles port disconnection
   * @private
   * @param {string} connId - Connection ID
   */
  _handleDisconnect(connId) {
    this.ports.delete(connId);
    logger.info('Connection disconnected', { connectionId: connId });
    // Notify user of lost connection
    logger.warn(formatMessage(MESSAGES.CONNECTION.LOST), { connectionId: connId });
  }

  /**
   * Handles incoming messages and routes them to appropriate handlers
   * @param {Object} message - Message to handle
   * @param {Object} sender - Sender information
   * @returns {Promise<Object>} - Response object
   */
  async handleMessage(message, sender) {
    // validate incoming message shape
    VALIDATION_SCHEMAS.message.validateSync(message);

    const start = performance.now();
    
    try {
      logger.debug('Received message:', { type: message.type, action: message.action });
      
      // Special case for initialization check
      if (message.type === MESSAGE_TYPES.INIT_CHECK) {
        return { initialized: this.initialized };
      }

      // Validate message structure
      try {
        await validateMessage(message);
      } catch (error) {
        logger.warn('Invalid message received:', { message, error: error.message });
        return { error: `Invalid message: ${error.message}` };
      }
      
      // Find appropriate handler for message type
      const handler = this.messageHandlers[message.type];
      if (!handler) {
        logger.warn('No handler for message type:', { type: message.type });
        return { error: `No handler for message type: ${message.type}` };
      }
      
      // Execute handler
      const response = await handler(message, sender);
      
      // record healthy message handling performance
      if (isTelemetryEnabled()) {
        recordPerformance('handleMessage', performance.now() - start, {
          messageType: message.type
        });
      }
      
      return response;
    } catch (error) {
      logger.error('Error handling message:', {
        error: error.message,
        stack: error.stack,
        message: {
          type: message.type,
          action: message.action
        }
      });
      
      recordTelemetry(TELEMETRY_EVENTS.ERROR, {
        area: 'connectionManager.handleMessage',
        error: error.message,
        messageType: message.type
      });
      
      // On error, dispatch a recover action
      this.stateManager.dispatch({
        type: ACTION.STATE.RECOVER,
        payload: { error: error.message }
      });
      
      // record an app‐level error state
      this.stateManager.dispatch({
        type: STATE.APP.ERROR,
        payload: { error: error.message }
      });
      
      return { error: error.message || 'Unknown error' };
    }
  }

  /**
   * Sends a message via runtime messaging
   * @param {Object} message - Message to send
   * @returns {Promise<Object>} - Response from receiver
   */
  async sendMessage(message) {
    const start = performance.now();
    // validate outgoing message shape
    VALIDATION_SCHEMAS.message.validateSync(message);

    try {
      // Validate message structure
      await validateMessage(message);
      
      // Validate action if present
      if (message.action) {
        const allActions = [
          ...Object.values(ACTION.TAB),
          ...Object.values(ACTION.SESSION),
          ...Object.values(ACTION.TAG),
          ...Object.values(ACTION.STATE)
        ];
        
        if (!allActions.includes(message.action)) {
          throw new Error(`Invalid action: ${message.action}`);
        }
      }
      
      // Add timeout from config
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Message sending timed out')), this.timeouts.message);
      });
      
      // Race the actual sending with a timeout
      const result = await Promise.race([
        sendMessageToBackground(message),
        timeoutPromise
      ]);

      // record send performance
      if (isTelemetryEnabled()) {
        recordPerformance('sendMessage', performance.now() - start, {
          messageType: message.type
        });
      }

      return result;
    } catch (err) {
      if (err instanceof ValidationError) {
        // already a ValidationError
        throw err;
      }
      const isTimeout = err.message.includes('timed out');
      const category = isTimeout ? ERROR_CATEGORIES.TRANSIENT.TIMEOUT : ERROR_CATEGORIES.CRITICAL.API;
      const type = isTimeout ? ERROR_TYPES.CONNECTION_ERROR : ERROR_TYPES.API_UNAVAILABLE;

      logger.error('sendMessage error', {
        error: err.message,
        category,
        severity: category === ERROR_CATEGORIES.TRANSIENT.TIMEOUT ? ERROR_CATEGORIES.SEVERITY.MEDIUM : ERROR_CATEGORIES.SEVERITY.HIGH,
        type
      });
      // record send error
      if (isTelemetryEnabled()) {
        recordTelemetry(TELEMETRY_EVENTS.ERROR, {
          event: 'sendMessage_error',
          messageType: message.type,
          error: err.message
        });
      }
      throw new APIError(`sendMessage failed: ${err.message}`);
    }
  }

  /**
   * Broadcasts a message to all connected ports
   * @param {Object} message - Message to broadcast
   * @returns {Promise<Array>} - Array of responses or errors
   */
  async broadcastMessage(message) {
    // validate broadcast message shape
    VALIDATION_SCHEMAS.message.validateSync(message);

    try {
      // validate with core helper
      coreValidateMessage(message);
      // delegate to core broadcast
      return await coreBroadcastMessage(message);
    } catch (error) {
      logger.error('Error broadcasting message:', error);
      throw error;
    }
  }

  /**
   * Creates a new connection to the background script
   * @returns {Promise<Object>} - Connection details
   */
  async connect() {
    // record connection attempt
    if (isTelemetryEnabled()) {
      recordTelemetry('CONNECTION_ATTEMPT', { timestamp: Date.now() });
    }

    try {
      // use core connectToBackground
      const port = connectToBackground(this.connectionName);
      const connectionId = `client-${Date.now()}`;
      this.connections.set(connectionId, { port, connected: Date.now() });

      // update state
      this.connectionState.state = CONNECTION_STATES.READY;
      this.connectionState.isReady = true;
      // User‐facing log for successful connection
      logger.info(formatMessage(MESSAGES.CONNECTION.ESTABLISHED), { connectionId });

      // record success
      if (isTelemetryEnabled()) {
        recordTelemetry(TELEMETRY_EVENTS.PERFORMANCE, {
          operation: 'connect',
          success: true,
          duration: Date.now() - start
        });
      }

      return { connectionId, success: true };
    } catch (error) {
      // record failure
      if (isTelemetryEnabled()) {
        recordTelemetry(TELEMETRY_EVENTS.ERROR, {
          event: 'connect_failed',
          error: error.message
        });
      }
      // Timeout vs. generic failure message
      if (error.message.includes('timed out')) {
        logger.error(formatMessage(MESSAGES.CONNECTION.TIMEOUT), { error: error.message });
      } else {
        logger.error(formatMessage(MESSAGES.CONNECTION.FAILED), { error: error.message });
      }
      this.connectionState.state = CONNECTION_STATES.ERROR;
      recordTelemetry(TELEMETRY_EVENTS.CONNECTION_FAILED, { error: error.message });
      throw new APIError(`Connection failed: ${error.message}`);
    }
  }

  /**
   * Periodically reports metrics to telemetry service
   * @private
   */
  _reportMetrics() {
    if (!isTelemetryEnabled()) return;
    
    try {
      const metrics = {
        activeConnections: this.ports.size,
        messageQueue: this.connections.size,
        state: this.connectionState.state,
        timestamp: Date.now()
      };
      
      recordTelemetry(TELEMETRY_EVENTS.CONNECTION_METRICS, metrics);
      logger.debug('Connection metrics reported', metrics);
    } catch (error) {
      logger.error('Failed to report metrics', { error: error.message });
    }
  }

  /**
   * Cleans up stale connections based on inactivity threshold
   * @private
   */
  _cleanupConnections() {
    const now = Date.now();
    let removed = 0;
    
    for (const [id, conn] of this.connections.entries()) {
      const inactiveTime = now - (conn.lastActive || conn.connected);
      if (inactiveTime > this.inactivityThreshold) {
        try {
          conn.port?.disconnect();
          this.connections.delete(id);
          removed++;
          logger.info('Cleaned up inactive connection', { connectionId: id, inactiveTime });
        } catch (error) {
          logger.warn('Error disconnecting stale connection', { connectionId: id, error: error.message });
        }
      }
    }
    
    if (removed > 0) {
      logger.info(`Cleaned up ${removed} stale connections`);
    }
  }

  /**
   * Interrupts ongoing operations during shutdown
   * @private
   * @returns {Promise<void>}
   */
  async _interruptOperations() {
    const pendingOperations = [];
    
    // Cancel any pending timeouts
    if (this.connectionState.reconnectTimeout) {
      clearTimeout(this.connectionState.reconnectTimeout);
      this.connectionState.reconnectTimeout = null;
    }
    
    // Notify all connected ports about shutdown
    for (const [id, port] of this.ports.entries()) {
      try {
        pendingOperations.push(
          port.postMessage({
            type: MESSAGE_TYPES.BACKGROUND_SHUTDOWN,
            payload: { reason: 'Extension shutdown' }
          }).catch(() => {})
        );
      } catch (error) {
        // Ignore errors during cleanup
      }
    }
    
    // Wait for all messages to be sent or timeout
    await Promise.allSettled(pendingOperations);
  }

  /**
   * Sync state with service worker
   * Used by periodic sync
   * @returns {Promise<void>}
   */
  async syncState() {
    if (!this.stateManager || !this.initialized) return;

    try {
      await this.broadcastMessage({
        type: MESSAGE_TYPES.STATE_SYNC,
        payload: { timestamp: Date.now() }
      });
      logger.debug('State sync broadcast sent');
    } catch (error) {
      logger.warn('Failed to sync state', { error: error.message });
    }
  }

  /**
   * Retries an operation with exponential backoff
   * @param {Function} operation - The operation to retry
   * @param {Object} [options] - Retry options
   * @param {number} [options.maxAttempts] - Maximum number of retry attempts
   * @param {Array<number>} [options.delays] - Array of delay durations in ms
   * @returns {Promise<any>} - Result of the successful operation
   */
  async _retryWithBackoff(operation, options = {}) {
    const maxAttempts = options.maxAttempts || CONFIG.RETRY.MAX_ATTEMPTS;
    const delays = options.delays || CONFIG.RETRY.DELAYS;
    let attempt = 0;
    
    while (attempt < maxAttempts) {
      try {
        return await operation();
      } catch (error) {
        attempt++;
        if (attempt >= maxAttempts) throw error;
        
        // Calculate delay with jitter using config values
        const baseDelay = delays[Math.min(attempt, delays.length - 1)];
        const jitter = 1 - this.retries.jitter + (Math.random() * this.retries.jitter * 2);
        const delay = Math.floor(baseDelay * jitter);
        
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  /**
   * Clean up resources, especially when shutting down
   */
  async cleanup() {
    // flush any pending telemetry before shutdown
    if (isTelemetryEnabled()) {
      await flushTelemetry();
    }

    // Use SHUTDOWN timeout when aborting ongoing tasks
    const shutdownMs = CONFIG.TIMEOUTS.SHUTDOWN;
    await Promise.race([
      this._interruptOperations(),
      new Promise(resolve => setTimeout(resolve, shutdownMs))
    ]);
    
    // Close all ports
    for (const [id, port] of this.ports.entries()) {
      try {
        port.disconnect();
      } catch (error) {
        // Ignore errors during cleanup
      }
    }
    
    this.ports.clear();
    this.connections.clear();
    
    logger.info('Connection manager cleaned up');
  }
}

// Create and export singleton instance
const connectionManager = new ConnectionManager();

export default connectionManager;