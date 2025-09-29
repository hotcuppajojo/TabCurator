// tests/jest/utils/core/schemas.test.js

/**
 * @file Tests for shared validation and state schemas
 * @description These schemas encode the structural contracts used in validation and state
 * management. Tests assert presence of canonical schemas and error keys so changes to the
 * validation layer don't silently alter runtime behaviour
 */
import { VALIDATION_SCHEMAS, STATE_SCHEMA, SLICE_SCHEMAS, VALIDATION_ERRORS } from '../../../utils/core/schemas.js';

describe('schemas', () => {
  /**
   * @description `VALIDATION_SCHEMAS` drives argument validation across the codebase. This
   * test ensures core method schemas (like `create`) remain registered so validation continues
   * to protect public APIs
   */
  test('VALIDATION_SCHEMAS contains known methods', () => {
    expect(VALIDATION_SCHEMAS).toHaveProperty('create');
  });

  /**
   * @description `STATE_SCHEMA` defines what the persisted state looks like. Verifying required
   * top-level properties such as `tabs` prevents schema regressions that would break state
   * hydration or storage migrations
   */
  test('STATE_SCHEMA has required tabs property', () => {
    expect(STATE_SCHEMA.properties).toHaveProperty('tabs');
  });

  /**
   * @description `SLICE_SCHEMAS` contains validation for different state slices. Ensuring the
   * `tabManagement` slice exists prevents accidental removals which would otherwise let invalid
   * state pass through
   */
  test('SLICE_SCHEMAS defines tabManagement', () => {
    expect(SLICE_SCHEMAS).toHaveProperty('tabManagement');
  });

  /**
   * @description `VALIDATION_ERRORS` centralises error keys produced by the validation layer.
   * Tests guard against deletion/rename of keys like `TAB_LIMIT_EXCEEDED` which callers rely on
   * for control flow and telemetry
   */
  test('VALIDATION_ERRORS includes TAB_LIMIT_EXCEEDED', () => {
    expect(VALIDATION_ERRORS.TAB_LIMIT_EXCEEDED).toBeDefined();
  });
});
