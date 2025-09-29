// tests/jest/utils/core/permission.test.js

/**
 * @file Tests for permission constants used by the extension.
 * @description The `PERMISSIONS` constants centralise permission strings so callers avoid
 * duplication and accidental typos. These tests assert presence of core permissions to ensure
 * permission requests and checks remain correct after refactors
 */
import { PERMISSIONS } from '../../../utils/core/permission.js';

describe('permission constants', () => {
  /**
   * @description Verifying core permission keys (TABS, STORAGE) prevents regressions where
   * a rename could silently break permission requests and lead to unexpected runtime errors
   */
  test('PERMISSIONS includes TABS and STORAGE', () => {
    expect(PERMISSIONS).toHaveProperty('TABS');
    expect(PERMISSIONS).toHaveProperty('STORAGE');
  });
});
