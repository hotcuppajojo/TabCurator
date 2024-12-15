// utils/stateManager.ts

import browser from 'webextension-polyfill';
import { configureStore, createSlice, PayloadAction } from '@reduxjs/toolkit'; // Removed getDefaultMiddleware
import { persistStore, persistReducer, PersistConfig } from 'redux-persist';
import storage from 'redux-persist/lib/storage'; // or another storage adapter
import { combineReducers, Reducer, Action } from 'redux'; // Updated import to use Action
import { createSelector } from 'reselect';
import { isTaggingPromptActive } from './tagUtils';
import { 
  TAB_STATES, 
  MESSAGE_TYPES, 
  ACTION_TYPES, 
  ERROR_TYPES,
  SERVICE_TYPES,
  VALIDATION_TYPES,
  PERMISSIONS,
  SW_EVENTS,
  BATCH_CONFIG
} from './types.js';

// Define explicit types for state
interface Tab {
  id: number;
  title: string;
  url: string;
  active: boolean;
  state: keyof typeof TAB_STATES;  // Now using TAB_STATES from types.js
}

interface Session {
  name: string;
  tabs: Tab[];
}

interface Rule {
  id: number;
  condition: string;
  action: string;
}

// Add interfaces for MV3 support
interface DeclarativeRule {
  id: number;
  priority: number;
  condition: {
    urlFilter: string;
    resourceTypes: string[];
    domains?: string[];
  };
  action: {
    type: string;
    responseHeaders?: Array<{
      header: string;
      operation: string;
      value: string;
    }>;
  };
}

interface TabActivity {
  lastAccessed: number;
  suspensionStatus: keyof typeof TAB_STATES;
  tags?: string[];
}

interface AppState {
  tabs: Tab[];
  sessions: Session[];
  rules: (Rule | DeclarativeRule)[];
  archivedTabs: Record<number, Tab>;
  tabActivity: Record<number, TabActivity>;
  savedSessions: Record<string, Session>;
  isTaggingPromptActive: boolean;
  declarativeRules: DeclarativeRule[];
  serviceWorker: {
    type: keyof typeof SERVICE_TYPES;
    isActive: boolean;
    lastSync: number;
  };
}

// Initial state
const initialState: AppState = {
  tabs: [],
  sessions: [],
  rules: [],
  archivedTabs: {},
  tabActivity: {},
  savedSessions: {},
  isTaggingPromptActive: false,
  declarativeRules: [],
  serviceWorker: {
    type: SERVICE_TYPES.WORKER, // Changed from 'worker' to SERVICE_TYPES.WORKER
    isActive: false,
    lastSync: 0,
  },
};

// Create slices
const tabsSlice = createSlice({
  name: 'tabs',
  initialState: initialState.tabs,
  reducers: {
    addTab(state, action: PayloadAction<Tab>) {
      state.push(action.payload);
    },
    removeTab(state, action: PayloadAction<number>) {
      return state.filter(tab => tab.id !== action.payload);
    },
    updateTab(state, action: PayloadAction<Tab>) {
      const index = state.findIndex(tab => tab.id === action.payload.id);
      if (index !== -1) {
        state[index] = action.payload;
      }
    },
  },
});

const sessionsSlice = createSlice({
  name: 'sessions',
  initialState: initialState.sessions,
  reducers: {
    saveSession(state, action: PayloadAction<Session>) {
      state.push(action.payload);
    },
    deleteSession(state, action: PayloadAction<string>) {
      return state.filter(session => session.name !== action.payload);
    },
  },
});

// Remove duplicate rulesSlice and merge with declarativeRulesSlice
const rulesSlice = createSlice({
  name: 'rules',
  initialState: initialState.rules,
  reducers: {
    addRule(state, action: PayloadAction<Rule | DeclarativeRule>) {
      state.push(action.payload);
    },
    updateRules(state, action: PayloadAction<(Rule | DeclarativeRule)[]>) {
      return action.payload;
    },
  },
});

const archivedTabsSlice = createSlice({
  name: 'archivedTabs',
  initialState: initialState.archivedTabs,
  reducers: {
    archiveTab(state, action: PayloadAction<Tab>) {
      state[action.payload.id] = action.payload;
    },
    removeArchivedTab(state, action: PayloadAction<number>) {
      delete state[action.payload];
    },
  },
});

// Replace duplicate tab activity reducers with a single implementation
const tabActivitySlice = createSlice({
  name: 'tabActivity',
  initialState: initialState.tabActivity,
  reducers: {
    updateTabActivity(state, action: PayloadAction<{ 
      tabId: number; 
      activity?: Partial<TabActivity>;
      timestamp?: number;
    }>) {
      const { tabId, activity, timestamp } = action.payload;
      state[tabId] = { 
        ...state[tabId], 
        ...activity, 
        lastAccessed: timestamp || Date.now(),
        suspensionStatus: activity?.suspensionStatus || TAB_STATES.ACTIVE 
      };
    },
    scheduleTabSuspension(state, action: PayloadAction<number>) {
      const tabId = action.payload;
      if (state[tabId]) {
        state[tabId].suspensionStatus = TAB_STATES.SUSPENDED;
      }
    }
  },
});

