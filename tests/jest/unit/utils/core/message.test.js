import { MESSAGE_TYPES, MESSAGES, formatMessage } from '../../../../utils/core/message.js';

describe('message module', () => {
  test('MESSAGE_TYPES includes TAB_ACTION', () => {
    expect(MESSAGE_TYPES).toHaveProperty('TAB_ACTION');
  });
  test('MESSAGES.TAB.CREATED exists', () => {
    expect(MESSAGES.TAB.CREATED).toMatch(/Tab created/);
  });
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
  test('missing values leave braces', () => {
    expect(formatMessage('Hi {who}', {})).toBe('Hi {who}');
  });
});
