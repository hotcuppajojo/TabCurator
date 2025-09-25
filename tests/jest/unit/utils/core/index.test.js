import * as core from '../../../../utils/core/index.js';

describe('core index', () => {
  test('exports initializeBookmarkFolder', () => {
    expect(typeof core.initializeBookmarkFolder).toBe('function');
  });
  test('exports getTimeout', () => {
    expect(typeof core.getTimeout).toBe('function');
  });
  test('exports TabAPI or ACTION', () => {
    expect(core.ACTION).toBeDefined();
  });
});
