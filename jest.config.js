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
  // Use single setup file
  setupFilesAfterEnv: ["<rootDir>/jest.setup.js"],
  // Prevents hanging tests while allowing async operations to complete
  testTimeout: 30000, // Ensure global test timeout aligns with popup.test.js
  
  // Add transformIgnorePatterns to handle webextension-polyfill
  transformIgnorePatterns: [
    '/node_modules/(?!(webextension-polyfill|other-esm-modules)/)'
  ],
  
  // Ensure moduleNameMapper correctly points to the mocked browser
  moduleNameMapper: {
    '^webextension-polyfill$': '<rootDir>/tests/jest/mocks/browserMock.js',
    '^chrome-extension://.*$': '<rootDir>/tests/jest/mocks/extensionMock.js',
  },
  
  // Add moduleDirectories to help resolve imports
  moduleDirectories: ['node_modules', 'src'],

  // Performance settings
  maxWorkers: 1,

  // Environment options
  testEnvironmentOptions: {
    url: "http://localhost",
    runScripts: "dangerously"
  },

  // Ensure proper handling of open handles
  detectOpenHandles: true
};