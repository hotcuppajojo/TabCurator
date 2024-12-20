import { configureStore, createReducer } from '@reduxjs/toolkit';
import { TAB_OPERATIONS } from '../../utils/constants'; // Ensure constants are imported if needed

export const createTestStore = (initialState = {}) => {
  const tabManagementReducer = createReducer(
    {
      tabs: [],
      activity: {},
      metadata: {},
      suspended: {},
      oldestTab: null,
      ...initialState.tabManagement // Add this line to merge provided initial state
    },
    (builder) => {
      builder
        .addCase('tabManagement/setTabs', (state, action) => {
          state.tabs = action.payload;
        })
        .addCase('tabManagement/setOldestTab', (state, action) => {
          state.oldestTab = action.payload;
        })
        .addCase('tabManagement/removeTab', (state, action) => {
          const id = action.payload;
          state.tabs = state.tabs.filter(tab => tab.id !== id);
          if (state.oldestTab?.id === id) {
            state.oldestTab = null;
          }
        });
    }
  );

  const createEmptyReducer = (initialState) => createReducer(initialState, (builder) => {});

  return configureStore({
    reducer: {
      tabManagement: tabManagementReducer,
      sessions: createEmptyReducer([]),
      rules: createEmptyReducer([]),
      archivedTabs: createEmptyReducer({}),
      savedSessions: createEmptyReducer({}),
      ui: createEmptyReducer({ isTaggingPromptActive: false }),
      declarativeRules: createEmptyReducer([]),
      serviceWorker: createEmptyReducer({
        type: 'WORKER',
        isActive: false,
        lastSync: 0
      }),
      settings: createReducer(
        {
          inactivityThreshold: 60,
          autoSuspend: true,
          tagPromptEnabled: true,
          maxTabs: 100,
          requireTagOnClose: true,
          ...initialState.settings
        },
        (builder) => {
          builder.addCase('settings/updateSettings', (state, action) => {
            return { ...state, ...action.payload };
          });
        }
      ),
      permissions: createEmptyReducer({
        granted: [],
        pending: []
      })
    },
    preloadedState: initialState
  });
};
