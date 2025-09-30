// utils/connectionManager.js
/**
 * @fileoverview Connection Manager - Manages messaging between extension components
 * Follows unidirectional flow: ConnectionManager → StateManager → TabManager → Browser APIs
 * Maintains separation of concerns with clear responsibilities
 * 
 * Clear Responsibility:
 * - Receives messages from popup/content scripts
 * - Routes messages to appropriate StateManager handlers
 * - Manages connections and message validation
 * - Does NOT directly manipulate tabs or state
 */

import browser from 'webextension-polyfill';
import {
  MESSAGE_TYPES,
  ACTION,
  CONFIG,
  ERROR_CATEGORIES,
  ERROR_TYPES,
  LOG_CATEGORIES,
  CONNECTION_STATES,
  MESSAGES,
  formatMessage,
  validateMessage as coreValidateMessage,
  ValidationError,
  APIError,
  recordTelemetry,
  recordPerformance,
  TELEMETRY_EVENTS,
  flushTelemetry,
  isTelemetryEnabled,
  setTelemetryEnabled,
  PERMISSIONS,
  STATE
} from './core/index.js';
import { logger } from './logger.js';
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
    
    // Bind methods to instance to make them testable and spy-able
    this._routeMessage = this._routeMessage.bind(this);
    this.sendMessage = this.sendMessage.bind(this);
    this.connect = this.connect.bind(this);
    this.disconnect = this.disconnect.bind(this);
    this.getConnection = this.getConnection.bind(this);
    
    // Use METRICS.REPORTING_INTERVAL for telemetry flush
    this._metricsInterval = null;
    this._cleanupInterval = null;

    // Batch config
    this.batchFlushSize = CONFIG.BATCH?.FLUSH_SIZE || 10;
    this.batchTimeout = CONFIG.BATCH?.TIMEOUT || 5000;

    // Inactivity threshold for auto‐disconnect
    this.inactivityThreshold = CONFIG.INACTIVITY_THRESHOLDS?.SUSPEND || 1800000;

    // Annotate service type
    this.connectionState.serviceType = CONFIG.SERVICE_TYPES?.BACKGROUND || 'background';
    
    // derive connection name from CONFIG or fall back to a sensible default
    this.connectionName = CONFIG.SERVICE_NAME || 'background-connection';

    // Retry config
    this.retries = {
      delays: CONFIG.RETRY?.DELAYS || [1000, 3000, 5000],
      maxAttempts: CONFIG.RETRY?.MAX_ATTEMPTS || 3,
      jitter: CONFIG.RETRY?.JITTER_RANGE || 0.3
    };

    // Timeouts for connect/send
    this.timeouts = {
      connection: CONFIG.TIMEOUTS?.CONNECTION || 30000,
      message: CONFIG.TIMEOUTS?.MESSAGE || 5000
    };

    // initialize telemetry enabled state
    setTelemetryEnabled(true);
    this.selectors = selectors;

    ConnectionManager.instance = this;
  }

  /**
   * Reset singleton for testing
   * @private
   */
  _resetForTest() {
    this.initialized = false;
    this.connections = new Map();
    this.ports = new Map();
    this.stateManager = null;
    this.messageHandlers = {};
    
    this.connectionState = {
      state: CONNECTION_STATES.INITIALIZE,
      isReady: false,
      backgroundInitialized: false,
      reconnectTimeout: null
    };
  }

  /**
   * Initializes the connection manager with stateManager
   * @param {Object} stateManager - StateManager instance
   * @returns {Promise<boolean>} - True if successfully initialized
   */
  async initialize(stateManager) {
    try {
      if (this.initialized) return true;
      
      if (!stateManager?.store || !stateManager.initialized) {
        throw new Error('Valid initialized StateManager instance required');
      }
      
      this.stateManager = stateManager;

      // Set up metrics reporting interval
      if (!this._metricsInterval) {
        const interval = CONFIG.METRICS?.REPORTING_INTERVAL || 300000;
        this._metricsInterval = setInterval(() => this._reportMetrics(), interval);
      }

      // Set up connection cleanup interval
      if (!this._cleanupInterval) {
        const cleanupInterval = CONFIG.TIMEOUTS?.CLEANUP || 600000;
        this._cleanupInterval = setInterval(() => this._cleanupConnections(), cleanupInterval);
      }

      // Set up message handlers
      this.messageHandlers = this._setupMessageHandlers();
      
      this.initialized = true;

      // Schedule periodic telemetry flush
      const flushInterval = CONFIG.TELEMETRY?.FLUSH_INTERVAL || 300000;
      setInterval(() => {
        if (isTelemetryEnabled()) {
          flushTelemetry();
        }
      }, flushInterval);

      // Schedule periodic state sync
      const syncInterval = CONFIG.TIMEOUTS?.SYNC || 60000;
      setInterval(() => this.syncState(), syncInterval);

      logger.info('ConnectionManager initialized', { initialized: true });
      recordTelemetry(TELEMETRY_EVENTS.PERFORMANCE, { 
        operation: 'CONNECTION_MANAGER_INIT', 
        success: true 
      });

      return true;
    } catch (error) {
      logger.error('Failed to initialize ConnectionManager', {
        error: error.message,
        stack: error.stack,
        category: LOG_CATEGORIES.STATE,
        severity: ERROR_CATEGORIES.SEVERITY.HIGH
      });
      throw error;
    }
  }  /**
   * Sets up message handlers mapped by message type
   * @private
   * @returns {Object} Map of message types to handler functions
   */
  _setupMessageHandlers() {
    return {
      [MESSAGE_TYPES.STATE_SYNC]: async () => {
        // Skip sync when in service worker to prevent loops
        const isServiceWorker = typeof importScripts === 'function' || 
                               (typeof self !== 'undefined' && self.constructor.name === 'ServiceWorkerGlobalScope') ||
                               (typeof globalThis !== 'undefined' && globalThis.chrome && !globalThis.window);
        
        if (isServiceWorker) {
          logger.debug('Skipping StateManager sync - already in service worker context');
          return { success: true, skipped: true };
        }
        
        // Delegate to StateManager for state synchronization
        await this.stateManager.syncWithServiceWorker();
        return { success: true };
      },

      [MESSAGE_TYPES.STATE_UPDATE]: async (message) => {
        // Delegate state validation and update handling to StateManager
        await this.stateManager.validateStateUpdate(message.payload);
        return await this.stateManager.handleBackgroundMessage(message);
      },

      [MESSAGE_TYPES.TAB_ACTION]: async (message) => {
        // Delegate tab actions to StateManager, which will handle permissions
        return await this.stateManager.handleTabAction(message);
      },

      [MESSAGE_TYPES.SESSION_ACTION]: async (message) => {
        // Delegate session actions to StateManager, which will handle permissions
        return await this.stateManager.handleSessionAction(message);
      },

      [MESSAGE_TYPES.TAG_ACTION]: async (message) => {
        // Delegate tag actions to StateManager
        return await this.stateManager.handleTagAction(message);
      },

      [MESSAGE_TYPES.GET_SESSIONS]: async () => {
        // Use selectors from StateManager to retrieve sessions
        const allSessions = selectors.selectSessions(this.stateManager.getState());
        return { sessions: allSessions };
      },

      [MESSAGE_TYPES.CONFIG_UPDATE]: async (message) => {
        logger.debug('CONFIG_UPDATE received', { message, hasPayload: !!message.payload, payloadType: typeof message.payload });
        
        // If payload provided and not empty, update settings; otherwise return current settings
        if (message.payload && typeof message.payload === 'object' && Object.keys(message.payload).length > 0) {
          // Delegate config update to StateManager
          try {
            logger.debug('Updating settings with payload', message.payload);
            await this.stateManager.updateSettings(message.payload);
            logger.info('Settings updated successfully', message.payload);
            return { success: true, settings: message.payload };
          } catch (error) {
            logger.error('Failed to update settings', { error: error.message, payload: message.payload });
            return { success: false, error: error.message };
          }
        } else {
          // No payload or empty payload - just return current settings
          logger.debug('Returning current settings (no valid payload provided)');
          const settings = selectors.selectSettings(this.stateManager.getState());
          return { settings };
        }
      },

      [MESSAGE_TYPES.BOOKMARK_ACTION]: async (message) => {
        // Delegate bookmark actions to StateManager, which will handle permissions
        return await this.stateManager.handleBookmarkAction(message);
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
    // Handle async processing with proper error boundaries
    (async () => {
      try {
        const start = performance.now();
        const response = await this.handleMessage(message, sender);
        recordPerformance('handleRuntimeMessage', performance.now() - start);
        
        // Ensure sendResponse is still valid before calling
        if (sendResponse) {
          sendResponse(response);
        }
      } catch (error) {
        logger.error('Error handling message:', error);
        
        // Ensure sendResponse is still valid before calling
        if (sendResponse) {
          sendResponse({ error: error.message || 'Unknown error' });
        }
      }
    })().catch(error => {
      // Final error boundary - log but don't throw to prevent unhandled promise rejection
      logger.error('Unhandled error in message processing:', error);
    });

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
      logger.debug('Port message received', { message, connectionId: connId });
      this.handleMessage(message, { port }).then(response => {
        try {
          logger.debug('Sending port response', { response, connectionId: connId });
          port.postMessage(response);
        } catch (error) {
          logger.error('Error sending response:', { error: error.message, connectionId: connId });
        }
      }).catch(error => {
        logger.error('Error handling port message:', { error: error.message, connectionId: connId });
        try {
          port.postMessage({ error: error.message });
        } catch (responseError) {
          logger.error('Failed to send error response:', { error: responseError.message, connectionId: connId });
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
   * Routes incoming messages to appropriate handler based on type
   * @param {Object} message - The message to route
   * @returns {Promise<Object>} - Response from the handler
   */
  async _routeMessage(message) {
    if (!message || !message.type) {
      logger.warn('Invalid message received', { message });
      return { error: 'Invalid message: missing type' };
    }

    const handler = this.messageHandlers[message.type];
    if (!handler) {
      logger.warn('Unsupported message type', { type: message.type });
      return { error: `Unsupported message type: ${message.type}` };
    }

    try {
      return await handler(message);
    } catch (error) {
      logger.error('Error in message handler', {
        error: error.message,
        type: message.type,
        action: message.action
      });
      throw error;
    }
  }

  /**
   * Handles incoming messages and routes them to appropriate handlers
   * @param {Object} message - Message to handle
   * @param {Object} sender - Sender information
   * @returns {Promise<Object>} - Response object
   */
  async handleMessage(message, sender) {
    const start = performance.now();
    
    try {
      logger.debug('Received message:', { type: message.type, action: message.action });
      
      if (!this.initialized) {
        return { error: 'ConnectionManager not initialized' };
      }

      // Special case for initialization check
      if (message.type === MESSAGE_TYPES.INIT_CHECK) {
        return { initialized: this.initialized };
      }

      // Validate message structure
      try {
        if (typeof coreValidateMessage === 'function') {
          coreValidateMessage(message);
        } else if (VALIDATION_SCHEMAS?.message?.validateSync) {
          VALIDATION_SCHEMAS.message.validateSync(message);
        }
      } catch (error) {
        logger.warn('Invalid message received:', { message, error: error.message });
        return { error: `Invalid message: ${error.message}` };
      }
      
      // Route the message to appropriate handler
      const response = await this._routeMessage(message);
      
      // Record performance
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
          type: message?.type,
          action: message?.action
        }
      });
      
      if (isTelemetryEnabled()) {
        recordTelemetry(TELEMETRY_EVENTS.ERROR, {
          area: 'connectionManager.handleMessage',
          error: error.message,
          messageType: message?.type
        });
      }
      
      // Delegate error recovery to StateManager
      if (this.stateManager) {
        this.stateManager.store.dispatch({
          type: ACTION.STATE.RECOVER,
          payload: { error: error.message, type: STATE.APP.ERROR }
        });
      }
      
      return { error: error.message || 'Unknown error' };
    }
  }

  /**
   * Sends a message via runtime messaging or port connection
   * @param {Object} message - Message to send
   * @returns {Promise<Object>} - Response from receiver
   */
  async sendMessage(message) {
    const start = performance.now();

    try {
      // Validate message
      if (typeof coreValidateMessage === 'function') {
        coreValidateMessage(message);
      } else if (VALIDATION_SCHEMAS?.message?.validateSync) {
        VALIDATION_SCHEMAS.message.validateSync(message);
      }
      
      // Determine context: if we're in the background script or if this
      // ConnectionManager has been initialized with a StateManager (tests and
      // the background process), route internally. Otherwise, attempt a port
      // based send from UI pages and fall back to runtime.sendMessage if it fails.
      const isServiceWorker = typeof importScripts === 'function' || 
                             (typeof self !== 'undefined' && self.constructor.name === 'ServiceWorkerGlobalScope') ||
                             (typeof globalThis !== 'undefined' && globalThis.chrome && !globalThis.window);

      let response;

      // If we're running inside a service worker context, or the ConnectionManager
      // has already been initialized with a StateManager (which implies background
      // semantics in tests or the real background), route the message directly so
      // handlers are invoked synchronously. This avoids waiting on port responses
      // when running unit tests or when the call originates inside the background.
      if (isServiceWorker || (this.stateManager && this.initialized)) {
        // We're in the background script (or test background) - route internally
        response = await this._routeMessage(message);
      } else {
        // We're in options/popup - send via port to background
        try {
          response = await this._sendViaPort(message);
        } catch (portError) {
          // Port-based messaging may fail under Manifest V3 service worker lifecycle.
          // Fall back to runtime.sendMessage which is handled by the background's
          // onMessage listener. Log full error for diagnostics and attempt fallback.
          logger.warn('Port-based send failed, attempting runtime.sendMessage fallback', { error: portError && portError.message ? portError.message : portError });
          try {
            response = await browser.runtime.sendMessage(message);
          } catch (runtimeErr) {
            logger.error('runtime.sendMessage fallback failed', { error: runtimeErr && runtimeErr.message ? runtimeErr.message : runtimeErr });
            // Re-throw the original port error to preserve context if runtime also fails
            throw portError;
          }
        }
      }
      
      // Record performance
      if (isTelemetryEnabled()) {
        recordPerformance('sendMessage', performance.now() - start, {
          messageType: message.type
        });
      }

      return response;
    } catch (err) {
      logger.error('Error handling message', {
        error: err.message,
        stack: err.stack,
        messageType: message?.type
      });
      
      // Record error
      if (isTelemetryEnabled()) {
        recordTelemetry(TELEMETRY_EVENTS.ERROR, {
          event: 'sendMessage_error',
          messageType: message?.type,
          error: err.message
        });
      }
      
      throw err;
    }
  }

  /**
   * Sends a message via port connection (for options/popup to background communication)
   * @private
   * @param {Object} message - Message to send
   * @returns {Promise<Object>} - Response from background
   */
  async _sendViaPort(message) {
    // Implement retry/backoff for transient port errors (Manifest V3 lifecycle can
    // cause short-lived ports). We attempt up to configured max attempts and
    // use configured delays and jitter. If all attempts fail, the caller will
    // receive the last error and `sendMessage` will perform the runtime.sendMessage
    // fallback.
    const maxAttempts = (this.retries && this.retries.maxAttempts) || 3;
    const delays = (this.retries && this.retries.delays) || [1000, 2000, 4000];
    const jitterRange = (this.retries && this.retries.jitter) || 0.2;
    const messageTimeout = (this.timeouts && this.timeouts.message) || 5000;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      // Try to find an active port or establish a new one
      let activePort = null;
      for (const [connId, connection] of this.connections.entries()) {
        if (connection.port && !connection.port.disconnected) {
          activePort = connection.port;
          break;
        }
      }

      if (!activePort) {
        try {
          const port = browser.runtime.connect({ name: this.connectionName });
          activePort = port;
          const connectionId = `conn-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
          this.connections.set(connectionId, { port, connectionId });
        } catch (connError) {
          // If we can't connect at all, consider retrying
          if (attempt >= maxAttempts - 1) {
            throw new Error(`Failed to establish port connection: ${connError && connError.message ? connError.message : connError}`);
          }
          // wait with jitter then retry
          const baseDelay = delays[Math.min(attempt, delays.length - 1)];
          const jitter = 1 - jitterRange + (Math.random() * jitterRange * 2);
          const waitMs = Math.max(0, Math.floor(baseDelay * jitter));
          logger.warn(`_sendViaPort: connect failed, retrying in ${waitMs}ms`, { attempt: attempt + 1, error: connError && connError.message ? connError.message : connError });
          await new Promise(res => setTimeout(res, waitMs));
          continue;
        }
      }

      // Build a promise that resolves when we receive a response via the port
      try {
        const response = await (async () => {
          return await new Promise((resolve, reject) => {
            let settled = false;

            const cleanup = () => {
              try { activePort.onMessage.removeListener(onMessage); } catch (e) {}
              try { activePort.onDisconnect.removeListener(onDisconnect); } catch (e) {}
            };

            const onMessage = (resp) => {
              if (settled) return;
              settled = true;
              cleanup();
              resolve(resp);
            };

            const onDisconnect = () => {
              if (settled) return;
              settled = true;
              cleanup();
              reject(new Error('Port disconnected before response received'));
            };

            // Attach listeners
            try {
              activePort.onMessage.addListener(onMessage);
              activePort.onDisconnect.addListener(onDisconnect);
            } catch (e) {
              settled = true;
              cleanup();
              reject(new Error(`Failed to attach port listeners: ${e && e.message ? e.message : e}`));
              return;
            }

            // Attempt to send the message
            try {
              activePort.postMessage(message);
            } catch (postErr) {
              if (settled) return;
              settled = true;
              cleanup();
              reject(new Error(`Failed to send message via port: ${postErr && postErr.message ? postErr.message : postErr}`));
              return;
            }

            // Add timeout for response
            const timer = setTimeout(() => {
              if (settled) return;
              settled = true;
              cleanup();
              reject(new Error('Port response timed out'));
            }, messageTimeout);

            // Ensure timer cleared when promise settles
            const originalResolve = resolve;
            const originalReject = reject;
            // Not strictly necessary here since cleanup removes listeners; timer will be cleaned in rejection/resolve paths.
          });
        })();

        // If we got a response, return it
        return response;
      } catch (err) {
        // If this was the last attempt, surface the error to caller
        if (attempt >= maxAttempts - 1) {
          throw err;
        }

        // Otherwise, compute backoff with jitter and retry
        const baseDelay = delays[Math.min(attempt, delays.length - 1)];
        const jitter = 1 - jitterRange + (Math.random() * jitterRange * 2);
        const waitMs = Math.max(0, Math.floor(baseDelay * jitter));
        logger.warn(`_sendViaPort attempt ${attempt + 1} failed, retrying in ${waitMs}ms`, { error: err && err.message ? err.message : err });
        await new Promise(res => setTimeout(res, waitMs));
        continue;
      }
    }
  }

  /**
   * Broadcasts a message to all connected ports
   * @param {Object} message - Message to broadcast
   * @returns {Promise<Array>} - Array of responses
   */
  async broadcastMessage(message) {
    try {
      // Validate message
      if (typeof coreValidateMessage === 'function') {
        coreValidateMessage(message);
      } else if (VALIDATION_SCHEMAS?.message?.validateSync) {
        VALIDATION_SCHEMAS.message.validateSync(message);
      }
      
      const responses = [];
      
      // Broadcast to all connections
      for (const [id, connection] of this.connections.entries()) {
        try {
          if (connection.port && connection.port.postMessage) {
            connection.port.postMessage(message);
            responses.push({ id, success: true });
          }
        } catch (error) {
          logger.warn(`Error broadcasting to ${id}:`, error.message);
          responses.push({ id, error: error.message });
        }
      }
      
      return responses;
    } catch (error) {
      logger.error('Error broadcasting message:', {
        error: error.message,
        type: message?.type
      });
      throw error;
    }
  }

  /**
   * Creates a connection to the background script
   * @returns {Object} - Connection object with connectionId
   */
  connect() {
    try {
      const port = browser.runtime.connect({ name: this.connectionName });
      const connectionId = `conn-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
      
      const connection = { 
        port, 
        connectionId, 
        connected: Date.now(),
        lastActive: Date.now()
      };
      
      this.connections.set(connectionId, connection);
      
      // Setup listeners (client-side doesn't handle messages, only sends and receives responses)
      port.onDisconnect.addListener(() => {
        logger.info('Port disconnected', { connectionId });
        this.connections.delete(connectionId);
        this.connectionState.state = CONNECTION_STATES.DISCONNECTED;
        this.connectionState.isReady = false;
      });
      
      // Update connection state
      this.connectionState.state = CONNECTION_STATES.READY;
      this.connectionState.isReady = true;
      
      logger.info('Connection established', { connectionId });
      
      if (isTelemetryEnabled()) {
        recordTelemetry(TELEMETRY_EVENTS.PERFORMANCE, {
          operation: 'connect',
          success: true
        });
      }
      
      return connection;
    } catch (error) {
      logger.error('Error creating connection', { error: error.message });
      this.connectionState.state = CONNECTION_STATES.ERROR;
      
      if (isTelemetryEnabled()) {
        recordTelemetry(TELEMETRY_EVENTS.CONNECTION_FAILED, { error: error.message });
      }
      
      throw error;
    }
  }

  /**
   * Get connection by ID
   * @param {string} connectionId - Connection ID
   * @returns {Object|undefined} - Connection object or undefined if not found
   */
  getConnection(connectionId) {
    return this.connections.get(connectionId);
  }

  /**
   * Disconnect a connection by ID
   * @param {string} connectionId - Connection ID to disconnect
   */
  disconnect(connectionId) {
    const connection = this.connections.get(connectionId);
    
    if (connection) {
      try {
        // Clean up listeners if port is still available
        if (connection.port) {
          if (connection.port.onMessage && connection.port.onMessage.removeListener) {
            connection.port.onMessage.removeListener();
          }
          
          if (connection.port.onDisconnect && connection.port.onDisconnect.removeListener) {
            connection.port.onDisconnect.removeListener();
          }
        }
      } catch (error) {
        // Ignore errors during disconnect
      }
      
      this.connections.delete(connectionId);
      logger.info('Connection disconnected', { connectionId });
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
   * @returns {Promise<void>}
   */
  async syncState() {
    if (!this.stateManager || !this.initialized) return;

    // Skip sync when in service worker to prevent loops
    const isServiceWorker = typeof importScripts === 'function' || 
                           (typeof self !== 'undefined' && self.constructor.name === 'ServiceWorkerGlobalScope') ||
                           (typeof globalThis !== 'undefined' && globalThis.chrome && !globalThis.window);
    
    if (isServiceWorker) {
      logger.debug('Skipping ConnectionManager syncState - already in service worker context');
      return;
    }

    try {
      await this.stateManager.syncWithServiceWorker();
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
   * Clean up resources and connections
   * @returns {Promise<void>}
   */
  async cleanup() {
    // Flush telemetry
    if (isTelemetryEnabled()) {
      await flushTelemetry();
    }

    // Clear intervals
    if (this._metricsInterval) {
      clearInterval(this._metricsInterval);
      this._metricsInterval = null;
    }
    
    if (this._cleanupInterval) {
      clearInterval(this._cleanupInterval);
      this._cleanupInterval = null;
    }

    // Disconnect all connections
    for (const id of this.connections.keys()) {
      this.disconnect(id);
    }
    
    // Remove runtime message listeners
    if (browser.runtime && browser.runtime.onMessage) {
      browser.runtime.onMessage.removeListener();
    }
    
    logger.info('Connection manager cleaned up');
  }
}

// Create and export singleton instance
const connectionManager = new ConnectionManager();

export default connectionManager;