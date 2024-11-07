// jest.config.js

module.exports = {
    testEnvironment: "jsdom",
    moduleFileExtensions: ["js"],
    roots: ["<rootDir>/tests"],
    testMatch: ["<rootDir>/tests/jest/*.test.js"],
    transform: {
      '^.+\\.js$': 'babel-jest',
    },
    setupFiles: ["<rootDir>/tests/jest/setupTests.js"]
  };