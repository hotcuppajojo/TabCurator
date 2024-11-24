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
});