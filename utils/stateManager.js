/**
 * @fileoverview State Manager Module - Coordinates with background.js for state updates
 * 
 * Architecture Notes:
 * - All state updates are validated by background.js before processing
 * - Atomic updates are ensured through transaction-like handling
 * - Background.js acts as the source of truth for state validation
 * 
 * Data Flow:
 * 1. State changes trigger validation through background.js
 * 2. Validated changes are batched when possible
 * 3. Updates are tracked via telemetry
 * 4. Changes are diffed before sync
 * 
 * @module stateManager
 */

import browser from 'webextension-polyfill';
import { configureStore, createSlice } from '@reduxjs/toolkit';
import { persistStore, persistReducer } from 'redux-persist';
import storage from 'redux-persist/lib/storage';
import { combineReducers } from 'redux';
import { createSelector } from 'reselect';
import thunk from 'redux-thunk';
import deepEqual from 'fast-deep-equal';
import { logger } from './logger.js';
import {
  TAB_STATES,
  MESSAGE_TYPES,
  ACTION_TYPES,
  SERVICE_TYPES,
  VALIDATION_TYPES,
  CONFIG,
  BATCH_CONFIG,
  selectors,
  STATE_SCHEMA,
  SLICE_SCHEMAS,
  VALIDATION_ERRORS
} from './constants.js';
import { handleInactiveTab } from './tabManager.js';
import { validateTag, validateRule } from './tagUtils.js';
import { checkPermissions } from './messagingUtils.js';
import Ajv from 'ajv';

// Importing types from constants.js is omitted in JS since types are not supported

// Initial state
const initialState = {
  tabs: [],
  sessions: [],
  rules: [],
  archivedTabs: {},
  tabActivity: {},
  savedSessions: {},
  isTaggingPromptActive: false,
  declarativeRules: [],
  serviceWorker: {
    type: SERVICE_TYPES.WORKER, // Ensure SERVICE_TYPES.WORKER is correctly defined as "WORKER"
    isActive: false,
    lastSync: 0,
  },
  activeRules: [],
  suspendedTabs: {},
  tabMetadata: {},
  settings: {
    inactivityThreshold: CONFIG.INACTIVITY_THRESHOLDS.DEFAULT,
    autoSuspend: true,
    tagPromptEnabled: true
  },
  permissions: {
    granted: [],
    pending: []
  }
};

/**
 * Interface for tab metadata updates
 * @typedef {Object} TabMetadata
 * @property {string[]} [tags] - Associated tags
 * @property {number} [lastAccessed] - Timestamp of last access
 * @property {number} [lastTagged] - Timestamp of last tag update
 * @property {string} [status] - Current tab status
 */

/**
 * Ensures atomic state updates through background.js validation
 * @param {string} type - Update type
 * @param {Object} payload - Update payload
 */
const validateStateUpdate = async (type, payload) => {
  return browser.runtime.sendMessage({
    type: MESSAGE_TYPES.STATE_UPDATE,
    action: 'validate',
    payload: { type, payload }
  });
};

/**
 * Enhanced tab management slice with metadata support
 */
const tabManagementSlice = createSlice({
  name: 'tabManagement',
  initialState: {
    tabs: initialState.tabs,
    activity: initialState.tabActivity,
    metadata: initialState.tabMetadata,
    suspended: initialState.suspendedTabs
  },
  reducers: {
    updateTab: {
      prepare: (payload) => ({ payload }),
      reducer: async (state, action) => {
        await validateStateUpdate('updateTab', action.payload);
        const { id, ...changes } = action.payload;
        const tabIndex = state.tabs.findIndex(tab => tab.id === id);
        if (tabIndex !== -1) {
          state.tabs[tabIndex] = { ...state.tabs[tabIndex], ...changes };
          // Update activity and metadata atomically
          state.activity[id] = {
            ...state.activity[id],
            lastAccessed: Date.now(),
            status: changes.status || state.activity[id]?.status
          };
        }
      }
    },
    /**
     * Updates tab metadata with validation
     * @param {Object} state - Current state
     * @param {Object} action - Action with tabId and metadata
     */
    updateMetadata(state, action) {
      const { tabId, metadata } = action.payload;
      if (!state.metadata[tabId]) {
        state.metadata[tabId] = {};
      }
      state.metadata[tabId] = {
        ...state.metadata[tabId],
        ...metadata,
        lastUpdated: Date.now()
      };
    },
    // Consolidated tab operations
    removeTab(state, action) {
      const id = action.payload;
      state.tabs = state.tabs.filter(tab => tab.id !== id);
      delete state.activity[id];
      delete state.metadata[id];
      delete state.suspended[id];
    }
  }
});

