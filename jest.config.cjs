/**
 * @file Jest configuration for TabCurator tests
 * @rationale Keep a single, explicit Jest configuration so local and CI runs
 * behave identically. This file documents why each option exists rather
 * than repeating the mechanics of what Jest does
 */

/** @type {import('@jest/types').Config.InitialOptions} */
module.exports = {
  /**
   * @rationale Use jsdom to approximate browser-like DOM APIs required by
   * some modules and UI tests. This enables DOM assertions while keeping
   * tests runnable in Node-based CI environments
   */
  testEnvironment: 'jsdom',

  /**
   * @rationale Restrict the test root to the `tests` folder. This keeps
   * discovery predictable and avoids accidentally running unrelated files
   */
  roots: ['<rootDir>/tests'],

  /**
   * @rationale Centralize global test setup in a single file. The setup file
   * provides deterministic globals and mocks that are safe to reuse across
   * many suites. Keep the list minimal to reduce side effects
   */
  setupFilesAfterEnv: [
    '<rootDir>/tests/jest/setup/jest.setup.js'
  ],

  /**
   * @rationale Use Babel to transform source and test files. The transform
   * preserves project-level Babel configuration by pointing to the repo
   * config and using upward root discovery
   */
  transform: {
    '^.+\\.[tj]sx?$': ['babel-jest', {
      configFile: './babel.config.cjs',
      rootMode: 'upward'
    }]
  },

  /**
   * @rationale Exclude Playwright test directories and node_modules from
   * Jest runs to avoid accidental cross-execution of integration tests
   */
  testPathIgnorePatterns: [
    '/node_modules/',
    '/tests/playwright/'
  ],

  /**
   * @rationale Exclude test infrastructure and build outputs from coverage
   * Reports should reflect production code quality not test helpers or bundles
   */
  coveragePathIgnorePatterns: [
    '/tests/',
    '/build/',
    '/dist/',
    '/coverage/',
    'tests/jest/mocks/',
    'utils/core/index.js'
  ],

  /**
   * @rationale Define which source files should be considered for coverage
   * Keep the list focused on runtime code while excluding config and tests
   */
  collectCoverageFrom: [
    'utils/**/*.js',
    'background/**/*.js',
    'popup/**/*.jsx',
    'options/**/*.jsx',
    '!**/*.config.js',
    '!**/node_modules/**',
    '!**/tests/**'
  ],

  /**
   * @rationale Match test files under the canonical test folders. This
   * prevents accidental matching of unrelated test helpers in other paths
   */
  testMatch: [
    '**/tests/jest/*.test.js',
    '**/tests/jest/**/*.test.js',
    '**/tests/react/**/*.test.js'
  ],

  /**
   * @rationale Map assets and environment-specific modules to lightweight
   * mocks so tests remain fast and deterministic. The webextension-polyfill
   * mapping ensures code importing the polyfill receives the project mock
   */
  moduleNameMapper: {
    '\\.(css|less|scss|sass)$': 'identity-obj-proxy',
    '^webextension-polyfill$': '<rootDir>/tests/jest/mocks/browserMock.js',
    '^../../../utils/core/(.*)$': '<rootDir>/utils/core/$1',
    '^@/(.*)$': '<rootDir>/$1',
    '^@test/(.*)$': '<rootDir>/tests/$1'
  },

  /**
   * @rationale Allow specific ESM packages through transformation so modern
   * dependencies that ship ESM or use newer syntax are handled correctly
   */
  transformIgnorePatterns: [
    'node_modules/(?!(webextension-polyfill|@reduxjs/toolkit|reselect)/)'
  ],

  /**
   * @rationale Enable verbose output by default to aid debugging during
   * local development and CI when diagnosing test discovery issues
   */
  verbose: true,

  /**
   * @rationale Provide node-specific export condition options for modules
   * that rely on conditional exports. This reduces module resolution errors
   * when running tests in Node environments
   */
  testEnvironmentOptions: {
    customExportConditions: ['node', 'node-addons']
  },

  /**
   * @rationale Explicit module file extensions improve resolution and make
   * imports predictable across tooling and editors
   */
  moduleFileExtensions: ['js', 'jsx', 'json', 'node']
};