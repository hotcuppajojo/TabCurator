// tests/jest/utils/core/state.test.js

/**
 * @file Unit tests for core state constants and selectors.
 * @description Selectors form the API for reading structured state across the app. These
 * tests validate the selector contract (returned types, defaults, and mappings) and assert the
 * exported `STATE` object is immutable to prevent accidental runtime mutation bugs
 */
import { STATE, coreSelectors, selectors } from '../../../utils/core/state.js';

describe('core state selectors - thorough coverage', () => {
  // A representative, dense fake state to exercise selector branches deterministically
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

  /**
   * @description `STATE` is expected to be treated as an immutable constant by consumers.
   * Freezing it helps catch accidental mutations at development time; this test alerts
   * maintainers that the immutability contract has changed
   */
  test('STATE is frozen (immutable)', () => {
    expect(Object.isFrozen(STATE)).toBe(true);
  });

  /**
   * @description Basic contract: `selectTabs` should return an array. Tests use the dense
   * `fakeState` to ensure selectors map to the expected slice shape
   */
  test('selectTabs returns tabs array', () => {
    expect(coreSelectors.selectTabs(fakeState)).toEqual(fakeState.tabManagement.tabs);
  });

  /**
   * @description `selectTabById` must return the exact tab object when present and `undefined`
   * when missing. This prevents downstream code from receiving unexpected structures
   */
  test('selectTabById returns correct tab and undefined for missing', () => {
    expect(coreSelectors.selectTabById(fakeState, 2)).toEqual(fakeState.tabManagement.tabs[1]);
    expect(coreSelectors.selectTabById(fakeState, 999)).toBeUndefined();
  });

  /**
   * @description Activity, metadata and suspended slices are consumed by different UI paths; we
   * assert selectors return the raw maps so consumers can index them without additional
   * transformation
   */
  test('selectTabActivity returns activity map', () => {
    expect(coreSelectors.selectTabActivity(fakeState)).toEqual(fakeState.tabManagement.activity);
  });

  test('selectTabMetadata returns metadata', () => {
    expect(coreSelectors.selectTabMetadata(fakeState)).toEqual(fakeState.tabManagement.metadata);
  });

  test('selectSuspendedTabs returns suspended object', () => {
    expect(coreSelectors.selectSuspendedTabs(fakeState)).toEqual(fakeState.tabManagement.suspended);
  });

  /**
   * @description `selectOldestTab` is used by aging policies. We assert the selector returns
   * the previously computed `oldestTab` object to guarantee policy logic receives a stable
   * representation
   */
  test('selectOldestTab returns oldestTab value', () => {
    expect(coreSelectors.selectOldestTab(fakeState)).toEqual(fakeState.tabManagement.oldestTab);
  });

  /**
   * @description Sessions selectors must be able to find sessions by id and return the full
   * sessions array. This test protects both lookup and list behaviours
   */
  test('selectSessions and selectSessionById work', () => {
    expect(coreSelectors.selectSessions(fakeState)).toEqual(fakeState.sessions);
    expect(coreSelectors.selectSessionById(fakeState, 's2')).toEqual({ id: 's2', name: 'second' });
  });

  /**
   * @description Settings and derived helpers (like `selectMaxTabs`) are small primitives used
   * across the app; this test asserts both direct slice access and a derived getter return the
   * expected values
   */
  test('selectSettings and selectMaxTabs work', () => {
    expect(coreSelectors.selectSettings(fakeState)).toEqual(fakeState.settings);
    expect(coreSelectors.selectMaxTabs(fakeState)).toBe(5);
  });

  test('selectPermissions and selectArchivedTabs return correct slices', () => {
    expect(coreSelectors.selectPermissions(fakeState)).toEqual(fakeState.permissions);
    expect(coreSelectors.selectArchivedTabs(fakeState)).toEqual(fakeState.archivedTabs);
  });

  /**
   * @description The `selectors` module re-exports or wraps `coreSelectors` for public usage.
   * We assert parity so callers of the public API observe identical behaviour to the internal
   * selectors used in reducers and tests
   */
  test('selectors (re-export) mirror coreSelectors behavior', () => {
    expect(selectors.selectTabs(fakeState)).toEqual(coreSelectors.selectTabs(fakeState));
    expect(selectors.selectOldestTab(fakeState)).toEqual(coreSelectors.selectOldestTab(fakeState));
    expect(selectors.selectMaxTabs(fakeState)).toEqual(coreSelectors.selectMaxTabs(fakeState));
  });

  /**
   * @description Selectors should provide safe defaults when the state shape is partial or
   * missing. This keeps consumers simple and avoids pervasive null-checks at call sites
   */
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