const sessionsSlice = createSlice({
  name: 'sessions',
  initialState: initialState.sessions,
  reducers: {
    saveSession(state, action) {
      state.push(action.payload);
    },
    deleteSession(state, action) {
      return state.filter(session => session.name !== action.payload);
    },
  },
});

// Remove duplicate rulesSlice and merge with declarativeRulesSlice
const rulesSlice = createSlice({
  name: 'rules',
  initialState: initialState.rules,
  reducers: {
    addRule(state, action) {
      state.push(action.payload);
    },
    updateRules(state, action) {
      return action.payload;
    },
  },
});

const archivedTabsSlice = createSlice({
  name: 'archivedTabs',
  initialState: initialState.archivedTabs,
  reducers: {
    archiveTab(state, action) {
      state[action.payload.id] = action.payload;
    },
    removeArchivedTab(state, action) {
      delete state[action.payload];
    },
  },
});

const savedSessionsSlice = createSlice({
  name: 'savedSessions',
  initialState: initialState.savedSessions,
  reducers: {
    saveSessionData(state, action) {
      const { sessionName, session } = action.payload;
      state[sessionName] = session;
    },
    deleteSessionData(state, action) {
      delete state[action.payload];
    },
  },
});

const uiSlice = createSlice({
  name: 'ui',
  initialState: { isTaggingPromptActive: initialState.isTaggingPromptActive },
  reducers: {
    setTaggingPrompt(state, action) {
      state.isTaggingPromptActive = action.payload;
    },
  },
});

const settingsSlice = createSlice({
  name: 'settings',
  initialState: initialState.settings,
  reducers: {
    updateSettings(state, action) {
      return { ...state, ...action.payload };
    }
  }
});

const permissionsSlice = createSlice({
  name: 'permissions',
  initialState: initialState.permissions,
  reducers: {
    updatePermissions(state, action) {
      state.granted = action.payload;
    },
    addPendingPermission(state, action) {
      state.pending.push(action.payload);
    },
    removePendingPermission(state, action) {
      state.pending = state.pending.filter(p => p !== action.payload);
    }
  }
});

// Combine reducers
const rootReducer = combineReducers({
  tabManagement: tabManagementSlice.reducer,
  sessions: sessionsSlice.reducer,
  rules: rulesSlice.reducer,
  archivedTabs: archivedTabsSlice.reducer,
  savedSessions: savedSessionsSlice.reducer,
  ui: uiSlice.reducer,
  isTaggingPromptActive: (state = false, action) => 
    action.type === 'SET_TAGGING_PROMPT' ? action.payload : state,
  declarativeRules: rulesSlice.reducer,
  serviceWorker: (state = initialState.serviceWorker, action) => {
    switch (action.type) {
      case ACTION_TYPES.STATE.INITIALIZE:
        return {
          ...state,
          type: action.payload.type,
          isActive: action.payload.isActive,
          lastSync: action.payload.lastSync,
        };
      default:
        return state;
    }
  },
  settings: settingsSlice.reducer,
  permissions: permissionsSlice.reducer
});

// Persist configuration
const persistConfig = {
  key: 'root',
  storage: {
    getItem: async (key) => {
      const result = await browser.storage.local.get(key);
      return result[key];
    },
    setItem: async (key, value) => {
      await browser.storage.local.set({ [key]: value });
    },
    removeItem: async (key) => {
      await browser.storage.local.remove(key);
    }
  },
  whitelist: ['tabs', 'sessions', 'rules', 'declarativeRules'],
  serialize: true,
  // deserialize: true, // Removed this line
};

