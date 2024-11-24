// jest.config.js

module.exports = {
  // Ensures DOM manipulation is possible in tests without a browser
  testEnvironment: "jsdom",
  // Focuses on JS testing only to optimize speed and simplify setup
  moduleFileExtensions: ["js"],
  // Isolates test files from source code for cleaner architecture
  roots: ["<rootDir>/tests"],
  // Enforces consistent test naming for automated discovery
  testMatch: ["<rootDir>/tests/jest/*.test.js"],
  transform: {
    // Enables modern JS features while maintaining compatibility
    '^.+\\.js$': 'babel-jest',
  },
  // Pre-configures browser API mocks for consistent test behavior
  setupFiles: ["<rootDir>/jest.setup.js"],
  // Prevents hanging tests while allowing async operations to complete
  testTimeout: 10000,
};