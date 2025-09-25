import { VALIDATION_SCHEMAS, STATE_SCHEMA, SLICE_SCHEMAS, VALIDATION_ERRORS } from '../../../../utils/core/schemas.js';

describe('schemas', () => {
  test('VALIDATION_SCHEMAS contains known methods', () => {
    expect(VALIDATION_SCHEMAS).toHaveProperty('create');
  });
  test('STATE_SCHEMA has required tabs property', () => {
    expect(STATE_SCHEMA.properties).toHaveProperty('tabs');
  });
  test('SLICE_SCHEMAS defines tabManagement', () => {
    expect(SLICE_SCHEMAS).toHaveProperty('tabManagement');
  });
  test('VALIDATION_ERRORS includes TAB_LIMIT_EXCEEDED', () => {
    expect(VALIDATION_ERRORS.TAB_LIMIT_EXCEEDED).toBeDefined();
  });
});
