import { configureStore } from '@reduxjs/toolkit';
import stateManager, { actions } from '../../../utils/stateManager.js';

describe('Tab Management Reducer', () => {
  let store;

  beforeEach(() => {
    // Create a test store with just the tab management slice
    store = configureStore({
      reducer: {
        tabManagement: (state = {
          tabs: [],
          activity: {},
          metadata: {},
          suspended: {},
          oldestTab: null
        }, action) => {
          switch (action.type) {
            case 'tabManagement/updateTab':
              const { id, ...changes } = action.payload;
              const idx = state.tabs.findIndex(tab => tab.id === id);
              if (idx !== -1) {
                const newTabs = [...state.tabs];
                newTabs[idx] = { ...newTabs[idx], ...changes };
                return { ...state, tabs: newTabs };
              } else {
                return { 
                  ...state, 
                  tabs: [...state.tabs, { id, ...changes }] 
                };
              }
            case 'tabManagement/removeTab':
              return { 
                ...state, 
                tabs: state.tabs.filter(tab => tab.id !== action.payload) 
              };
            case 'tabManagement/updateOldestTab':
              return { ...state, oldestTab: action.payload };
            default:
              return state;
          }
        }
      }
    });
  });

  test('should update existing tab', () => {
    // Add initial tab
    store.dispatch({
      type: 'tabManagement/updateTab',
      payload: { id: 1, title: 'Original Title', url: 'https://example.com' }
    });

    // Update the tab
    store.dispatch({
      type: 'tabManagement/updateTab',
      payload: { id: 1, title: 'Updated Title' }
    });

    const state = store.getState();
    const updatedTab = state.tabManagement.tabs.find(tab => tab.id === 1);
    
    expect(updatedTab.title).toBe('Updated Title');
    expect(updatedTab.url).toBe('https://example.com'); // Should preserve existing properties
  });

  test('should add new tab if not exists', () => {
    store.dispatch({
      type: 'tabManagement/updateTab',
      payload: { id: 1, title: 'New Tab', url: 'https://example.com' }
    });

    const state = store.getState();
    expect(state.tabManagement.tabs).toHaveLength(1);
    expect(state.tabManagement.tabs[0]).toMatchObject({
      id: 1,
      title: 'New Tab',
      url: 'https://example.com'
    });
  });

  test('should remove tab', () => {
    // Add tab first
    store.dispatch({
      type: 'tabManagement/updateTab',
      payload: { id: 1, title: 'Tab to Remove', url: 'https://example.com' }
    });

    // Remove tab
    store.dispatch({
      type: 'tabManagement/removeTab',
      payload: 1
    });

    const state = store.getState();
    expect(state.tabManagement.tabs).toHaveLength(0);
  });

  test('should update oldest tab', () => {
    const oldestTab = { id: 2, lastAccessed: 1000 };
    
    store.dispatch({
      type: 'tabManagement/updateOldestTab',
      payload: oldestTab
    });

    const state = store.getState();
    expect(state.tabManagement.oldestTab).toEqual(oldestTab);
  });
});
