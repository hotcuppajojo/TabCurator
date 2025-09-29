// tests/jest/testUtils.js
/**
 * @file Test utilities for building deterministic Redux stores in unit tests
 * @rationale Provide a small, composable store factory to make unit tests
 * independent and fast. Tests can opt-in to only the state slices they interact with
 * which reduces setup noise and makes intent clearer
 */

import { configureStore, createReducer } from '@reduxjs/toolkit';
import { TAB_OPERATIONS } from '../../utils/constants'; // Keep constants available for future selector or action tests

/**
 * @rationale createTestStore centralizes reducer wiring used across tests so
 * suites remain consistent with production slice shapes. The factory accepts
 * an initialState to allow focused tests to override only the necessary slices
 */
export const createTestStore = (initialState = {}) => {
  // Tab management reducer used in many tests. Keep reducer small and explicit
  // so tests can reason about the exact mutations that matter to assertions
  const tabManagementReducer = createReducer(
    {
      tabs: [],
      activity: {},
      metadata: {},
      suspended: {},
      oldestTab: null,
      ...initialState.tabManagement // Merge provided initial tab state for targeted tests
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

  /**
   * @rationale createEmptyReducer provides minimal state containers for slices
   * that tests do not exercise. This keeps the store shape stable while
   * avoiding unnecessary reducer logic in unit tests
   */
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
          // Keep settings update logic minimal and predictable for tests
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