// Create persisted reducer
const persistedReducer = persistReducer(persistConfig, rootReducer);

// Middleware for more granular error logging
const errorLoggingMiddleware = store => next => action => {
  try {
    return next(action);
  } catch (error) {
    console.error(`Error processing action ${action.type}:`, error);
    throw error;
  }
};

// Add improved validation middleware with specific error messages
const enhancedValidationMiddleware = store => next => action => {
  try {
    switch (action.type) {
      case 'tabManagement/updateTab':
        if (!validateTabPayload(action.payload)) {
          throw new Error(`Invalid tab payload: ${JSON.stringify(action.payload)}`);
        }
        break;
      case 'rules/updateRules':
        if (!validateRules(action.payload)) {
          throw new Error(`Invalid rules format: ${JSON.stringify(action.payload)}`);
        }
        break;
    }
    return next(action);
  } catch (error) {
    console.error(`Validation failed for ${action.type}:`, error);
    throw error;
  }
};

// Add performance monitoring with thresholds
const enhancedPerformanceMiddleware = store => next => action => {
  const start = performance.now();
  const result = next(action);
  const duration = performance.now() - start;
  
  if (duration > 16.67) { // More than 1 frame (60fps)
    console.warn(`Action ${action.type} took ${duration.toFixed(2)}ms to process`);
    // Log to performance monitoring service
    logPerformanceMetric({
      action: action.type,
      duration,
      state: store.getState()
    });
  }
  
  return result;
};

// Ensure Cross-Module Validation: Integrate validation in middleware
const validationMiddleware = store => next => action => {
  // Example validation for tab-related actions
  if (action.type.startsWith('tab/')) {
    const isValid = validateTabAction(action);
    if (!isValid) {
      console.error(`Invalid action payload for ${action.type}:`, action.payload);
      return;
    }
  }
  return next(action);
};

// Enhanced middleware layer with modular components
const createValidationMiddleware = (validators) => store => next => action => {
  try {
    if (validators[action.type]) {
      const validationResult = validators[action.type](action.payload);
      if (!validationResult.isValid) {
        throw new Error(`Validation failed for ${action.type}: ${validationResult.error}`);
      }
    }
    return next(action);
  } catch (error) {
    console.error(`Validation middleware error for ${action.type}:`, error);
    throw error;
  }
};

const createPerformanceMiddleware = (options = {}) => {
  const { threshold = 16.67, logFunction = console.warn } = options;
  return store => next => action => {
    const start = performance.now();
    const result = next(action);
    const duration = performance.now() - start;
    
    if (duration > threshold) {
      logFunction(`Performance warning: ${action.type} took ${duration.toFixed(2)}ms`);
    }
    return result;
  };
};

// Enhanced validation schema
const actionValidators = {
  'tabManagement/updateTab': (payload) => ({
    isValid: Boolean(payload?.id && typeof payload.id === 'number'),
    error: 'Invalid tab id'
  }),
  'savedSessions/saveSessionData': (payload) => ({
    isValid: Boolean(payload?.sessionName && payload?.session),
    error: 'Invalid session data'
  }),
  'rules/updateRules': (payload) => ({
    isValid: Array.isArray(payload),
    error: 'Rules must be an array'
  })
};

// Enhanced selectors with memoization
const createCachedSelector = (selector, equalityFn = (a, b) => a === b) => {
  let lastResult = null;
  let lastInput = null;
  
  return (...args) => {
    if (lastInput && equalityFn(lastInput, args[0])) {
      return lastResult;
    }
    lastInput = args[0];
    lastResult = selector(...args);
    return lastResult;
  };
};

