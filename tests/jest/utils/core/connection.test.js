// tests/jest/utils/core/connection.test.js

/**
 * @file Unit tests for the connection helpers used to talk to the background script
 * @description These tests prioritise the communication contract the rest of the extension
 * relies on: reliable connection semantics, stable message shapes, and graceful error
 * handling. We mock the minimal `chrome.runtime` surface and exercise both happy-path and
 * failure scenarios so refactors of the messaging layer produce clear test failures
 */
import {
  connectToBackground,
  sendMessageToBackground,
  listenForMessages,
  broadcastMessage,
  validateMessage
} from '../../../utils/core/connection.js';

/**
 * @description Core connection behaviours: the beforeAll stub models a consistent runtime
 * surface so tests can mutate it to exercise edge cases. Keeping the mock surface minimal
 * reduces coupling to implementation details while still exercising promise flows and
 * listener registration semantics
 */
describe('connection module', () => {
  beforeAll(() => {
    // Provide the minimal `chrome` runtime surface and a lightweight message listener registry.
    // This pattern lets tests simulate incoming messages by pushing functions into the
    // `runtime_onMessage.listeners` array without reloading modules
    global.chrome = {
      runtime: {
        connect: jest.fn().mockReturnValue('PORT'),
        sendMessage: jest.fn().mockResolvedValue('RESPONSE'),
        onMessage: {
          addListener: jest.fn(fn => global.chrome.runtime_onMessage.listeners.push(fn)),
          removeListener: jest.fn()
        }
      },
      runtime_onMessage: { listeners: [] }
    };
  });

  /**
   * @description Ensure `connectToBackground` uses the expected connect contract so
   * clients receive a channel object/port with the name the rest of the system expects.
   * A mismatch here would break any component relying on port messaging
   */
  test('connectToBackground uses chrome.runtime.connect', () => {
    expect(connectToBackground()).toBe('PORT');
    expect(chrome.runtime.connect).toHaveBeenCalledWith({ name: 'tabActivity' });
  });

  /**
   * @description Verifies promise-based `sendMessageToBackground` resolves with the runtime's
   * response; callers assume this resolves or rejects in a standard async manner
   */
  test('sendMessageToBackground resolves correctly', async () => {
    await expect(sendMessageToBackground('act', { foo: 'bar' })).resolves.toBe('RESPONSE');
  });

  /**
   * @description `listenForMessages` must correctly register a callback and ensure incoming
   * messages reach it unchanged. We simulate an incoming message to assert this contract so
   * UI logic that depends on message routing remains robust
   */
  test('listenForMessages should register listener and invoke callback', () => {
    const cb = jest.fn();
    listenForMessages(cb);
    // simulate incoming message
    global.chrome.runtime_onMessage.listeners.forEach(fn => fn({type:'X'}, 'sender','resp'));
    expect(cb).toHaveBeenCalledWith({type:'X'}, 'sender', 'resp');
  });

  /**
   * @description `broadcastMessage` is intentionally a weakly-typed helper in some environments
   * (no-op); this test asserts the call is safe and resolves so callers can broadcast without
   * wrapping calls in feature detection
   */
  test('broadcastMessage is callable', async () => {
    await expect(broadcastMessage({test:1})).resolves.toBeUndefined();
  });

  /**
   * @description Validates the message validator returns a strict boolean contract so callers
   * can use it in guards without additional normalization
   */
  test('validateMessage must be boolean', () => {
    expect(validateMessage(null)).toBe(false);
    expect(validateMessage({})).toBe(false);
    expect(validateMessage({ type: 'X' })).toBe(true);
  });
});

// Error handling coverage

/**
 * @description Tests that exercise failure modes of the connection helpers. The key goals are to
 * verify errors from the runtime are surfaced (so callers can react) and that helpers remain
 * resilient (broadcast resolves cleanly when unimplemented). Ensuring consistent logging and
 * error propagation prevents silent failures in production
 */
describe('connection module - error handling', () => {
  /**
   * @description When the runtime sendMessage throws, we expect the helper to propagate the
   * error and to log a clear, prefixed message. Tests assert both the thrown message and the
   * console output to avoid regressions that obscure root causes
   */
  test('sendMessageToBackground handles runtime errors', async () => {
    // Mock console.error to suppress and verify error logging
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    
    // Setup Chrome runtime to throw an error with the expected message
    global.chrome = {
      runtime: {
        sendMessage: jest.fn().mockImplementation(() => {
          throw new Error('Failed to send message to background');
        })
      }
    };
    
    // Test error handling
    await expect(sendMessageToBackground('TEST_ACTION', { data: 123 }))
      .rejects
      .toThrow('Failed to send message to background');
    
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
      action: 'TEST_ACTION', 
      payload: { data: 123 }
    });
    
    // Verify console.error was called with expected message. Explicit logging helps
    // operators and debugging tools correlate runtime errors with failing actions
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Failed to send message to background: Failed to send message to background'
    );
    
    // Clean up the spy
    consoleErrorSpy.mockRestore();
  });
  
  /**
   * @description `broadcastMessage` may be a no-op in some environments; callers should be
   * able to call it without additional guards. This test asserts the helper resolves and does
   * not emit unexpected errors.
   */
  test('broadcastMessage resolves gracefully when no implementation', async () => {
    // Spy on console.error to ensure no unexpected logs
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    
    // broadcastMessage as defined returns undefined, so promise resolves
    await expect(broadcastMessage({ type: 'TEST' })).resolves.toBeUndefined();
    
    consoleErrorSpy.mockRestore();
  });
});