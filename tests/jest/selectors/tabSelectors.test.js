import { coreSelectors, selectors } from '../../../utils/core/state.js';

describe('Tab Selectors', () => {
  const mockState = {
    tabManagement: {
      tabs: [
        { id: 1, title: 'Tab 1', url: 'https://example1.com' },
        { id: 2, title: 'Tab 2', url: 'https://example2.com' }
      ],
      activity: {
        1: { lastAccessed: 1000 },
        2: { lastAccessed: 2000 }
      },
      metadata: {
        1: { tags: ['work'] },
        2: { tags: ['personal'] }
      },
      suspended: {},
      oldestTab: { id: 1, lastAccessed: 1000 }
    },
    sessions: [
      { id: 'session1', name: 'Work Session' }
    ],
    settings: {
      maxTabs: 50
    }
  };

  test('selectTabs returns tabs array', () => {
    const tabs = coreSelectors.selectTabs(mockState);
    expect(tabs).toEqual(mockState.tabManagement.tabs);
  });

  test('selectTabById returns correct tab', () => {
    const tab = coreSelectors.selectTabById(mockState, 1);
    expect(tab).toEqual(mockState.tabManagement.tabs[0]);
  });

  test('selectTabActivity returns activity map', () => {
    const activity = coreSelectors.selectTabActivity(mockState);
    expect(activity).toEqual(mockState.tabManagement.activity);
  });

  test('selectOldestTab returns oldest tab', () => {
    const oldestTab = coreSelectors.selectOldestTab(mockState);
    expect(oldestTab).toEqual(mockState.tabManagement.oldestTab);
  });

  test('selectSettings returns settings', () => {
    const settings = coreSelectors.selectSettings(mockState);
    expect(settings).toEqual(mockState.settings);
  });

  test('selectMaxTabs returns max tabs setting', () => {
    const maxTabs = coreSelectors.selectMaxTabs(mockState);
    expect(maxTabs).toBe(50);
  });
});
