// tests/jest/utils/core/config.test.js

/**
 * @file Unit tests for the lightweight configuration helpers
 * @description These tests document and enforce the assumptions callers make about the
 * configuration accessor helpers: stable keys in `CONFIG`, and predictable fallbacks when
 * consumers supply missing keys. The intent is to keep the runtime behaviour conservative and
 * explicit so callers can avoid defensive checks everywhere
 */

import { getTimeout, CONFIG, getThreshold, getBatchSize } from '../../../utils/core/config.js';

/**
 * @description Tests focus on the contract (what callers rely on) rather than internal
 * representation. We assert three core expectations: canonical keys exist, accessors return
 * configured values, and accessors support explicit fallback values to avoid runtime branching
 * at call sites
 */
describe('config module', () => {
  /**
   * @description Ensures critical timeouts are present. Missing timeout keys cause subtle
   * network or UI regressions; this test serves as an early signal for API-level changes
   */
  test('CONFIG.TIMEOUTS contains API_CALL', () => {
    expect(CONFIG.TIMEOUTS).toHaveProperty('API_CALL');
  });

  /**
   * @description `getTimeout` must return configured timeouts for normal operation and allow
   * a caller-provided fallback to keep higher-level logic concise and free of null checks
   */
  test('getTimeout returns existing and falls back', () => {
    expect(getTimeout('API_CALL')).toBe(CONFIG.TIMEOUTS.API_CALL);
    expect(getTimeout('NON_EXISTENT', 123)).toBe(123);
  });

  /**
   * @description Thresholds drive heuristic behavior; verifying both configured and fallback
   * ensures algorithms using thresholds remain stable when keys are absent or renamed
   */
  test('getThreshold returns existing and falls back', () => {
    expect(getThreshold('TAB_WARNING')).toBe(CONFIG.THRESHOLDS.TAB_WARNING);
    expect(getThreshold('MISSING', 0.5)).toBe(0.5);
  });

  /**
   * @description Batch sizes affect performance characteristics. This test guarantees the
   * accessor returns intended defaults and preserves an explicit override path for edge cases
   */
  test('getBatchSize returns existing and falls back', () => {
    expect(getBatchSize('MAX_SIZE')).toBe(CONFIG.BATCH.MAX_SIZE);
    expect(getBatchSize('UNKNOWN', 7)).toBe(7);
  });
});
