/**
 * @fileoverview Utility for validating arguments and data structures across modules.
 * Contains schemas and a generic validation function.
 *
 * @module utils/core/validation
 */

import { VALIDATION_SCHEMAS, TAG_VALIDATION, STATE_SCHEMA, SLICE_SCHEMAS, VALIDATION_ERRORS } from './schemas.js';

/**
 * Adds or updates a validation schema for a given method.
 * @param {string} methodName - The name of the method.
 * @param {Array} schema - The validation schema for the method.
 */
export function addSchema(methodName, schema) {
  VALIDATION_SCHEMAS[methodName] = schema;
}

/**
 * Validation schemas for browser.tabs methods.
 * Define the expected argument types and whether they are required.
 */
export { VALIDATION_SCHEMAS } from './schemas.js';

/**
 * Validates arguments against a predefined schema.
 * @param {string} methodName - The name of the method being validated.
 * @param {Array} args - The arguments passed to the method.
 * @param {Object} schemas - The validation schemas for the method.
 * @throws Will throw an error if the arguments do not match the schema.
 */
export function validateArgs(methodName, args, schema = VALIDATION_SCHEMAS[methodName]) {
  if (!schema) {
    throw new Error(`No validation schema found for method: ${methodName}`);
  }
  schema.forEach((expected, index) => {
    const arg = args[index];
    if (expected.required && (arg === undefined || arg === null)) {
      throw new Error(`Missing required argument at index ${index} for ${methodName}`);
    }
    if (arg !== undefined && typeof arg !== expected.type) {
      throw new Error(
        `Invalid argument at index ${index} for ${methodName}: Expected ${expected.type}, got ${typeof arg}`
      );
    }
  });
  if (args.length > schema.length) {
    throw new Error(`Too many arguments for ${methodName}: Expected ${schema.length}, got ${args.length}`);
  }
}

/**
 * Validates a tab object.
 * @param {Object} tab - The tab object to validate.
 * @returns {boolean}
 * @throws {Error} If validation fails.
 */
export function validateTab(tab) {
  if (!tab || typeof tab.id !== 'number' || typeof tab.url !== 'string') {
    throw new Error(VALIDATION_ERRORS.INVALID_MESSAGE || 'Invalid tab object');
  }
  return true;
}

/**
 * Validates a tag string.
 * @param {string} tag - The tag to validate.
 * @returns {boolean}
 * @throws {Error} If validation fails.
 */
export function validateTag(tag) {
  if (typeof tag !== 'string') {
    throw new Error(VALIDATION_ERRORS.INVALID_MESSAGE || 'Tag must be a string');
  }
  if (tag.length > TAG_VALIDATION.TAG.MAX_LENGTH) {
    throw new Error(VALIDATION_ERRORS.TAGGING_REQUIRED || `Tag exceeds max length of ${TAG_VALIDATION.TAG.MAX_LENGTH}`);
  }
  if (!TAG_VALIDATION.TAG.PATTERN.test(tag)) {
    throw new Error(VALIDATION_ERRORS.INVALID_MESSAGE || 'Tag contains invalid characters');
  }
  return true;
}

/**
 * Validates tab count against a limit.
 * @param {number} count - The current tab count.
 * @param {number} limit - The tab limit.
 * @returns {{isValid: boolean, message: string|null}}
 */
export function validateTabLimit(count, limit) {
  const isValid = count <= limit;
  return {
    isValid,
    message: isValid ? null : (VALIDATION_ERRORS.TAB_LIMIT_EXCEEDED || `Tab limit of ${limit} exceeded`)
  };
}

