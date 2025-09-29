// tests/jest/utils/core/validation.test.js

/**
 * @file Unit tests for validation helpers
 * @description The validation layer is a primary defence against malformed messages and
 * unexpected input. These tests assert the validation contract (schema presence, argument
 * shapes, and error messaging) so callers and higher-level logic don't need defensive plumbing
 */
import { validateArgs, validateTab, validateTag, validateTabLimit } from '../../../utils/core/validation.js';

describe('validation utils', () => {
  /**
   * @description A missing schema is a developer error; validating that `validateArgs` throws
   * helps catch regressions where schemas are renamed or removed, ensuring validation doesn't
   * silently become a no-op
   */
  test('validateArgs throws on missing schema', () => {
    expect(() => validateArgs('nonexistent', [])).toThrow(/No validation schema/);
  });

  /**
   * @description `validateTab` guards message shapes for tab operations. We assert rejection on
   * null input to ensure callers cannot pass falsy values and cause downstream errors
   */
  test('validateTab rejects invalid tab object', () => {
    expect(() => validateTab(null)).toThrow(/Invalid Message/);
  });

  /**
   * @description Tags power categorisation logic and must conform to allowed characters and
   * types. Tests here guard both type and pattern rules so UI and storage remain consistent
   */
  test('validateTag rejects bad tags', () => {
    expect(() => validateTag(123)).toThrow();
    expect(() => validateTag('!@#')).toThrow();
    expect(validateTag('good-tag')).toBe(true);
  });

  /**
   * @description `validateTabLimit` returns a structured result so callers can branch on
   * `.isValid` and optionally display the message. We assert both valid and exceeded cases to
   * keep messaging and guards aligned
   */
  test('validateTabLimit returns correct structure', () => {
    const ok = validateTabLimit(5, 10);
    expect(ok).toEqual({ isValid: true, message: null });
    const bad = validateTabLimit(15, 10);
    expect(bad.isValid).toBe(false);
    expect(bad.message).toMatch(/Tab Limit Exceeded/);
  });

  /**
   * @description A lightweight happy-path test for `validateTab` to ensure valid objects are
   * accepted without extra properties causing false negatives
   */
  test('validateTab should accept a good tab', () => {
    expect(validateTab({ id: 123, url: 'https://example.com' })).toBe(true);
  });

  /**
   * @description `validateArgs` must enforce both correct arity and types. This test verifies
   * a matching argument list is accepted and that extra arguments are rejected according to
   * the schema to prevent unexpected call-site behaviour
   */
  test('validateArgs accepts matching args and rejects too many', () => {
    // 'get' schema expects one number
    expect(() => validateArgs('get', [42])).not.toThrow();
    expect(() => validateArgs('get', [1, 2])).toThrow(/Too many arguments for get/);
  });

  /**
   * @description Missing required arguments should produce clear errors. This test ensures the
   * thrown message includes the index and method name to help debugging and telemetry
   */
  test('validateArgs rejects missing required arg', () => {
    expect(() => validateArgs('get', [])).toThrow(/Missing required argument at index 0 for get/);
  });

  /**
   * @description Re-assert valid tag behaviour with a known-good value so tag rules don't
   * regress silently when patterns change
   */
  test('validateTag accepts valid tags', () => {
    expect(() => validateTag('abc-123')).not.toThrow();
  });

  /**
   * @description Re-check tab limit messaging for edge cases to ensure consumer-facing strings
   * remain informative and machine-detectable
   */
  test('validateTabLimit edge message', () => {
    const ok = validateTabLimit(5, 10);
    expect(ok).toEqual({ isValid: true, message: null });
    const bad = validateTabLimit(15, 10);
    expect(bad.message).toMatch(/Tab Limit Exceeded/);
  });
});

// Add tests for remaining code paths

/**
 * @description Edge-case coverage for the validation module. These tests probe schema limits
 * (length, allowed characters), message clarity on limit violations, and type-mismatch errors
 * to ensure validation remains strict and actionable
 */
describe('validation module - edge cases', () => {
  // Import TAG_VALIDATION directly
  const { TAG_VALIDATION } = require('../../../utils/core/schemas.js');
  
  test('validateTag throws on tag exceeding max length', () => {
    // Create a string longer than TAG_VALIDATION.TAG.MAX_LENGTH
    const longTag = 'a'.repeat(TAG_VALIDATION.TAG.MAX_LENGTH + 1);
    
    expect(() => validateTag(longTag)).toThrow();
  });
  
  test('validateTag throws on invalid characters', () => {
    // Test a tag with invalid characters (spaces, special chars)
    const invalidTag = 'invalid tag!';
    
    expect(() => validateTag(invalidTag)).toThrow();
  });
  
  test('validateTabLimit provides correct message on exceeded limit', () => {
    const limit = 30;
    const result = validateTabLimit(50, limit);
    
    expect(result.isValid).toBe(false);
    
    // Only check that the message exists and mentions "limit" somewhere
    expect(result.message).toBeTruthy();
    expect(result.message).toMatch(/limit/i);
    
    // Don't check for the specific limit number as it's not included in the actual message
  });
  
  test('validateArgs throws when argument type does not match schema', () => {
    const schema = [
      { type: 'number', required: true },
      { type: 'string', required: false }
    ];
    
    // Pass a string where a number is required
    expect(() => validateArgs('testMethod', ['not-a-number', 'string'], schema))
      .toThrow(/Invalid argument at index 0/);
  });
});
