// tests/jest/popup.test.js

const { createMockBrowser } = require("./mocks/browserMock");
const initPopup = require("../../src/popup/popup");

describe("Popup script", () => {
  let mockBrowser;
  let popup;

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockBrowser = createMockBrowser();

    // Mock HTML structure for each test
    document.body.innerHTML = `
      <button id="suspend-inactive-tabs">Suspend Inactive Tabs</button>
      <div id="tab-list"></div>
      <div id="tagging-prompt" style="display:none;">
        <p>You have exceeded the tab limit. Please tag the oldest tab to allow new tabs.</p>
        <button id="tag-oldest-tab">Tag Oldest Tab</button>
      </div>
      <input id="currentTabId" />
      <input id="tagInput" />
      <button id="viewArchivesButton"></button>
      <button id="saveSessionButton"></button>
      <button id="viewSessionsButton"></button>
      <ul id="archiveList"></ul>
      <ul id="sessionsList"></ul>
    `;

    // Initialize popup with mock browser
    popup = initPopup(mockBrowser);

    // Ensure tabs.get is a mock function
    mockBrowser.tabs.get = jest.fn();
  });

  it("should load tabs into the popup", () => {
    mockBrowser.tabs.query.mockImplementation((queryInfo, callback) => {
      callback([
        { title: 'Tab 1' },
        { title: 'Tab 2' },
      ]);
    });

    // Execute the function under test
    popup.loadTabs();

    const tabList = document.getElementById("tab-list");
    expect(tabList.children.length).toBe(2);
    expect(tabList.children[0].textContent).toBe("Tab 1");
    expect(tabList.children[1].textContent).toBe("Tab 2");
  });

  it("should handle click event for suspend button", () => {
    popup.setupSuspendButton();

    mockBrowser.runtime.sendMessage.mockImplementation((message, callback) => {
      callback({ message: 'Inactive tabs suspended' });
    });

    const suspendButton = document.getElementById("suspend-inactive-tabs");
    suspendButton.click();

    expect(mockBrowser.runtime.sendMessage).toHaveBeenCalledWith(
      { action: 'suspendInactiveTabs' },
      expect.any(Function)
    );
  });

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

  it("should handle click event for archive tab button", () => {
    // Mock necessary DOM elements and browser methods
    const archiveButton = document.getElementById("archiveTabButton");
    const tagInput = document.getElementById("tagInput");
    const currentTabIdInput = document.getElementById("currentTabId");
    
    tagInput.value = "Research";
    currentTabIdInput.value = "1";
    
    mockBrowser.runtime.sendMessage.mockImplementation((message, callback) => {
      expect(message).toEqual({ action: "archiveTab", tabId: 1, tag: "Research" });
      callback();
    });
    
    // Execute the click event
    archiveButton.click();
    
    expect(mockBrowser.runtime.sendMessage).toHaveBeenCalledWith(
      { action: "archiveTab", tabId: 1, tag: "Research" },
      expect.any(Function)
    );
  });
  
  it("should handle click event for view archived tabs button", () => {
    // Mock response from runtime.sendMessage
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
    
    // Execute the click event
    const viewArchivesButton = document.getElementById("viewArchivesButton");
    viewArchivesButton.click();
    
    const archiveList = document.getElementById("archiveList");
    expect(mockBrowser.runtime.sendMessage).toHaveBeenCalledWith(
      { action: "getArchivedTabs" },
      expect.any(Function)
    );
    expect(archiveList.children.length).toBe(4); // 2 tags and 2 links
    expect(archiveList.children[0].textContent).toBe("Tag: Research");
    expect(archiveList.children[1].textContent).toBe("Tab 1");
    expect(archiveList.children[2].textContent).toBe("Tag: Work");
    expect(archiveList.children[3].textContent).toBe("Tab 2");
  });
  
  it("should handle click event for save session button", () => {
    // Mock prompt and runtime.sendMessage
    global.prompt = jest.fn().mockReturnValue("Morning Session");
    
    mockBrowser.runtime.sendMessage.mockImplementation((message) => {
      expect(message).toEqual({ action: "saveSession", sessionName: "Morning Session" });
    });
    
    // Execute the click event
    const saveSessionButton = document.getElementById("saveSessionButton");
    saveSessionButton.click();
    
    expect(global.prompt).toHaveBeenCalledWith("Enter a name for this session:");
    expect(mockBrowser.runtime.sendMessage).toHaveBeenCalledWith(
      { action: "saveSession", sessionName: "Morning Session" }
    );
  });
  
  it("should handle click event for view sessions button and restore a session", () => {
    // Mock response from runtime.sendMessage for getSessions
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
    
    // Execute the click event to view sessions
    const viewSessionsButton = document.getElementById("viewSessionsButton");
    viewSessionsButton.click();
    
    const sessionsList = document.getElementById("sessionsList");
    expect(mockBrowser.runtime.sendMessage).toHaveBeenCalledWith(
      { action: "getSessions" },
      expect.any(Function)
    );
    expect(sessionsList.children.length).toBe(2); // Two session buttons
    expect(sessionsList.children[0].textContent).toBe("Morning Session");
    expect(sessionsList.children[1].textContent).toBe("Evening Session");
    
    // Mock restoring a session
    mockBrowser.runtime.sendMessage.mockClear();
    const morningSessionButton = sessionsList.children[0];
    morningSessionButton.click();
    
    expect(mockBrowser.runtime.sendMessage).toHaveBeenCalledWith(
      { action: "restoreSession", sessionName: "Morning Session" }
    );
  });
});