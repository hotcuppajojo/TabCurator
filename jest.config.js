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
    '^.+\\.js$': ['babel-jest', { configFile: './babel.config.cjs' }],
  },
  // Pre-configures browser API mocks for consistent test behavior
  setupFiles: ["<rootDir>/jest.setup.js"],
  // Prevents hanging tests while allowing async operations to complete
  testTimeout: 10000,
  
  // Add transformIgnorePatterns to handle webextension-polyfill
  transformIgnorePatterns: [
    '/node_modules/(?!(webextension-polyfill|other-esm-modules)/)'
  ],
  
  // Ensure moduleNameMapper correctly points to the mocked browser
  moduleNameMapper: {
    '^webextension-polyfill$': '<rootDir>/tests/jest/mocks/browserMock.js',
    '^@utils/(.*)$': '<rootDir>/src/utils/$1',
    '^.*\\.css$': 'identity-obj-proxy', // Example for handling CSS imports
  },
  
  // Ensure proper order of setup files
  setupFilesAfterEnv: [
    "<rootDir>/jest.setup.js"
  ],

  // Add moduleDirectories to help resolve imports
  moduleDirectories: ['node_modules', 'src'],
};