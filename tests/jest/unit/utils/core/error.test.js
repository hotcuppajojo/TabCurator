import { ValidationError, APIError, TabLimitExceededError, ERROR_TYPES } from '../../../../utils/core/error.js';

describe('error module', () => {
  test('ValidationError has correct name', () => {
    expect(new ValidationError('x').name).toBe('ValidationError');
  });
  test('APIError and TabLimitExceededError names', () => {
    expect(new APIError('x').name).toBe('APIError');
    expect(new TabLimitExceededError(5).message).toMatch(/exceeded/);
  });
  test('ERROR_TYPES contains INVALID_MESSAGE', () => {
    expect(ERROR_TYPES.INVALID_MESSAGE).toBeDefined();
  });
  test('ValidationError has correct name and message', () => {
    const e = new ValidationError('what');
    expect(e.name).toBe('ValidationError');
    expect(e.message).toBe('what');
  });
  test('APIError name', () => {
    const e = new APIError('oops');
    expect(e.name).toBe('APIError');
  });
  test('TabLimitExceededError message ends with exceeded.', () => {
    const e = new TabLimitExceededError(7);
    expect(e.name).toBe('TabLimitExceededError');
    expect(e.message).toMatch(/7 exceeded\.$/);
  });
});
