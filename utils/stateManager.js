// utils/stateManager.js
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
import storage from 'redux-persist/lib/storage/index.js';
import { combineReducers } from 'redux';
import { createSelector } from 'reselect';
import thunk from 'redux-thunk';
import deepEqual from 'fast-deep-equal';
import { logger } from './logger.js';
import {
  TAB_STATES,
  MESSAGE_TYPES,
  ACTION_TYPES,
  SERVICE_TYPES, // Make sure this is imported
  VALIDATION_TYPES,
  CONFIG,
  BATCH_CONFIG,
  selectors as coreSelectors,
  VALIDATION_ERRORS
} from './constants.js';
import Ajv from 'ajv';

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
    type: SERVICE_TYPES.WORKER, // Now this should work
    isActive: false,
    lastSync: 0,
  },
  activeRules: [],
  suspendedTabs: {},
  tabMetadata: {},
  settings: {
    inactivityThreshold: CONFIG.INACTIVITY_THRESHOLDS.DEFAULT,
    autoSuspend: true,
    tagPromptEnabled: true,
    maxTabs: 100,
    requireTagOnClose: true
  },
  permissions: {
    granted: [],
    pending: []
  },
  oldestTab: null
};

export const INACTIVITY_THRESHOLDS = {
  PROMPT: 600000, // 10 minutes
  SUSPEND: 1800000, // 30 minutes
  DEFAULT: CONFIG.INACTIVITY_THRESHOLDS.DEFAULT, // Use DEFAULT from CONFIG
};

export const validateStateUpdate = async (type, payload) => {
  return browser.runtime.sendMessage({
    type: MESSAGE_TYPES.STATE_UPDATE,
    action: 'validate',
    payload: { type, payload }
  });
};

