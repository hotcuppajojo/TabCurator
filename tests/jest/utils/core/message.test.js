// tests/jest/utils/core/message.test.js

/**
 * @file Unit tests for message constants and formatting helpers.
 * @description The message layer standardises events and human-friendly text across the
 * extension. Tests ensure canonical keys and predictable formatting behaviour so UI and
 * telemetry remain consistent when messages are used in logs, notifications, and inter-module
 * communication
 */
import { MESSAGE_TYPES, MESSAGES, formatMessage } from '../../../../utils/core/message.js';

describe('message module', () => {
  /**
   * @description MESSAGE_TYPES is a small registry used to avoid stringly-typed messaging.
   * Asserting the presence of core message keys prevents silent failures when consumers dispatch
   * messages using the constants
   */
  test('MESSAGE_TYPES includes TAB_ACTION', () => {
    expect(MESSAGE_TYPES).toHaveProperty('TAB_ACTION');
  });

  /**
   * @description MESSAGES contains user-facing or log-friendly templates. This test ensures the
   * canonical 'tab created' message exists, preventing accidental removals that would affect UI
   * copy or system messages
   */
  test('MESSAGES.TAB.CREATED exists', () => {
    expect(MESSAGES.TAB.CREATED).toMatch(/Tab created/);
  });

  /**
   * @description `formatMessage` is used to interpolate values into templates. We test simple
   * and nested replacements as well as the behaviour when keys are missing to ensure consistent
   * rendering across different consumers
   */
  test('formatMessage replaces placeholders', () => {
    const tpl = 'Hello {name}';
    expect(formatMessage(tpl, { name: 'JoJo' })).toBe('Hello JoJo');
  });

  test('simple replacement', () => {
    expect(formatMessage('Hi {name}', { name: 'Alice' })).toBe('Hi Alice');
  });

  test('nested placeholders', () => {
    const tpl = 'Op {operation} took {duration}ms';
    expect(formatMessage(tpl, { operation:'X', duration:123 })).toBe('Op X took 123ms');
  });

  /**
   * @description When values are missing we intentionally leave placeholders intact so missing
   * data is visible in rendered templates rather than silently inserting incorrect defaults
   */
  test('missing values leave braces', () => {
    expect(formatMessage('Hi {who}', {})).toBe('Hi {who}');
  });
});
