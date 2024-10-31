// jest.config.js

module.exports = {
    testEnvironment: "jsdom",
    moduleFileExtensions: ["js"],
    roots: ["<rootDir>/tests"],
    testMatch: ["<rootDir>/tests/**/*.test.js"],
    setupFiles: ["<rootDir>/tests/setupTests.js"]
  };