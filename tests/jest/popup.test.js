// tests/jest/popup.test.js

/**
 * @fileoverview Test suite for TabCurator popup functionality
 * Implements comprehensive testing of UI interactions and event handling
 * Validates cross-browser compatibility of popup operations
 * Tests tab management, archival, and session handling features
 */

const { createMockBrowser } = require("./mocks/browserMock");
const initPopup = require("../../src/popup/popup");

describe("Popup script", () => {
  let mockBrowser;
  let popup;

  beforeEach(() => {
    // Reset test environment and mocks
    jest.clearAllMocks();
    mockBrowser = createMockBrowser();
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

    // Initialize popup instance with mock browser
    popup = initPopup(mockBrowser);
  });

  /**
   * Validates tab loading functionality
   * Tests proper rendering of tab list in popup UI
   */
  it("should load tabs into the popup", () => {
    // Configure mock tab response
    mockBrowser.tabs.query.mockImplementation((queryInfo, callback) => {
      callback([
        { title: 'Tab 1' },
        { title: 'Tab 2' },
      ]);
    });

    popup.loadTabs();

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
    mockBrowser.runtime.sendMessage.mockImplementation((message, callback) => {
      callback({ message: 'Inactive tabs suspended' });
    });

    // Trigger suspension action
    const suspendButton = document.getElementById("suspend-inactive-tabs");
    suspendButton.click();

    // Verify message sending
    expect(mockBrowser.runtime.sendMessage).toHaveBeenCalledWith(
      { action: 'suspendInactiveTabs' },
      expect.any(Function)
    );
  });

  /**
   * Validates tagging prompt display functionality
   * Tests proper display of tagging prompt when prompted
   */
  it("should display tagging prompt when prompted", () => {
    // Initialize event listeners
    popup.setupTaggingPrompt();

    // Simulate receiving a promptTagging message
    mockBrowser.runtime.onMessage.addListener.mockImplementation((handler) => {
      handler({ action: "promptTagging", tabId: 1 }, null, jest.fn());
    });

    // Trigger the message
    const messageHandler = mockBrowser.runtime.onMessage.addListener.mock.calls[0][0];
    messageHandler({ action: "promptTagging", tabId: 1 }, null, jest.fn());

    const taggingPrompt = document.getElementById("tagging-prompt");
    expect(taggingPrompt.style.display).toBe("block");
  });

  /**
   * Validates tagging functionality for the oldest tab
   * Tests proper tagging of the oldest tab
   */
  it("should handle tagging the oldest tab", async () => {
    popup.setupTaggingPrompt();
  
    // Mock storage.local.get implementation
    mockBrowser.storage.local.get.mockImplementation((key, callback) => {
      callback({ oldestTabId: 1 });
    });
  
    // Mock tabs.get implementation
    mockBrowser.tabs.get.mockImplementation((tabId, callback) => {
      callback({ id: tabId, title: `Tab ${tabId}` });
    });
  
    const tagButton = document.getElementById("tag-oldest-tab");
    tagButton.click();
  
    // Wait for async operations
    await new Promise(resolve => setTimeout(resolve, 0));
  
    expect(mockBrowser.storage.local.get).toHaveBeenCalledWith('oldestTabId', expect.any(Function));
    expect(mockBrowser.tabs.get).toHaveBeenCalledWith(1, expect.any(Function));
    expect(mockBrowser.tabs.update).toHaveBeenCalledWith(
      1,
      { title: "[Tagged] Tab 1" },
      expect.any(Function)
    );
  });

  /**
   * Validates archive tab button functionality
   * Tests proper archiving of the current tab
   */
  it("should handle click event for archive tab button", async () => {
    const archiveButton = document.getElementById("archiveTabButton");
    
    // Setup mock response
    mockBrowser.runtime.sendMessage.mockImplementation((message, callback) => {
      callback({ success: true });
      return Promise.resolve({ success: true });
    });
    
    archiveButton.click();
    
    // Wait for all promises to resolve
    await Promise.resolve();
    
    expect(mockBrowser.runtime.sendMessage).toHaveBeenCalledWith(
      { action: "archiveTab", tabId: 1, tag: "Research" },
      expect.any(Function)
    );
    expect(window.close).toHaveBeenCalled();
  });

  /**
   * Validates view archived tabs button functionality
   * Tests proper retrieval and display of archived tabs
   */
  it("should handle click event for view archived tabs button", async () => {
    const viewArchivesButton = document.getElementById("viewArchivesButton");
    
    // Setup mock response before click
    mockBrowser.runtime.sendMessage.mockImplementation((message, callback) => {
      if (message.action === "getArchivedTabs") {
        callback({
          archivedTabs: {
            Research: [{ title: "Tab 1", url: "https://example.com" }],
            Work: [{ title: "Tab 2", url: "https://work.com" }]
          }
        });
      }
    });
    
    viewArchivesButton.click();
    
    // Wait for all promises to resolve
    await Promise.resolve();
    
    expect(mockBrowser.runtime.sendMessage).toHaveBeenCalledWith(
      { action: "getArchivedTabs" },
      expect.any(Function)
    );
  });

  /**
   * Validates session management functionality
   * Tests session saving and view operations
   */
  it("should handle click event for save session button", async () => {
    const saveSessionButton = document.getElementById("saveSessionButton");
    
    // Reset prompt and message mocks
    global.prompt.mockClear();
    mockBrowser.runtime.sendMessage.mockClear();
    
    // Initialize event handlers
    document.dispatchEvent(new Event('DOMContentLoaded'));
    
    // Trigger session save
    saveSessionButton.click();
    
    // Allow async operations to complete
    await new Promise(resolve => setTimeout(resolve));
    
    // Verify prompt and message sending
    expect(global.prompt).toHaveBeenCalledWith("Enter a name for this session:");
    expect(mockBrowser.runtime.sendMessage).toHaveBeenCalledWith(
      { action: "saveSession", sessionName: "Morning Session" }
    );
  });
  
  /**
   * Validates session viewing functionality
   * Tests retrieval and display of saved sessions
   */
  it("should handle click event for view sessions button", async () => {
    const viewSessionsButton = document.getElementById("viewSessionsButton");
    
    // Configure mock session data
    mockBrowser.runtime.sendMessage.mockImplementation((message, callback) => {
      if (message.action === "getSessions") {
        callback({
          sessions: {
            "Morning Session": [{ title: "Tab 1", url: "https://example.com" }],
            "Evening Session": [{ title: "Tab 2", url: "https://work.com" }]
          }
        });
      }
    });
    
    // Initialize handlers and trigger view
    document.dispatchEvent(new Event('DOMContentLoaded'));
    viewSessionsButton.click();
    
    // Allow async operations to complete
    await new Promise(resolve => setTimeout(resolve));
    
    // Verify session retrieval request
    expect(mockBrowser.runtime.sendMessage).toHaveBeenCalledWith(
      { action: "getSessions" },
      expect.any(Function)
    );
  });
});