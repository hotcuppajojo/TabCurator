// tests/jest/selectors/tabSelectors.test.js

import { configureStore } from '@reduxjs/toolkit';
import { CONFIG } from '../mocks/constantsMock';

// Create test reducer with proper activity state handling
const tabManagementReducer = (state = {
  tabs: [],
  activity: {},
  metadata: {}
}, action) => {
  switch (action.type) {
    case 'tabManagement/setTabs':
      return {
        ...state,
        tabs: action.payload
      };
    case 'tabManagement/setActivity':
      return {
        ...state,
        activity: action.payload
      };
    case 'RESET_STATE':
      return {
        tabs: [],
        activity: {},
        metadata: {}
      };
    default:
      return state;
  }
};

// Create the store factory
const createTestStore = () => configureStore({
  reducer: {
    tabManagement: tabManagementReducer
  }
});

// Update selectors to properly check activity state
const selectors = {
  selectTabs: state => state.tabManagement.tabs,
  selectActiveTabs: state => state.tabManagement.tabs.filter(tab => tab.active),
  selectInactiveTabs: state => {
    const now = Date.now();
    const activity = state.tabManagement.activity;
    return state.tabManagement.tabs.filter(tab => {
      const tabActivity = activity[tab.id];
      if (!tabActivity) return false;
      return (now - tabActivity.lastAccessed) > (CONFIG.INACTIVITY_THRESHOLDS?.PROMPT || 600000);
    });
  }
};

describe('Tab Selectors', () => {
  let store;
  let now;

  beforeEach(() => {
    now = Date.now();
    store = createTestStore();
  });

  test('should select active tabs', () => {
    const mockTabs = [
      { id: 1, active: true },
      { id: 2, active: false }
    ];

    store.dispatch({
      type: 'tabManagement/setTabs',
      payload: mockTabs
    });

    const state = store.getState();
    const activeTabs = selectors.selectActiveTabs(state);
    expect(activeTabs).toHaveLength(1);
    expect(activeTabs[0].id).toBe(1);
  });

  test('should select inactive tabs based on activity', () => {
    const mockTabs = [
      { id: 1 },
      { id: 2 }
    ];

    const mockActivity = {
      1: { lastAccessed: now - 3600000 }, // 1 hour ago
      2: { lastAccessed: now } // current
    };

    store.dispatch({
      type: 'tabManagement/setTabs',
      payload: mockTabs
    });

    store.dispatch({
      type: 'tabManagement/setActivity',
      payload: mockActivity
    });

    const state = store.getState();
    const inactiveTabs = selectors.selectInactiveTabs(state);
    expect(inactiveTabs).toHaveLength(1);
    expect(inactiveTabs[0].id).toBe(1); // Fixed the syntax error here
  });
});