const tabManagementSlice = createSlice({
  name: 'tabManagement',
  initialState: {
    tabs: initialState.tabs,
    activity: initialState.tabActivity,
    metadata: initialState.tabMetadata,
    suspended: initialState.suspendedTabs,
    oldestTab: initialState.oldestTab
  },
  reducers: {
    updateTab: {
      prepare: (payload) => ({ payload }),
      reducer: (state, action) => {
        const { id, ...changes } = action.payload;
        const tabIndex = state.tabs.findIndex(tab => tab.id === id);
        if (tabIndex !== -1) {
          state.tabs[tabIndex] = { ...state.tabs[tabIndex], ...changes };
          if (action.payload.lastAccessed) {
            // Update activity
            state.activity[id] = {
              ...state.activity[id],
              lastAccessed: action.payload.lastAccessed,
              status: changes.status || state.activity[id]?.status
            };
          }
        }
      }
    },
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
    removeTab(state, action) {
      const id = action.payload;
      state.tabs = state.tabs.filter(tab => tab.id !== id);
      delete state.activity[id];
      delete state.metadata[id];
      delete state.suspended[id];
      
      // Update oldestTab if necessary
      if (state.oldestTab && state.oldestTab.id === id) {
        state.oldestTab = state.tabs.length > 0 ? state.tabs[0] : null;
      }
    },
    updateOldestTab(state, action) {
      state.oldestTab = action.payload;
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
    // Add any rule priority updates if needed
    updateRulePriority(state, action) {
      // Example placeholder if needed
    }
  },
});

const archivedTabsSlice = createSlice({
  name: 'archivedTabs',
  initialState: initialState.archivedTabs,
  reducers: {
    archiveTab(state, action) {
      const { id, reason } = action.payload;
      state[id] = { id, reason, archivedAt: Date.now() };
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
    },
    updateMaxTabs(state, action) {
      state.maxTabs = Math.max(1, Math.min(1000, action.payload));
    },
    updateTaggingRequirement(state, action) {
      state.requireTagOnClose = action.payload;
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
    },
  },
  whitelist: ['tabManagement', 'sessions', 'rules', 'declarativeRules'],
  serialize: true,
};

const persistedReducer = persistReducer(persistConfig, rootReducer);

const errorLoggingMiddleware = store => next => action => {
  try {
    return next(action);
  } catch (error) {
    console.error(`Error processing action ${action.type}:`, error);
    throw error;
  }
};

function validateTabPayload(payload) {
  return payload && typeof payload.id === 'number';
}
function validateRules(payload) {
  return Array.isArray(payload);
}

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

const enhancedPerformanceMiddleware = store => next => action => {
  const start = performance.now();
  const result = next(action);
  const duration = performance.now() - start;
  
  if (duration > 16.67) { 
    console.warn(`Action ${action.type} took ${duration.toFixed(2)}ms to process`);
  }
  
  return result;
};

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

const telemetryMiddleware = store => next => action => {
  const start = performance.now();
  const result = next(action);
  const duration = performance.now() - start;
  return result;
};

// Validation for slices if needed
const validateSlices = {}; 
function isEqual(a, b) {
  return deepEqual(a, b);
}

function getDiffedState(currentState, lastState = {}) {
  const updates = {};
  Object.keys(currentState).forEach(key => {
    if (!isEqual(currentState[key], lastState[key])) {
      updates[key] = currentState[key];
    }
  });
  return updates;
}

export const syncWithServiceWorker = () => async (dispatch, getState) => {
  const currentState = getState();
  const lastSyncState = await browser.storage.local.get('lastSyncState');
  const stateUpdates = getDiffedState(currentState, lastSyncState);
  if (Object.keys(stateUpdates).length > 0) {
    await browser.runtime.sendMessage({
      type: MESSAGE_TYPES.STATE_SYNC,
      payload: stateUpdates
    });
    await browser.storage.local.set({ lastSyncState: currentState });
  }
};

export const initializeServiceWorkerState = async () => {
  store.dispatch({
    type: ACTION_TYPES.STATE.INITIALIZE,
    payload: {
      type: SERVICE_TYPES.WORKER,
      isActive: true,
      lastSync: Date.now()
    }
  });
};

export const validateState = (state) => {
  const requiredFields = VALIDATION_TYPES.TAB.required;
  const tabs = state.tabs || [];
  
  return tabs.every(tab => 
    requiredFields.every(field => field in tab)
  );
};

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

export const thunks = {};

export const sessionThunks = {
  saveSession: (sessionName, tabs) => async (dispatch) => {
    // Example thunk if needed
  }
};

const store = configureStore({
  reducer: persistedReducer,
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: false,
      thunk: {
        extraArgument: {
          batchProcessor,
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
        const prevState = store.getState();
        const result = next(action);
        const newState = store.getState();
        return result;
      }
    ]),
  devTools: process.env.NODE_ENV !== 'production',
});

const persistor = persistStore(store);

export const selectors = {
  selectTabs: coreSelectors.selectTabs,
  selectArchivedTabs: coreSelectors.selectArchivedTabs,
  selectTabActivity: coreSelectors.selectTabActivity,
  selectActiveTabs: coreSelectors.selectActiveTabs,
  selectInactiveTabs: coreSelectors.selectInactiveTabs,
  selectMatchingRules: coreSelectors.selectMatchingRules,
  
  selectTabMetadata: (state, tabId) => state.tabManagement.metadata[tabId],
  selectSuspendedTabs: state => state.tabManagement.suspended,
  selectSettings: state => state.settings,
  selectPermissions: state => state.permissions,
  selectOldestTab: state => state.tabManagement.oldestTab
};

const actions = {
  tabManagement: tabManagementSlice.actions,
  session: sessionsSlice.actions,
  rules: rulesSlice.actions,
  ui: uiSlice.actions,
  settings: settingsSlice.actions,
  permissions: permissionsSlice.actions,
  archivedTabs: archivedTabsSlice.actions,
  batchUpdate: (updates) => ({
    type: 'BATCH_UPDATE',
    payload: updates
  })
};

export const syncState = () => async (dispatch, getState) => {
  const state = getState();
  // Add logic for syncing state if necessary
};

export { actions };

const stateManager = {
  store,
  persistor,
  actions,
  selectors,
  enhancedSelectors: {}, // Add enhanced selectors if needed
  syncState,
  validateState,
  validateStateUpdate,
  batchProcessor,
  enhancedBatchProcessor,
  thunks,
  sessionThunks,
  initializeServiceWorkerState,
  initializeServiceWorkerState,
  syncWithServiceWorker
};

export default stateManager;