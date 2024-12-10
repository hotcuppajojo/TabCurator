// tests/jest/setupTests.js

const { createMockBrowser } = require('./mocks/browserMock.js');

// Update global mock setup for consolidated modules
global.mockBrowser = createMockBrowser();

// Mock the consolidated utils
jest.mock('../../src/utils/tabManager.js');
jest.mock('../../src/utils/stateManager.js');
jest.mock('../../src/utils/messagingUtils.js');
jest.mock('../../src/utils/tagUtils.js');