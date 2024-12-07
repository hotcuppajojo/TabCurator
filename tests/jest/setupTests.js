// tests/jest/setupTests.js

const { createMockBrowser } = require('./mocks/browserMock.js');
global.mockBrowser = createMockBrowser();