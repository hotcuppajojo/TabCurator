import { configureStore } from '@reduxjs/toolkit';
import { TAB_STATES } from '../mocks/constantsMock';

// Create a test reducer
const tabManagementReducer = (state = {
  tabs: [],
  metadata: {},
  activity: {}
}, action) => {
  switch (action.type) {
    case 'tabManagement/updateTab':
      return {
        ...state,
        tabs: [action.payload]
      };
    case 'tabManagement/updateMetadata':
      return {
        ...state,
        metadata: {
          ...state.metadata,
          [action.payload.tabId]: action.payload.data
        }
      };
    case 'RESET_STATE':
      return {
        tabs: [],
        metadata: {},
        activity: {}
      };
    default:
      return state;
  }
};

// Create test store
const createTestStore = () => configureStore({
  reducer: {
    tabManagement: tabManagementReducer
  }
});

describe('Tab Management Reducer', () => {
  let store;

  beforeEach(() => {
    store = createTestStore();
    store.dispatch({ type: 'RESET_STATE' });
  });

  test('should update tab state', () => {
    const mockTab = { id: 1, url: 'https://example.com' };
    
    store.dispatch({
      type: 'tabManagement/updateTab',
      payload: mockTab
    });

    const state = store.getState();
    expect(state.tabManagement.tabs).toContainEqual(expect.objectContaining(mockTab));
  });

  test('should handle tab suspension', () => {
    const mockTab = { id: 1, url: 'https://example.com' };
    
    store.dispatch({
      type: 'tabManagement/updateTab',
      payload: { ...mockTab, status: TAB_STATES.SUSPENDED }
    });

    const state = store.getState();
    expect(state.tabManagement.tabs[0].status).toBe(TAB_STATES.SUSPENDED);
  });

  test('should update metadata correctly', () => {
    const mockMetadata = { 
      tabId: 1, 
      data: { lastAccessed: Date.now() }
    };
    
    store.dispatch({
      type: 'tabManagement/updateMetadata',
      payload: mockMetadata
    });

    const state = store.getState();
    expect(state.tabManagement.metadata[mockMetadata.tabId]).toBeDefined();
  });
});
