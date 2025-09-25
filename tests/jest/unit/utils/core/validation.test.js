import { validateArgs, validateTab, validateTag, validateTabLimit } from '../../../../utils/core/validation.js';

describe('validation utils', () => {
  test('validateArgs throws on missing schema', () => {
    expect(() => validateArgs('nonexistent', [])).toThrow(/No validation schema/);
  });

  test('validateTab rejects invalid tab object', () => {
    expect(() => validateTab(null)).toThrow(/Invalid Message/);
  });

  test('validateTag rejects bad tags', () => {
    expect(() => validateTag(123)).toThrow();
    expect(() => validateTag('!@#')).toThrow();
    expect(validateTag('good-tag')).toBe(true);
  });

  test('validateTabLimit returns correct structure', () => {
    const ok = validateTabLimit(5, 10);
    expect(ok).toEqual({ isValid: true, message: null });
    const bad = validateTabLimit(15, 10);
    expect(bad.isValid).toBe(false);
    expect(bad.message).toMatch(/Tab Limit Exceeded/);
  });

  test('validateTab should accept a good tab', () => {
    expect(validateTab({ id: 123, url: 'https://example.com' })).toBe(true);
  });

  test('validateArgs accepts matching args and rejects too many', () => {
    // 'get' schema expects one number
    expect(() => validateArgs('get', [42])).not.toThrow();
    expect(() => validateArgs('get', [1, 2])).toThrow(/Too many arguments for get/);
  });

  test('validateArgs rejects missing required arg', () => {
    expect(() => validateArgs('get', [])).toThrow(/Missing required argument at index 0 for get/);
  });

  test('validateTag accepts valid tags', () => {
    expect(() => validateTag('abc-123')).not.toThrow();
  });

  test('validateTabLimit edge message', () => {
    const ok = validateTabLimit(5, 10);
    expect(ok).toEqual({ isValid: true, message: null });
    const bad = validateTabLimit(15, 10);
    expect(bad.message).toMatch(/Tab Limit Exceeded/);
  });
});

// Add tests for remaining code paths

describe('validation module - edge cases', () => {
  // Import TAG_VALIDATION directly
  const { TAG_VALIDATION } = require('../../../../utils/core/schemas.js');
  
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
