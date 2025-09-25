import { STATE, coreSelectors, selectors } from '../../../../utils/core/state.js';

describe('core state selectors - thorough coverage', () => {
  const fakeState = {
    tabManagement: {
      tabs: [
        { id: 1, url: 'https://a.example', title: 'A', lastAccessed: 100 },
        { id: 2, url: 'https://b.example', title: 'B', lastAccessed: 50 },
        { id: 3, url: 'https://c.example', title: 'C', lastAccessed: 200 }
      ],
      activity: {
        1: { lastAccessed: 100 },
        2: { lastAccessed: 50 },
        3: { lastAccessed: 200 }
      },
      metadata: {
        1: { tags: ['x'] },
        2: { tags: [] }
      },
      suspended: { 2: true },
      oldestTab: { id: 2, url: 'https://b.example', title: 'B' }
    },
    sessions: [{ id: 's1', name: 'first' }, { id: 's2', name: 'second' }],
    settings: { maxTabs: 5, requireTagOnClose: true },
    permissions: { bookmarks: true },
    archivedTabs: { a: { id: 'a', url: 'https://archived' } }
  };

  test('STATE is frozen (immutable)', () => {
    expect(Object.isFrozen(STATE)).toBe(true);
  });

  test('selectTabs returns tabs array', () => {
    expect(coreSelectors.selectTabs(fakeState)).toEqual(fakeState.tabManagement.tabs);
  });

  test('selectTabById returns correct tab and undefined for missing', () => {
    expect(coreSelectors.selectTabById(fakeState, 2)).toEqual(fakeState.tabManagement.tabs[1]);
    expect(coreSelectors.selectTabById(fakeState, 999)).toBeUndefined();
  });

  test('selectTabActivity returns activity map', () => {
    expect(coreSelectors.selectTabActivity(fakeState)).toEqual(fakeState.tabManagement.activity);
  });

  test('selectTabMetadata returns metadata', () => {
    expect(coreSelectors.selectTabMetadata(fakeState)).toEqual(fakeState.tabManagement.metadata);
  });

  test('selectSuspendedTabs returns suspended object', () => {
    expect(coreSelectors.selectSuspendedTabs(fakeState)).toEqual(fakeState.tabManagement.suspended);
  });

  test('selectOldestTab returns oldestTab value', () => {
    expect(coreSelectors.selectOldestTab(fakeState)).toEqual(fakeState.tabManagement.oldestTab);
  });

  test('selectSessions and selectSessionById work', () => {
    expect(coreSelectors.selectSessions(fakeState)).toEqual(fakeState.sessions);
    expect(coreSelectors.selectSessionById(fakeState, 's2')).toEqual({ id: 's2', name: 'second' });
  });

  test('selectSettings and selectMaxTabs work', () => {
    expect(coreSelectors.selectSettings(fakeState)).toEqual(fakeState.settings);
    expect(coreSelectors.selectMaxTabs(fakeState)).toBe(5);
  });

  test('selectPermissions and selectArchivedTabs return correct slices', () => {
    expect(coreSelectors.selectPermissions(fakeState)).toEqual(fakeState.permissions);
    expect(coreSelectors.selectArchivedTabs(fakeState)).toEqual(fakeState.archivedTabs);
  });

  test('selectors (re-export) mirror coreSelectors behavior', () => {
    expect(selectors.selectTabs(fakeState)).toEqual(coreSelectors.selectTabs(fakeState));
    expect(selectors.selectOldestTab(fakeState)).toEqual(coreSelectors.selectOldestTab(fakeState));
    expect(selectors.selectMaxTabs(fakeState)).toEqual(coreSelectors.selectMaxTabs(fakeState));
  });

  test('selectors return defaults when state is missing slices', () => {
    const empty = {};
    expect(coreSelectors.selectTabs(empty)).toEqual([]);
    expect(coreSelectors.selectTabActivity(empty)).toEqual({});
    expect(coreSelectors.selectTabMetadata(empty)).toEqual({});
    expect(coreSelectors.selectSuspendedTabs(empty)).toEqual({});
    expect(coreSelectors.selectSessions(empty)).toEqual([]);
    expect(coreSelectors.selectSettings(empty)).toEqual({});
    expect(coreSelectors.selectMaxTabs(empty)).toBeUndefined();
  });
});
