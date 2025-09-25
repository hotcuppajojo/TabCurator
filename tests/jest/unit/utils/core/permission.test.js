import { PERMISSIONS } from '../../../../utils/core/permission.js';

describe('permission constants', () => {
  test('PERMISSIONS includes TABS and STORAGE', () => {
    expect(PERMISSIONS).toHaveProperty('TABS');
    expect(PERMISSIONS).toHaveProperty('STORAGE');
  });
});
