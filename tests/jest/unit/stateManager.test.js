import { jest } from '@jest/globals';
import { store, actions } from '../../../utils/stateManager';
import { logger } from '../../../utils/logger';
import { TAB_STATES } from '../../../utils/constants';

jest.mock('../../../utils/logger');

describe('State Manager', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    // Reset store to initial state
    store.dispatch(actions.resetTabManagement());
  });

  describe('validateState', () => {
    test('should validate correct state schema', () => {
      const validState = {
        tabs: [{
          id: 1,
          url: 'https://example.com', // Add required URL
          title: 'Test Tab',
          active: true
        }]
      };
      
      expect(() => {
        store.dispatch(actions.tabManagement.updateTab(validState.tabs[0]));
      }).not.toThrow();
    });

    test('should throw error for invalid state schema', () => {
      const invalidState = {
        tabs: [{
          id: 1, // Add id but missing url
          title: 'Invalid Tab'
        }]
      };
      
      expect(() => {
        store.dispatch(actions.tabManagement.updateTab(invalidState.tabs[0]));
      }).toThrow();
    });
  });

  describe('stateManager', () => {
    test('should initialize with default state', () => {
      const state = store.getState();
      expect(state.tabManagement).toEqual({
        tabs: [],
        activity: {},
        metadata: {},
        suspended: {},
        oldestTab: null
      });
    });

    test('should update state', () => {
      const newTab = {
        id: 1,
        url: 'https://example.com',
        title: 'Test',
        active: true
      };

      store.dispatch(actions.tabManagement.updateTab(newTab));
      const state = store.getState();
      expect(state.tabManagement.tabs).toContainEqual(newTab);
    });
  });
});