const savedSessionsSlice = createSlice({
  name: 'savedSessions',
  initialState: initialState.savedSessions,
  reducers: {
    saveSessionData(state, action: PayloadAction<{ sessionName: string; session: Session }>) {
      state[action.payload.sessionName] = action.payload.session;
    },
    deleteSessionData(state, action: PayloadAction<string>) {
      delete state[action.payload];
    },
  },
});

const uiSlice = createSlice({
  name: 'ui',
  initialState: { isTaggingPromptActive: initialState.isTaggingPromptActive },
  reducers: {
    setTaggingPrompt(state, action: PayloadAction<boolean>) {
      state.isTaggingPromptActive = action.payload;
    },
  },
});

// Update rootReducer typing to use AppState
const rootReducer: Reducer<AppState, Action> = combineReducers({
  tabs: tabsSlice.reducer,
  sessions: sessionsSlice.reducer,
  rules: rulesSlice.reducer,
  archivedTabs: archivedTabsSlice.reducer,
  tabActivity: tabActivitySlice.reducer,
  savedSessions: savedSessionsSlice.reducer,
  ui: uiSlice.reducer,
  declarativeRules: rulesSlice.reducer,
});

// Persist configuration
const persistConfig: PersistConfig<AppState, any, any, any> = {
  key: 'root',
  storage: {
    getItem: async (key: string) => {
      const result = await browser.storage.local.get(key);
      return result[key];
    },
    setItem: async (key: string, value: any) => {
      await browser.storage.local.set({ [key]: value });
    },
    removeItem: async (key: string) => {
      await browser.storage.local.remove(key);
    }
  },
  whitelist: ['tabs', 'sessions', 'rules', 'declarativeRules'],
  serialize: true,
  deserialize: true,
};

// Create persisted reducer
const persistedReducer = persistReducer(persistConfig, rootReducer);

// Configure store with middleware
const store = configureStore({
  reducer: persistedReducer,
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: false, // Adjust based on your state requirements
      // Additional middleware options can be configured here
    }), // Removed .concat(thunk)
  devTools: process.env.NODE_ENV !== 'production',
});

// Persistor
const persistor = persistStore(store);

// Consolidate selectors
const createTabSelector = (selector: (state: AppState) => any) => 
  createSelector([selector], (data) => data);

export const {
  selectTabs,
  selectArchivedTabs,
  selectTabActivity,
  selectActiveTabs,
  selectInactiveTabs,
  selectMatchingRules,
} = {
  selectTabs: createTabSelector((state) => state.tabs),
  selectArchivedTabs: createTabSelector((state) => state.archivedTabs),
  selectTabActivity: createTabSelector((state) => state.tabActivity),
  selectActiveTabs: createSelector([selectTabs], (tabs) => 
    tabs.filter(tab => tab.active)
  ),
  selectInactiveTabs: createSelector(
    [selectTabActivity, selectTabs],
    (activity, tabs) => tabs.filter(tab => {
      const lastAccessed = activity[tab.id]?.lastAccessed || Date.now();
      return (now - lastAccessed) > INACTIVITY_THRESHOLDS.PROMPT;
    })
  ),
  selectMatchingRules: createSelector(
    [(state) => state.declarativeRules, (_, url: string) => url],
    (rules, url) => rules.filter(rule => 
      new RegExp(rule.condition.urlFilter.replace(/\*/g, '.*')).test(url)
    )
  ),
};

// Remove duplicate actions exports and combine them
export const actions = {
  tab: { ...tabsSlice.actions },
  session: { ...sessionsSlice.actions },
  rules: { ...rulesSlice.actions },
  activity: { ...tabActivitySlice.actions },
  ui: { ...uiSlice.actions },
};

// Export store and persistor
export { store, persistor };

// Add service worker state sync
export const syncWithServiceWorker = () => async (dispatch: AppDispatch) => {
  const state = store.getState();
  await browser.runtime.sendMessage({
    type: MESSAGE_TYPES.STATE_SYNC,
    payload: state
  });
};

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
export const validateState = (state: Partial<AppState>): boolean => {
  const requiredFields = VALIDATION_TYPES.TAB.required;
  const tabs = state.tabs || [];
  
  return tabs.every(tab => 
    requiredFields.every(field => field in tab)
  );
};

// Consolidate batch processing
export const batchProcessor = {
  process: async <T>(
    items: T[],
    processor: (item: T) => Promise<void>,
    batchSize = BATCH_CONFIG.DEFAULT_SIZE
  ) => {
    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + Math.min(batchSize, BATCH_CONFIG.MAX_SIZE));
      await Promise.all(batch.map(processor));
    }
  },
  
  createIterator: async function* <T>(items: T[], size = BATCH_CONFIG.DEFAULT_SIZE) {
    for (let i = 0; i < items.length; i += size) {
      yield items.slice(i, i + Math.min(size, BATCH_CONFIG.MAX_SIZE));
    }
  }
};