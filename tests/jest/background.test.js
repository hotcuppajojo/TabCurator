// tests/jest/background.test.js

describe("Background script", () => {
  beforeAll(() => {
    // Ensure NODE_ENV is set to 'test'
    process.env.NODE_ENV = 'test';
    // Mock Date.now to return a fixed timestamp
    const fixedNow = Date.now();
    jest.spyOn(Date, 'now').mockImplementation(() => fixedNow);
    // Mock the browser APIs used in the background script
    global.chrome = {
      runtime: {
        onMessage: {
          addListener: jest.fn(),
        },
      },
      tabs: {
        onCreated: { addListener: jest.fn() },
        onUpdated: { addListener: jest.fn() },
        onActivated: { addListener: jest.fn() },
        onRemoved: { addListener: jest.fn() }, // Mock for onRemoved listener
        query: jest.fn(() => Promise.resolve([])), // Mock for tabs.query
        discard: jest.fn(() => Promise.resolve()), // Mock for tabs.discard
      },
      alarms: {
        create: jest.fn(),
        onAlarm: { addListener: jest.fn() },
      },
      storage: {
        sync: {
          get: jest.fn(() => Promise.resolve({ inactiveThreshold: 60 })), // Updated mock
        },
      },
    };

    global.browser = global.chrome; // Define browser as chrome

    /// Mock global self object for Service Worker
    global.self = {};
    global.self.addEventListener = jest.fn();

    // Load the background script after setting up the mocks
    require("../../src/background/background.js");
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  it("should add listeners for tab events", () => {
    expect(chrome.tabs.onActivated.addListener).toHaveBeenCalled();
    expect(chrome.tabs.onUpdated.addListener).toHaveBeenCalled();
    expect(chrome.tabs.onRemoved.addListener).toHaveBeenCalled();
  });

  it("should set up an alarm for checking inactive tabs", () => {
    expect(chrome.alarms.create).toHaveBeenCalledWith("checkForInactiveTabs", { periodInMinutes: 5 });
  });

  it("should add a listener for messages from the popup or other parts", () => {
    expect(chrome.runtime.onMessage.addListener).toHaveBeenCalled();
  });

  it("should add global error and rejection listeners", () => {
    expect(self.addEventListener).toHaveBeenCalledWith("error", expect.any(Function));
    expect(self.addEventListener).toHaveBeenCalledWith("unhandledrejection", expect.any(Function));
  });

  it("should suspend inactive tabs when the message is received", async () => {
    const sendResponse = jest.fn();
    const message = { action: "suspendInactiveTabs" };

    // Simulate the onMessage event listener being triggered
    chrome.runtime.onMessage.addListener.mock.calls[0][0](message, null, sendResponse);

    // Wait for the asynchronous response
    await new Promise(process.nextTick);

    expect(sendResponse).toHaveBeenCalledWith({ message: "Inactive tabs suspended" });
  });

  it("should check for inactive tabs based on the threshold", async () => {
    // Mock current time and last active times
    const now = Date.now();
    chrome.tabs.query.mockResolvedValue([
      { id: 1, active: false },
      { id: 2, active: false },
    ]);
  
    const inactiveThreshold = 60; // Default threshold in minutes
    const thresholdMillis = inactiveThreshold * 60 * 1000;
  
    // Add properties to the existing tabActivity object
    global.tabActivity[1] = now - thresholdMillis - 1; // Tab 1 is inactive beyond threshold
    global.tabActivity[2] = now; // Tab 2 is recently active
  
    // Import the checkForInactiveTabs function
    const { checkForInactiveTabs } = require("../../src/background/background.js");
    await checkForInactiveTabs();
  
    // Verify if the suspendTab function was called for the inactive tab
    expect(chrome.tabs.discard).toHaveBeenCalledWith(1);
    expect(chrome.tabs.discard).not.toHaveBeenCalledWith(2);
  });
});