// Enhanced selectors with proper memoization
export const enhancedSelectors = {
  selectSuspendedTabs: createSelector(
    [state => state.tabManagement.suspended],
    (suspended) => suspended
  ),
  
  selectTabsWithActivity: createSelector(
    [
      state => state.tabManagement.tabs,
      state => state.tabManagement.activity
    ],
    (tabs, activity) => tabs.map(tab => ({
      ...tab,
      lastActivity: activity[tab.id]?.lastAccessed || 0
    }))
  ),
  
  selectSessionsByLastAccessed: createSelector(
    [state => state.savedSessions],
    (sessions) => Object.entries(sessions)
      .sort(([, a], [, b]) => b.lastAccessed - a.lastAccessed)
      .reduce((acc, [key, value]) => ({ ...acc, [key]: value }), {})
  )
};

// Unified session thunks with optimistic updates and error handling
export const enhancedSessionThunks = {
  saveSession: (sessionName, tabs) => async (dispatch) => {
    const sessionData = { name: sessionName, tabs, timestamp: Date.now() };
    
    try {
      // Optimistic update
      dispatch(actions.session.saveSessionData({
        sessionName,
        session: sessionData
      }));
      
      await browser.storage.sync.set({
        [`session_${sessionName}`]: sessionData
      });
      
      return sessionData;
    } catch (error) {
      // Rollback on failure
      dispatch(actions.session.deleteSessionData(sessionName));
      throw error;
    }
  },
};

// Apply middlewares
const store = configureStore({
  reducer: persistedReducer,
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: false,
      thunk: {
        extraArgument: {
          batchProcessor: batcher,
          validateState
        }
      }
    }).concat([
      telemetryMiddleware,
      errorLoggingMiddleware,
      enhancedPerformanceMiddleware,
      enhancedValidationMiddleware,
      createValidationMiddleware(actionValidators),
      createPerformanceMiddleware({ threshold: 16.67 }),
      (store) => (next) => (action) => {
        if (action.type.startsWith('@@redux')) {
          return next(action);
        }

        try {
          const prevState = store.getState();
          const result = next(action);
          const newState = store.getState();

          // Validate affected slices
          const changedSlices = Object.keys(prevState).filter(
            key => !deepEqual(prevState[key], newState[key])
          );

          for (const slice of changedSlices) {
            if (validateSlices[slice]) {
              validateSliceShape(slice, newState[slice]);
            }
          }

          return result;
        } catch (error) {
          logger.error('State validation middleware error', {
            actionType: action.type,
            error: error.message,
            type: VALIDATION_ERRORS.INVALID_ACTION
          });
          throw error;
        }
      }
    ]),
  devTools: process.env.NODE_ENV !== 'production',
});

// Persistor
const persistor = persistStore(store);

// Export selectors from constants
export const {
  selectTabs,
  selectArchivedTabs,
  selectTabActivity,
  selectActiveTabs,
  selectInactiveTabs,
  selectMatchingRules
} = selectors;

export const selectors = {
  selectTabs,
  selectArchivedTabs,
  selectTabActivity,
  selectActiveTabs,
  selectInactiveTabs,
  selectMatchingRules,
  selectTabMetadata: (state, tabId) => state.tabManagement.metadata[tabId],
  selectSuspendedTabs: state => state.tabManagement.suspended,
  selectSettings: state => state.settings,
  selectPermissions: state => state.permissions
};

// Remove duplicate actions exports and combine them
export const actions = {
  tabManagement: { ...tabManagementSlice.actions },
  session: { ...sessionsSlice.actions },
  rules: { ...rulesSlice.actions },
  ui: { ...uiSlice.actions },
  settings: settingsSlice.actions,
  permissions: permissionsSlice.actions,
  batchUpdate: (updates) => ({
    type: 'BATCH_UPDATE',
    payload: updates
  })
};

// Export store and persistor
export { store, persistor };

// Add optimized state sync with diff checking
export const syncWithServiceWorker = () => async (dispatch, getState) => {
  const currentState = getState();
  const lastSyncState = await browser.storage.local.get('lastSyncState');
  
  // Only sync changed slices
  const stateUpdates = getDiffedState(currentState, lastSyncState);
  
  if (Object.keys(stateUpdates).length > 0) {
    await browser.runtime.sendMessage({
      type: MESSAGE_TYPES.STATE_SYNC,
      payload: stateUpdates
    });
    
    await browser.storage.local.set({ lastSyncState: currentState });
  }
};

