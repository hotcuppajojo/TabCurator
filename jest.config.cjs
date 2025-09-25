// jest.config.js

/** @type {import('@jest/types').Config.InitialOptions} */
module.exports = {
  // Setup testing environment
  testEnvironment: 'jsdom',

  // Define single root directory for tests
  roots: ['<rootDir>/tests'],

  // Ensure that the setupFilesAfterEnv is correctly pointing to the simplified setup file
  setupFilesAfterEnv: [
    '<rootDir>/tests/jest/setup/jest.setup.js' // Ensure only jest.setup.js is referenced
  ],

  // Define how Jest should transform files
  transform: {
    '^.+\\.[tj]sx?$': ['babel-jest', { 
      configFile: './babel.config.cjs',
      rootMode: 'upward'
    }]
  },

  // Exclude Playwright tests from Jest runs
  testPathIgnorePatterns: [
    '/node_modules/',
    '/tests/playwright/'
  ],

  // Update test patterns to be more specific
  testMatch: [
    '**/tests/jest/**/*.test.js',
    '**/tests/react/**/*.test.js'
  ],

  // Module name mapping for imports
  moduleNameMapper: {
    '\\.(css|less|scss|sass)$': 'identity-obj-proxy',
    '^webextension-polyfill$': '<rootDir>/tests/jest/mocks/browserMock.js',
    
    // Fix the constants.js mapping
    '^../../utils/constants.js$': '<rootDir>/utils/core/index.js',
    '^../../../utils/constants.js$': '<rootDir>/utils/core/index.js',
    
    // Add direct mappings for core modules to avoid path traversal issues
    '^../../../../utils/core/(.*)$': '<rootDir>/utils/core/$1',
    '^../../../utils/core/(.*)$': '<rootDir>/utils/core/$1',
    '^@/(.*)$': '<rootDir>/$1',
    '^@test/(.*)$': '<rootDir>/tests/$1',

    // Fix babel runtime mappings with more specific patterns
    '@babel/runtime-corejs3/core-js-stable/(.*)': '<rootDir>/node_modules/core-js/stable/$1',
    '@babel/runtime-corejs3/helpers/(.*)': '<rootDir>/node_modules/@babel/runtime/helpers/$1',

    // General fallback mapping for any other @babel/runtime-corejs3 imports
    '^@babel/runtime-corejs3/(.*)$': '<rootDir>/node_modules/@babel/runtime/$1'
  },

  // Add transform ignore patterns for ESM and async/await
  transformIgnorePatterns: [
    'node_modules/(?!(webextension-polyfill|@reduxjs/toolkit|reselect)/)'
  ],

  // Add verbose output for debugging
  verbose: true,

  // Add Jest DOM configuration
  testEnvironmentOptions: {
    customExportConditions: ['node', 'node-addons']
  },

  // Add module file extensions for module resolution
  moduleFileExtensions: ['js', 'jsx', 'json', 'node']
};