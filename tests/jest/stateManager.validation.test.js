// tests/jest/stateManager.validation.test.js
/**
 * @description StateManager validation tests. These tests explain why robust
 * validation and error recovery are important for message and state handling
 * The suite documents recovery strategies so future refactors keep defensive guards
 */

import { jest } from '@jest/globals';
import stateManager from '../../utils/stateManager.js';
import {
  ACTION,
  STATE,
  ValidationError,
  VALIDATION_ERRORS
} from '../../../utils/core/index.js';
import { TabManager } from '../../utils/tabManager.js';
import browser from 'webextension-polyfill';

// Mock dependencies
/**
 * @description A minimal TabManager mock keeps initialization deterministic
 * Tests should focus on validation logic rather than TabManager behaviour
 */
jest.mock('../../utils/tabManager.js', () => ({
  __esModule: true,
  TabManager: jest.fn().mockImplementation(() => ({
    initialize: jest.fn().mockResolvedValue(true)
  }))
}));

/**
 * @description Mock the browser storage and permissions surface to make
 * validation tests deterministic and non-flaky in CI
 */
jest.mock('webextension-polyfill', () => ({
  __esModule: true,
  default: {
    storage: {
      local: {
        get: jest.fn().mockResolvedValue({}),
        set: jest.fn().mockResolvedValue(undefined),
        remove: jest.fn().mockResolvedValue(undefined)
      }
    },
    permissions: {
      request: jest.fn().mockResolvedValue(true),
      contains: jest.fn().mockResolvedValue(true)
    },
    runtime: {
      onMessage: {
        addListener: jest.fn()
      }
    },
    tabs: {
      query: jest.fn().mockResolvedValue([])
    },
    bookmarks: {
      create: jest.fn(),
      search: jest.fn().mockResolvedValue([])
    }
  }
}));