// Add state diffing utility
function getDiffedState(currentState, lastState = {}) {
  const updates = {};
  
  Object.keys(currentState).forEach(key => {
    if (!isEqual(currentState[key], lastState[key])) {
      updates[key] = currentState[key];
    }
  });
  
  return updates;
}

// Add service worker event handlers using SW_EVENTS
export const initializeServiceWorkerState = async () => {
  store.dispatch({
    type: ACTION_TYPES.STATE.INITIALIZE,
    payload: {
      type: SERVICE_TYPES.WORKER, // Ensure consistent type usage
      isActive: true,
      lastSync: Date.now()
    }
  });
};

// Add validation using VALIDATION_TYPES
export const validateState = (state) => {
  const requiredFields = VALIDATION_TYPES.TAB.required;
  const tabs = state.tabs || [];
  
  return tabs.every(tab => 
    requiredFields.every(field => field in tab)
  );
};

// Consolidate batch processing
export const batchProcessor = {
  process: async (items, processor, batchSize = BATCH_CONFIG.DEFAULT_SIZE) => {
    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + Math.min(batchSize, BATCH_CONFIG.MAX_SIZE));
      await Promise.all(batch.map(processor));
    }
  },
  
  createIterator: async function* (items, size = BATCH_CONFIG.DEFAULT_SIZE) {
    for (let i = 0; i < items.length; i += size) {
      yield items.slice(i, i + Math.min(size, BATCH_CONFIG.MAX_SIZE));
    }
  }
};

// Add batch processing with progress tracking
export const enhancedBatchProcessor = {
  ...batchProcessor,
  processWithProgress: async (items, processor, { 
    batchSize = BATCH_CONFIG.DEFAULT_SIZE,
    onProgress
  } = {}) => {
    let processed = 0;
    const total = items.length;

    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + Math.min(batchSize, BATCH_CONFIG.MAX_SIZE));
      await Promise.all(batch.map(processor));
      
      processed += batch.length;
      if (onProgress) {
        onProgress(processed / total);
      }
    }
  }
};

// Define AppDispatch
// Removed type definition for AppDispatch as it's TypeScript-specific

// Add thunks for complex operations
export const thunks = {
  handleInactiveTabsThunk: () => async (dispatch, getState) => {
    const state = getState();
    const { tabs, tabActivity, settings } = state;
    const now = Date.now();

    const inactiveTabs = tabs.filter(tab => {
      const activity = tabActivity[tab.id];
      return activity && (now - activity.lastAccessed) >= settings.inactivityThreshold;
    });

    // Batch process inactive tabs
    const batchSize = 50;
    for (let i = 0; i < inactiveTabs.length; i += batchSize) {
      const batch = inactiveTabs.slice(i, i + batchSize);
      await Promise.all(batch.map(tab => dispatch(actions.tabManagement.updateTab({
        ...tab,
        suspensionStatus: TAB_STATES.SUSPENDED
      }))));
      console.log(`Processed batch ${i / batchSize + 1}`);
    }
  },

  applyRuleToTab: (tabId, rule) => async (dispatch, getState) => {
    try {
      validateRule(rule);
      const tab = getState().tabs.find(t => t.id === tabId);
      if (tab) {
        const tag = rule.action.split(': ')[1];
        if (tag) {
          validateTag(tag);
          await dispatch(actions.tabManagement.updateTab({
            ...tab,
            title: `[${tag}] ${tab.title}`
          }));
        }
      }
    } catch (error) {
      console.error('Error applying rule:', error);
    }
  }
};

// Add session management with optimistic updates
export const sessionThunks = {
  saveSession: (sessionName, tabs) => async (dispatch) => {
    // Optimistically update UI
    dispatch(actions.session.saveSessionStart({ sessionName, tabs }));
    
    try {
      await browser.storage.sync.set({
        [`session_${sessionName}`]: tabs
      });
      dispatch(actions.session.saveSessionSuccess({ sessionName, tabs }));
    } catch (error) {
      dispatch(actions.session.saveSessionFailure({ sessionName, error }));
      throw error;
    }
  }
};

