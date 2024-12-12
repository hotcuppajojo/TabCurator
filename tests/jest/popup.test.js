import { createMockTab, createBulkTabs, createTaggedTab, createComplexTabs } from './utils/testUtils.js';
// tests/jest/popup.test.js

/**
 * @fileoverview Test suite for TabCurator popup functionality
 * Implements comprehensive testing of UI interactions and event handling
 * Validates cross-browser compatibility of popup operations
 * Tests tab management, archival, and session handling features
 */

const initPopup = require("../../src/popup/popup");

jest.setTimeout(30000); // Set global timeout to 30 seconds for all tests

// If opting to mock Playwright's `page`, ensure all necessary methods are mocked
const page = {
  evaluate: jest.fn().mockResolvedValue(),
  click: jest.fn().mockResolvedValue(),
  waitForSelector: jest.fn().mockResolvedValue(),
  // Add other methods as needed
};

// Initialize the mocked `page` before tests
beforeEach(() => {
  global.page = page;
  // Ensure all mocks are reset before each test
  jest.clearAllMocks();
});

describe("Popup script", () => {
  let popup;

  beforeAll(() => {
    // Ensure 'tabs.discard' is defined in the mock
    if (browser.tabs) {
      browser.tabs.discard = jest.fn();
    } else {
      browser.tabs = {
        discard: jest.fn(),
        // ...other tab methods...
      };
    }
  });

  beforeEach(() => {
    // Reset test environment and mocks
    jest.clearAllMocks();
    window.close = jest.fn();

    // Configure document readyState for test environment
    Object.defineProperty(document, 'readyState', {
      value: 'complete',
      writable: true
    });

    // Initialize DOM structure for popup UI testing
    document.body.innerHTML = `
      <button id="suspend-inactive-tabs">Suspend Inactive Tabs</button>
      <div id="tab-list"></div>
      <div id="tagging-prompt" style="display:none;">
        <p>You have exceeded the tab limit. Please tag the oldest tab to allow new tabs.</p>
        <button id="tag-oldest-tab">Tag Oldest Tab</button>
      </div>
      <div class="archive-section">
        <input id="currentTabId" type="hidden" value="1">
        <input id="tagInput" type="text" value="Research">
        <button id="archiveTabButton">Archive Current Tab</button>
        <button id="viewArchivesButton">View Archived Tabs</button>
        <ul id="archiveList"></ul>
      </div>
      <div class="session-section">
        <button id="saveSessionButton">Save Current Session</button>
        <button id="viewSessionsButton">View Saved Sessions</button>
        <ul id="sessionsList"></ul>
      </div>
    `;

    // Initialize popup instance without passing mockBrowser
    popup = initPopup();

    // Use utility function to create mock tabs
    browser.tabs.query.mockResolvedValue(createBulkTabs(3));

    // Simulate DOMContentLoaded event to initialize event listeners
    document.dispatchEvent(new Event('DOMContentLoaded'));
  });

  afterEach(async () => {
    // Await any pending promises
    await Promise.resolve();
    
    // Clear all mocks and timers
    jest.clearAllMocks();
    jest.clearAllTimers(); // Stop timers to prevent further processing
  });

  /**
   * Validates tab loading functionality
   * Tests proper rendering of tab list in popup UI
   */
  it("should load tabs into the popup", async () => {
    // Configure mock tab response
    const mockTabs = createBulkTabs(2);
    browser.tabs.query.mockResolvedValue(mockTabs);

    await popup.loadTabs();

    // Verify tab list rendering
    const tabList = document.getElementById("tab-list");
    expect(tabList.children.length).toBe(2);
    expect(tabList.children[0].textContent).toBe("Tab 1");
    expect(tabList.children[1].textContent).toBe("Tab 2");
  });

  /**
   * Validates suspend button functionality
   * Tests message passing for tab suspension
   */
  it("should handle click event for suspend button", () => {
    // Initialize suspend button handler
    popup.setupSuspendButton();

    // Configure mock message response
    browser.runtime.sendMessage.mockResolvedValue({ message: 'Inactive tabs suspended' });

    // Trigger suspension action
    const suspendButton = document.getElementById("suspend-inactive-tabs");
    suspendButton.click();

    // Verify message sending
    expect(browser.runtime.sendMessage).toHaveBeenCalledWith(
      { action: 'suspendInactiveTabs' }
    );
  });

  /**
   * Validates tagging prompt display functionality
   * Tests proper display of tagging prompt when prompted
   */
  it("should display tagging prompt when prompted", () => {
    // Mock the sendResponse function
    const sendResponse = jest.fn();

    // Simulate receiving a promptTagging message
    const messageHandler = browser.runtime.onMessage.addListener.mock.calls[0][0];
    messageHandler({ action: "promptTagging", tabId: 1 }, null, sendResponse);

    const taggingPrompt = document.getElementById("tagging-prompt");
    expect(taggingPrompt.style.display).toBe("block");
    expect(sendResponse).toHaveBeenCalledWith({ message: 'Tagging prompt displayed.' });
  });

  /**
   * Validates tagging functionality for the oldest tab
   * Tests proper tagging of the oldest tab
   */
  test('should handle tagging the oldest tab', async () => {
    // Mock GET_STATE response
    browser.runtime.sendMessage
      .mockResolvedValueOnce({ state: { oldestTabId: 1 } }) // For GET_STATE
      .mockResolvedValueOnce({ success: true }) // For DISPATCH_ACTION
      .mockResolvedValueOnce({ success: true }); // For tagAdded

    // Mock tabs.get response
    const taggedTab = createTaggedTab(1, 'Tagged');
    browser.tabs.get.mockResolvedValue(taggedTab);

    const tagButton = document.getElementById("tag-oldest-tab");
    tagButton.click();

    // Use setTimeout instead of setImmediate
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(browser.tabs.get).toHaveBeenCalledWith(1);
    expect(browser.runtime.sendMessage).toHaveBeenCalledWith({
      action: 'DISPATCH_ACTION',
      payload: {
        type: 'ARCHIVE_TAB',
        tabId: 1,
        tag: 'Tagged',
        tabData: { title: taggedTab.title, url: taggedTab.url },
      },
    });
  }, 30000);

  /**
   * Validates archive tab button functionality
   * Tests proper archiving of the current tab
   */
  test('should handle click event for archive tab button', async () => {
    const archiveButton = document.getElementById("archiveTabButton");
    
    // Mock tabs.get response for getting current tab
    const currentTab = createMockTab(1, { title: 'Current Tab', url: 'https://current.com' });
    browser.tabs.get.mockResolvedValue(currentTab);

    // Setup mock response
    browser.runtime.sendMessage.mockResolvedValue({ success: true });

    archiveButton.click();

    // Use setTimeout instead of setImmediate
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(browser.runtime.sendMessage).toHaveBeenCalledWith({
      action: 'archiveTab',
      tabId: 1,
      tag: 'Research',
    });
    expect(window.close).toHaveBeenCalled();
  }, 30000);

  /**
   * Validates view archived tabs button functionality
   * Tests proper retrieval and display of archived tabs
   */
  test('should handle click event for view archived tabs button', async () => {
    const viewArchivesButton = document.getElementById("viewArchivesButton");

    // Setup mock response before click
    browser.runtime.sendMessage.mockResolvedValueOnce({
      archivedTabs: {
        Research: [{ title: "Tab 1", url: "https://example.com" }],
        Work: [{ title: "Tab 2", url: "https://work.com" }],
      },
    });

    viewArchivesButton.click();

    // Use setTimeout instead of setImmediate
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(browser.runtime.sendMessage).toHaveBeenCalledWith({ 
      action: "getArchivedTabs" 
    });
  }, 30000);

  /**
   * Validates session management functionality
   * Tests session saving and view operations
   */
  test('should handle click event for save session button', async () => {
    const saveSessionButton = document.getElementById("saveSessionButton");
    
    // Reset prompt and message mocks
    global.prompt.mockImplementation(() => "Morning Session");
    browser.runtime.sendMessage.mockResolvedValue({ success: true });
    
    // Initialize event handlers
    document.dispatchEvent(new Event('DOMContentLoaded'));
    
    // Trigger session save
    saveSessionButton.click();
    
    // Await all pending promises to ensure completion
    await Promise.resolve();
    
    // Verify prompt and message sending
    expect(global.prompt).toHaveBeenCalledWith("Enter a name for this session:");
    expect(browser.runtime.sendMessage).toHaveBeenCalledWith(
      { action: "saveSession", sessionName: "Morning Session" }
    );
    
  }, 30000);

  /**
   * Validates session viewing functionality
   * Tests retrieval and display of saved sessions
   */
  test('should handle click event for view sessions button', async () => {
    const viewSessionsButton = document.getElementById("viewSessionsButton");

    // Configure mock session data
    browser.runtime.sendMessage.mockResolvedValueOnce({
      sessions: {
        "Morning Session": [{ title: "Tab 1", url: "https://example.com" }],
        "Evening Session": [{ title: "Tab 2", url: "https://work.com" }],
      },
    });

    viewSessionsButton.click();

    // Use setTimeout instead of setImmediate
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(browser.runtime.sendMessage).toHaveBeenCalledWith({ 
      action: "getSessions" 
    });
  }, 30000);

  /**
   * Validates complex tab scenarios
   * Tests handling of complex tab scenarios
   */
  it("should handle complex tab scenarios", async () => {
    const complexTabs = createComplexTabs();
    browser.tabs.query.mockResolvedValue(complexTabs);

    await popup.loadTabs();

    // Add your assertions here to verify that complex tabs are handled correctly
  });
});