// jest.config.js

module.exports = {
  // Ensures DOM manipulation is possible in tests without a browser
  testEnvironment: "jest-environment-jsdom",
  // Focuses on JS testing only to optimize speed and simplify setup
  moduleFileExtensions: ["js"],
  // Isolates test files from source code for cleaner architecture
  roots: ["<rootDir>/tests"],
  // Enforces consistent test naming for automated discovery
  testMatch: ["<rootDir>/tests/jest/**/*.test.js"],
  transform: {
    // Enables modern JS features while maintaining compatibility
    '^.+\\.(js|jsx)$': ['babel-jest', {
      presets: [
        ['@babel/preset-env', { targets: { node: 'current' } }]
      ],
      plugins: ['@babel/plugin-transform-modules-commonjs']
    }]
  },
  // Pre-configures browser API mocks for consistent test behavior
  setupFiles: [],
  // Prevents hanging tests while allowing async operations to complete
  testTimeout: 30000, // Ensure global test timeout aligns with popup.test.js
  
  // Add transformIgnorePatterns to handle webextension-polyfill
  transformIgnorePatterns: [
    '/node_modules/(?!(webextension-polyfill|other-esm-modules)/)'
  ],
  
  // Ensure moduleNameMapper correctly points to the mocked browser
  moduleNameMapper: {
    '^webextension-polyfill$': '<rootDir>/tests/jest/mocks/browserMock.js',
    '^@utils/(.*)$': '<rootDir>/src/utils/$1',
    '^.*\\.css$': 'identity-obj-proxy', // Example for handling CSS imports
    '^chrome-extension://.*$': '<rootDir>/tests/jest/mocks/extensionMock.js', // Add mock for extension URLs
    '^src/background/background.js$': '<rootDir>/tests/jest/mocks/backgroundMock.js', // Mock background script
    // ...existing mappings...
  },
  
  // Ensure proper order of setup files
  setupFilesAfterEnv: [
    "<rootDir>/jest.setup.js",
    "<rootDir>/jest.memory-setup.js",
    "<rootDir>/tests/jest/setup/testSetup.js",
    "<rootDir>/tests/jest/setup/async-cleanup.js"
  ],

  // Add moduleDirectories to help resolve imports
  moduleDirectories: ['node_modules', 'src'],

  // Memory and performance settings
  maxConcurrency: 1,
  workerIdleMemoryLimit: '512MB', // Further reduce memory limit
  maxWorkers: 1, // Ensure tests run serially to limit memory usage

  // Add garbage collection hints
  globalSetup: '<rootDir>/jest.global-setup.js',
  globalTeardown: '<rootDir>/jest.global-teardown.js',

  // Enable test environment configuration
  testEnvironmentOptions: {
    url: "http://localhost",
    resources: "usable",
    runScripts: "dangerously",
    gcInterval: 100,
    testTimeout: 30000,
    asyncAssertions: true, // Ensure proper handling of async operations
    asyncDispose: true, // Ensure proper handling of async operations
    maxEventLoopDelay: 100,
    maxAsyncOperations: 100,
    customExportConditions: ['node', 'node-addons']
  },

  // Ensure proper handling of open handles
  detectOpenHandles: true,
  // Prevent Jest from forcefully exiting after tests
  // forceExit: true, // Ensure this line remains commented out or removed

  // Remove invalid option
  // runInBand: true, // This was causing the warning

  // Remove duplicate settings that conflict with CLI options
  // Remove globalConfig

  // Add better error handling
  testRunner: "jest-circus/runner"
};