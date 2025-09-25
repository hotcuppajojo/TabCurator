import { getTimeout, CONFIG, getThreshold, getBatchSize } from '../../../../utils/core/config.js';

describe('config module', () => {
  test('CONFIG.TIMEOUTS contains API_CALL', () => {
    expect(CONFIG.TIMEOUTS).toHaveProperty('API_CALL');
  });
  test('getTimeout returns existing and falls back', () => {
    expect(getTimeout('API_CALL')).toBe(CONFIG.TIMEOUTS.API_CALL);
    expect(getTimeout('NON_EXISTENT', 123)).toBe(123);
  });
  test('getThreshold returns existing and falls back', () => {
    expect(getThreshold('TAB_WARNING')).toBe(CONFIG.THRESHOLDS.TAB_WARNING);
    expect(getThreshold('MISSING', 0.5)).toBe(0.5);
  });
  test('getBatchSize returns existing and falls back', () => {
    expect(getBatchSize('MAX_SIZE')).toBe(CONFIG.BATCH.MAX_SIZE);
    expect(getBatchSize('UNKNOWN', 7)).toBe(7);
  });
});