// Cross-Module Validation Function
function validateTabAction(action) {
  switch (action.type) {
    case 'tab/addTab':
      return validateTag(action.payload);
    case 'tab/updateTab':
      return validateTag(action.payload);
    // Add more cases as needed
    default:
      return true;
  }
}

// Public Interface - Document explicit exports
export {
  // Store
  store,
  persistor,
  
  // Actions
  actions,
  
  // Selectors
  selectors,
  
  // State Management
  syncState,
  validateState,
  
  // Batch Processing
  batchProcessor,
  enhancedBatchProcessor,
  
  // State Synchronization
  validateStateUpdate
};

// Add state update tracking
const stateUpdateMetrics = {
  updates: 0,
  batchedUpdates: 0,
  lastUpdate: Date.now(),
  updateSizes: [],
  diffTimes: []
};

/**
 * Enhanced state diffing with performance tracking
 * @param {Object} current - Current state
 * @param {Object} previous - Previous state
 * @returns {Object} Changes between states
 */
const getStateDiff = (current, previous) => {
  const start = performance.now();
  const updates = {};
  let updateSize = 0;

  try {
    for (const [key, value] of Object.entries(current)) {
      if (!previous || !deepEqual(value, previous[key])) {
        updates[key] = value;
        updateSize += JSON.stringify(value).length;
      }
    }

    const duration = performance.now() - start;
    stateUpdateMetrics.diffTimes.push(duration);
    stateUpdateMetrics.updateSizes.push(updateSize);

    // Log significant diffs
    if (duration > CONFIG.THRESHOLDS.STATE_SYNC) {
      logger.warn('State diff exceeded threshold', {
        duration,
        updateSize,
        keys: Object.keys(updates)
      });
    }

    return updates;
  } catch (error) {
    logger.error('State diff failed', {
      error: error.message,
      type: 'STATE_DIFF_ERROR'
    });
    throw error;
  }
};

/**
 * Batch processor for state updates
 */
class StateUpdateBatcher {
  constructor() {
    this.queue = [];
    this.processing = false;
    this.batchTimeout = null;
  }

  add(update) {
    this.queue.push(update);
    this._scheduleBatch();
  }

  _scheduleBatch() {
    if (!this.batchTimeout) {
      this.batchTimeout = setTimeout(() => this._processBatch(), 100);
    }
  }

  async _processBatch() {
    if (this.processing || this.queue.length === 0) return;

    this.processing = true;
    const batch = this.queue.splice(0);
    this.batchTimeout = null;

    try {
      const start = performance.now();
      await store.dispatch({
        type: 'BATCH_UPDATE',
        payload: batch
      });

      stateUpdateMetrics.batchedUpdates++;
      logger.logPerformance('stateBatchUpdate', performance.now() - start, {
        updateCount: batch.length
      });
    } catch (error) {
      logger.error('Batch update failed', {
        error: error.message,
        updates: batch.length,
        type: 'BATCH_UPDATE_ERROR'
      });
    } finally {
      this.processing = false;
      if (this.queue.length > 0) {
        this._scheduleBatch();
      }
    }
  }
}

// Initialize batcher
const batcher = new StateUpdateBatcher();

// Enhanced middleware with telemetry
const telemetryMiddleware = store => next => action => {
  const start = performance.now();
  const result = next(action);
  const duration = performance.now() - start;

  stateUpdateMetrics.updates++;
  logger.logPerformance('stateUpdate', duration, {
    actionType: action.type,
    timestamp: Date.now()
  });

  return result;
};

// Testing utilities
export const __testing__ = {
  getStateDiff: (current, previous) => getStateDiff(current, previous),
  getUpdateMetrics: () => ({ ...stateUpdateMetrics }),
  validateStateUpdate: async (type, payload) => {
    try {
      await validateStateUpdate(type, payload);
      return { valid: true };
    } catch (error) {
      return { valid: false, error: error.message };
    }
  }
};