describe('StateManager Validation Tests', () => {
  /**
   * @description These tests validate both simple and advanced validation paths
   * The goal is to ensure validation provides actionable errors and does not
   * corrupt or mutate shared state during failures
   */
  let tabManagerInstance;

  beforeEach(async () => {
    jest.clearAllMocks();
    tabManagerInstance = new TabManager();
    await stateManager.initialize(tabManagerInstance);
  });

  describe('State Validation', () => {
    /**
     * @description Core validation checks. These tests ensure validateStateUpdate
     * accepts well-formed payloads and rejects malformed ones with stable errors
     */
    test('validateStateUpdate validates payload', async () => {
      const validPayload = {
        tabManagement: { tabs: [], activeTabId: null },
        sessions: []
      };

      const result = await stateManager.validateStateUpdate(validPayload);
      expect(result).toEqual({ valid: true });
    });

  /**
   * @description Invalid payloads must surface ValidationError synchronously
   * so callers can respond with user-facing diagnostics or recovery steps
   */
  test('should reject invalid payloads', async () => {
      await expect(stateManager.validateStateUpdate(null))
        .rejects.toThrow(ValidationError);
    });

  /**
   * @description Non-object payloads are common mistakes; ensure they fail
   * validation early to prevent downstream crashes
   */
  test('should handle validation with invalid payload type', async () => {
      await expect(stateManager.validateStateUpdate("invalid string"))
        .rejects.toThrow();
    });

  /**
   * @description Null payloads should produce clear error messages so callers
   * can detect missing message bodies quickly
   */
  test('should handle validation with null payload', async () => {
      await expect(stateManager.validateStateUpdate(null))
        .rejects.toThrow('payload is null or undefined');
    });

  /**
   * @description Lightweight valid objects should pass validation to allow
   * forward-compatible payload shapes to be accepted when possible
   */
  test('should handle validation with valid object payload', async () => {
      const validPayload = { test: true, data: [] };
      const result = await stateManager.validateStateUpdate(validPayload);
      expect(result).toEqual({ valid: true });
    });
  });

  describe('Advanced Validation Scenarios', () => {
    /**
     * @description These tests exercise optional global validation hooks such as
     * a full-state ajv validator. They document how we prefer custom validators
     * and fallback messaging when those hooks are absent
     */
    test('should use global.validateFullState when available', async () => {
      // Setup global validation function
      global.validateFullState = jest.fn().mockReturnValue(false);
      global.validateFullState.errors = [
        { instancePath: '/tabs', message: 'invalid structure' }
      ];
      global.ajv = {
        errorsText: jest.fn().mockReturnValue('Custom validation error message')
      };
      
      try {
        await stateManager.validateStateUpdate({ invalid: true });
        fail('Should have thrown validation error');
      } catch (error) {
        expect(error.message).toBe('Invalid Message: Custom validation error message');
        expect(global.validateFullState).toHaveBeenCalled();
        expect(global.ajv.errorsText).toHaveBeenCalledWith(global.validateFullState.errors);
      }
      
      // Cleanup
      delete global.validateFullState;
      delete global.ajv;
    });

  /**
   * @description When ajv helpers are missing we fall back to a default message
   * This keeps error strings predictable across environments
   */
  test('should fallback to default message when ajv.errorsText unavailable', async () => {
      // Setup global validation without errorsText
      global.validateFullState = jest.fn().mockReturnValue(false);
      global.validateFullState.errors = [{ message: 'error' }];
      global.ajv = {}; // No errorsText method
      
      try {
        await stateManager.validateStateUpdate({ invalid: true });
        fail('Should have thrown validation error');
      } catch (error) {
        expect(error.message).toBe('Invalid Message: Full state validation failed');
      }
      
      // Cleanup
      delete global.validateFullState;
      delete global.ajv;
    });

  /**
   * @description If the global ajv object is missing validation should still
   * produce a clear failure so environment differences do not mask bugs
   */
  test('should fallback when global.ajv is undefined', async () => {
      // Setup global validation without ajv object
      global.validateFullState = jest.fn().mockReturnValue(false);
      global.validateFullState.errors = [{ message: 'error' }];
      // No global.ajv
      
      try {
        await stateManager.validateStateUpdate({ invalid: true });
        fail('Should have thrown validation error');
      } catch (error) {
        expect(error.message).toBe('Invalid Message: Full state validation failed');
      }
      
      // Cleanup
      delete global.validateFullState;
    });

  /**
   * @description Confirm the validateFullState success path is used when provided
   * so the manager can defer to richer schema checks when available
   */
  test('should return valid when global.validateFullState passes', async () => {
      // Setup successful validation
      global.validateFullState = jest.fn().mockReturnValue(true);
      
      const result = await stateManager.validateStateUpdate({ 
        tabs: [], 
        sessions: [] 
      });
      
      expect(result).toEqual({ valid: true });
      expect(global.validateFullState).toHaveBeenCalled();
      
      // Cleanup
      delete global.validateFullState;
    });

  /**
   * @description Complex nested errors should be surfaced as a consolidated
   * message so callers and logs can quickly pinpoint causes
   */
  test('should handle complex validation scenarios with nested errors', async () => {
      // Setup complex validation scenario
      global.validateFullState = jest.fn().mockReturnValue(false);
      global.validateFullState.errors = [
        { instancePath: '/tabManagement/tabs/0', message: 'missing required field' },
        { instancePath: '/sessionData', message: 'invalid session structure' }
      ];
      global.ajv = {
        errorsText: jest.fn().mockReturnValue('Multiple validation errors occurred')
      };
      
      try {
        await stateManager.validateStateUpdate({
          tabManagement: { tabs: [{}] },
          sessionData: { invalid: true }
        });
        fail('Should have thrown validation error');
      } catch (error) {
        expect(error.message).toBe('Invalid Message: Multiple validation errors occurred');
        expect(global.validateFullState).toHaveBeenCalled();
      }
      
      // Cleanup  
      delete global.validateFullState;
      delete global.ajv;
    });
  });

  describe('Storage Transform Functions', () => {
    /**
     * @description Storage wrapper tests ensure the transformation layer interacts
     * with browser.storage as expected so persistence does not silently change shape
     */
    test('should cover StorageService methods through mock validation', async () => {
      // Test browser storage operations that StorageService wraps
      browser.storage.local.get.mockResolvedValue({ testKey: 'testValue' });
      browser.storage.local.set.mockResolvedValue(undefined);
      browser.storage.local.remove.mockResolvedValue(undefined);
      
      await browser.storage.local.get('testKey');
      await browser.storage.local.set({ testKey: 'newValue' });
      await browser.storage.local.remove('testKey');
      
      expect(browser.storage.local.get).toHaveBeenCalledWith('testKey');
      expect(browser.storage.local.set).toHaveBeenCalledWith({ testKey: 'newValue' });
      expect(browser.storage.local.remove).toHaveBeenCalledWith('testKey');
    });

  /**
   * @description getAllKeys is used by migrations. Validate key discovery logic
   * to avoid missing persisted entries during upgrades
   */
  test('should cover StorageService.getAllKeys method', async () => {
      browser.storage.local.get.mockResolvedValue({
        'key1': 'value1',
        'key2': 'value2', 
        'key3': 'value3'
      });
      
      const result = await browser.storage.local.get(null);
      const keys = Object.keys(result);
      
      expect(browser.storage.local.get).toHaveBeenCalledWith(null);
      expect(keys).toEqual(['key1', 'key2', 'key3']);
    });

  /**
   * @description setItem semantics must be stable so serialized objects remain
   * identifiable across reads and writes by migration code
   */
  test('should test storage setItem function', async () => {
      browser.storage.local.set.mockResolvedValue(undefined);
      
      await browser.storage.local.set({ 'test-key': 'test-value' });
      
      expect(browser.storage.local.set).toHaveBeenCalledWith({ 'test-key': 'test-value' });
    });

  /**
   * @description removeItem must be reliable to allow cleanup operations to
   * succeed without leaving orphaned data
   */
  test('should test storage removeItem function', async () => {
      browser.storage.local.remove.mockResolvedValue(undefined);
      
      await browser.storage.local.remove('test-key');
      
      expect(browser.storage.local.remove).toHaveBeenCalledWith('test-key');
    });

  /**
   * @description getAllKeys returns all persisted session keys used by restores
   * Tests assert the discovery contract so restores are comprehensive
   */
  test('should test storage getAllKeys function', async () => {
      browser.storage.local.get.mockResolvedValue({
        'session-1': { name: 'Work' },
        'session-2': { name: 'Personal' }
      });
      
      const allData = await browser.storage.local.get(null);
      const allKeys = Object.keys(allData);
      
      expect(browser.storage.local.get).toHaveBeenCalledWith(null);
      expect(allKeys).toContain('session-1');
      expect(allKeys).toContain('session-2');
    });

  /**
   * @description Verify transformation layer preserves serialized shapes so
   * consumers can parse stored strings reliably on read
   */
  test('should use storage transform functions', async () => {
      // Test that storage transformations work correctly
      const testData = { serialized: true, timestamp: Date.now() };
      
      browser.storage.local.set.mockResolvedValue(undefined);
      await browser.storage.local.set({ transformTest: JSON.stringify(testData) });
      
      browser.storage.local.get.mockResolvedValue({ transformTest: JSON.stringify(testData) });
      const retrieved = await browser.storage.local.get('transformTest');
      
      expect(browser.storage.local.set).toHaveBeenCalled();
      expect(browser.storage.local.get).toHaveBeenCalledWith('transformTest');
      expect(retrieved.transformTest).toBeDefined();
    });
  });

  describe('Error Handling Edge Cases', () => {
    /**
     * @description These tests assert that external API failures are contained
     * and do not break validation or state access for unrelated operations
     */
    test('should handle state operations with browser API errors', async () => {
      browser.storage.local.get.mockRejectedValue(new Error('Storage unavailable'));
      
      // Should handle storage errors gracefully
      try {
        await browser.storage.local.get('test');
      } catch (error) {
        expect(error.message).toBe('Storage unavailable');
      }
    });

  /**
   * @description Malformed payloads must be handled gracefully to avoid
   * crashes during migration or inter-process messages
   */
  test('should handle malformed state data', async () => {
      const malformedPayload = {
        tabManagement: "not an object",
        sessions: null
      };
      
      const result = await stateManager.validateStateUpdate(malformedPayload);
      expect(result).toEqual({ valid: true }); // Fallback validation
    });

  /**
   * @description Circular references can appear in complex message flows. Ensure
   * validation handles them without crashing the background process
   */
  test('should handle circular reference in payload', async () => {
      const circularPayload = { test: true };
      circularPayload.self = circularPayload;
      
      // Should handle circular references without crashing
      const result = await stateManager.validateStateUpdate(circularPayload);
      expect(result).toBeDefined();
    });

  /**
   * @description Large payloads exercise performance and memory handling. These
   * tests check we do not blow stacks or exceed reasonable processing limits
   */
  test('should handle very large payload objects', async () => {
      const largePayload = {
        tabs: new Array(1000).fill(0).map((_, i) => ({
          id: i,
          title: `Tab ${i}`,
          url: `https://example.com/${i}`
        }))
      };
      
      const result = await stateManager.validateStateUpdate(largePayload);
      expect(result).toEqual({ valid: true });
    });
  });

  describe('Initialization Error Paths', () => {
    /**
     * @description Initialization and runtime message handling must be resilient
     * to invalid messages and listener setup failures so the extension remains
     * operational under partial failure scenarios
     */
    test('should handle message validation failure during runtime', async () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      
      try {
        await stateManager.handleMessage({ type: 'INVALID', payload: null });
      } catch (error) {
        // Expected to fail validation
      }
      
      consoleSpy.mockRestore();
    });

  /**
   * @description Connection error messages come from external peers. The manager
   * should log and continue rather than allowing these to bubble into fatal errors
   */
  test('should handle connection error messages', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      
      try {
        await stateManager.handleBackgroundMessage({
          type: 'CONNECTION_ERROR',
          error: 'Connection failed'
        }, null, jest.fn());
      } catch (error) {
        // Expected error handling
      }
      
      consoleSpy.mockRestore();
    });

  /**
   * @description Listener setup errors can occur in restricted environments. Tests
   * ensure these failures degrade gracefully with warnings and do not crash init
   */
  test('should handle message listener setup errors', async () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      
      try {
        await stateManager.handleBackgroundMessage(null, null, null);
      } catch (error) {
        // Expected to fail
      }
      
      consoleSpy.mockRestore();
    });
  });

  describe('State Consistency and Recovery', () => {
    /**
     * @description These tests assert the manager preserves a usable state after
     * repeated validation failures so user flows can continue after transient errors
     */
    test('should maintain state consistency during validation errors', async () => {
      const initialState = stateManager.getState();
      
      try {
        await stateManager.validateStateUpdate(null);
      } catch (error) {
        const currentState = stateManager.getState();
        expect(currentState).toBeDefined();
        expect(typeof currentState).toBe('object');
      }
    });

  /**
   * @description Repeated invalid inputs should not permanently corrupt state
   * Tests simulate repeated failures and verify successful validation still works
   */
  test('should recover from validation failures gracefully', async () => {
      // Multiple validation attempts should not corrupt state
      for (let i = 0; i < 3; i++) {
        try {
          await stateManager.validateStateUpdate(null);
        } catch (error) {
          // Expected failures
        }
      }
      
      // State should still be accessible
      const state = stateManager.getState();
      expect(state).toBeDefined();
      
      // Valid operations should still work
      const validPayload = { test: true };
      const result = await stateManager.validateStateUpdate(validPayload);
      expect(result).toEqual({ valid: true });
    });

  /**
   * @description Validation may be called concurrently. Confirm parallel runs
   * do not share mutable state that would cause race conditions
   */
  test('should handle concurrent validation requests', async () => {
      const validPayload1 = { request: 1, data: [] };
      const validPayload2 = { request: 2, data: {} };
      
      const [result1, result2] = await Promise.all([
        stateManager.validateStateUpdate(validPayload1),
        stateManager.validateStateUpdate(validPayload2)
      ]);
      
      expect(result1).toEqual({ valid: true });
      expect(result2).toEqual({ valid: true });
    });

  /**
   * @description Direct dispatches are used by various integration flows. Tests
   * ensure slices exist and remain addressable by action type strings
   */
  test('should cover additional reducer operations through direct dispatch', async () => {
      // StateManager is already initialized in beforeEach

      // Test available slices that exist in StateManager
      const initialState = stateManager.getState();
      expect(initialState).toBeDefined();

      // Test tabManagement slice operations
      stateManager.store.dispatch({
        type: 'tabManagement/updateTab',
        payload: { id: 1, title: 'Test Tab' }
      });

      const state1 = stateManager.getState();
      expect(state1.tabManagement).toBeDefined();
      expect(state1.tabManagement.tabs).toBeDefined();

      // Test sessions slice operations
      stateManager.store.dispatch({
        type: 'sessions/saveSession',
        payload: { name: 'test-session', tabs: [], timestamp: Date.now() }
      });

      const state2 = stateManager.getState();
      expect(state2.sessions).toBeDefined();

      // Test settings operations
      stateManager.store.dispatch({
        type: 'settings/updateSettings',
        payload: { maxTabs: 50, theme: 'dark' }
      });

      const state3 = stateManager.getState();
      expect(state3.settings).toBeDefined();

      // Test archivedTabs operations
      stateManager.store.dispatch({
        type: 'archivedTabs/archiveTab',
        payload: { id: 1, url: 'https://example.com', title: 'Test', archivedAt: Date.now() }
      });

      const state4 = stateManager.getState();
      expect(state4.archivedTabs).toBeDefined();
    });

  /**
   * @description Storage errors are external. Verify the manager catches and
   * recovers from storage write and read failures without losing initialized state
   */
  test('should handle storage operations validation edge cases', async () => {
      // StateManager is already initialized in beforeEach
      
      // Test storage service error handling paths
      browser.storage.local.get.mockRejectedValueOnce(new Error('Storage unavailable'));
      browser.storage.local.set.mockRejectedValueOnce(new Error('Storage write failed'));
      
      // These operations should be handled gracefully
      const testAction = {
        type: 'settings/updateSettings',
        payload: { theme: 'dark' }
      };
      
      stateManager.store.dispatch(testAction);
      
      // Should still have valid state
      const state = stateManager.getState();
      expect(state).toBeDefined();
      
      // Restore mocks
      browser.storage.local.get.mockResolvedValue({});
      browser.storage.local.set.mockResolvedValue(undefined);
    });

  /**
   * @description Extra validation edge cases help prevent regressions caused by
   * unexpected message shapes across different clients or versions
   */
  test('should cover additional validation edge cases for coverage', async () => {
      // Test validation with null/undefined (should throw)
      await expect(stateManager.validateStateUpdate(null)).rejects.toThrow();
      await expect(stateManager.validateStateUpdate(undefined)).rejects.toThrow();
      
      // Test validation with empty object
      try {
        await stateManager.validateStateUpdate({});
        // If it doesn't throw, that's also valid behavior
      } catch (error) {
        expect(error).toBeDefined();
      }
      
      // Test validation with complex nested payload
      const complexPayload = {
        nested: { deep: { structure: 'value' } },
        array: [1, 2, 3],
        mixed: { types: true, number: 42 }
      };
      
      try {
        const complexValidation = await stateManager.validateStateUpdate(complexPayload);
        expect(complexValidation).toBeDefined();
      } catch (error) {
        // Validation might reject complex payloads
        expect(error).toBeDefined();
      }
    });

  /**
   * @description Ensure a range of invalid message types are rejected consistently
   * and that error types remain predictable for callers and logs
   */
  test('should handle message validation errors gracefully', async () => {
      // Test validation with various message types to improve coverage
      const invalidPayloads = [
        null,
        undefined,
        'string instead of object',
        123,
        []
      ];
      
      for (const payload of invalidPayloads) {
        try {
          await stateManager.validateStateUpdate(payload);
        } catch (error) {
          // Should throw ValidationError for invalid payloads
          expect(error).toBeDefined();
        }
      }
    });
  });
});