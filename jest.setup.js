// jest.setup.js

const mockBrowser = require('./tests/jest/mocks/browserMock.js');

// Set up the global browser mock
global.browser = mockBrowser.default;

// Mock console methods
global.console = {
  ...global.console,
  error: jest.fn(),
  warn: jest.fn(),
  log: jest.fn()
};

// Mock global `self` for Service Worker with proper jest mock functions
global.self = global; // Ensure 'self' refers to the global object
global.self.addEventListener = jest.fn();

// Mock requestAnimationFrame to simulate frame updates
global.requestAnimationFrame = (callback) => {
  setTimeout(callback, 0);
};

// Mock global alert to capture alert calls in tests
global.alert = jest.fn();

// Mock global prompt
global.prompt = jest.fn(() => "Morning Session");

// Update document body with all required elements
document.body.innerHTML = `
  <input id="currentTabId" />
  <input id="tagInput" />
  <button id="viewArchivesButton"></button>
  <button id="saveSessionButton"></button>
  <button id="viewSessionsButton"></button>
  <button id="archiveTabButton"></button>
  <button id="suspendButton"></button>
  <button id="addRuleButton"></button>
  <div id="save-success"></div>
  <button id="saveRulesButton">Save Rules</button>
  <ul id="archiveList"></ul>
  <ul id="sessionsList"></ul>
  <ul id="rulesList">
    <li class="rule-item">
      <input class="rule-condition" type="text" />
      <input class="rule-action" type="text" />
      <button class="delete-rule">Delete</button>
    </li>
  </ul>
`;

// Ensure `browser` is correctly mocked globally
Object.assign(global, { browser: mockBrowser.default });