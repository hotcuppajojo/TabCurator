// tests/jest/utils/core/error.test.js

/**
 * @file Unit tests for the small error classes used across the app
 * @description These tests capture the contract consumers depend on: stable error names,
 * predictable messages for programmatic parsing, and a central registry of error types. Tests
 * exist to prevent subtle changes (like renaming an error class) that would break error-based
 * control flow or monitoring tools
 */
import { ValidationError, APIError, TabLimitExceededError, ERROR_TYPES } from '../../../utils/core/error.js';

describe('error module', () => {
  /**
   * @description Error class names are used by code and telemetry. This test ensures the
   * ValidationError continues to present the expected `name` so callers can switch on error
   * type without relying on instanceof across module boundaries
   */
  test('ValidationError has correct name', () => {
    expect(new ValidationError('x').name).toBe('ValidationError');
  });

  /**
   * @description Verifies multiple error classes for both name and message shape. The message
   * text for `TabLimitExceededError` is used in logs and UI copy; making sure it contains
   * 'exceeded' guards against accidental wording changes
   */
  test('APIError and TabLimitExceededError names', () => {
    expect(new APIError('x').name).toBe('APIError');
    expect(new TabLimitExceededError(5).message).toMatch(/exceeded/);
  });

  /**
   * @description The `ERROR_TYPES` map is a central place for canonical error keys. Consumers
   * import these keys to avoid stringly-typed code; asserting presence prevents accidental
   * deletions that would otherwise fail at runtime
   */
  test('ERROR_TYPES contains INVALID_MESSAGE', () => {
    expect(ERROR_TYPES.INVALID_MESSAGE).toBeDefined();
  });

  /**
   * @description A deeper sanity-check for `ValidationError` message plumbing. This test
   * ensures the message passed to the constructor is preserved verbatim, which is important for
   * downstream formatting and analytics
   */
  test('ValidationError has correct name and message', () => {
    const e = new ValidationError('what');
    expect(e.name).toBe('ValidationError');
    expect(e.message).toBe('what');
  });

  /**
   * @description `APIError` should retain a stable class identity (`name`) so callers can
   * distinguish it from other runtime errors during handling and reporting
   */
  test('APIError name', () => {
    const e = new APIError('oops');
    expect(e.name).toBe('APIError');
  });

  /**
   * @description For `TabLimitExceededError` we assert both class name and precise message
   * suffix. This tight assertion prevents regressions that would make programmatic detection of
   * this condition unreliable
   */
  test('TabLimitExceededError message ends with exceeded.', () => {
    const e = new TabLimitExceededError(7);
    expect(e.name).toBe('TabLimitExceededError');
    expect(e.message).toMatch(/7 exceeded\.$/);
  });
});
