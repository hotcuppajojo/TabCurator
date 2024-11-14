// tests/jest/background.test.js

describe("Background script", () => {
  let background;
  let selfAddEventListenerSpy;

  beforeAll(() => {
    // Ensure NODE_ENV is set to 'test'
    process.env.NODE_ENV = 'test';

    // Mock Date.now to return a fixed timestamp
    const fixedNow = Date.now();
    jest.spyOn(Date, 'now').mockImplementation(() => fixedNow);

    // Mock the browser APIs used in the background script
    chrome.runtime.onMessage.addListener.mockImplementation(() => {});
    chrome.tabs.onCreated.addListener.mockImplementation(() => {});
    chrome.tabs.onUpdated.addListener.mockImplementation(() => {});
    chrome.tabs.onActivated.addListener.mockImplementation(() => {});
    chrome.tabs.onRemoved.addListener.mockImplementation(() => {});
    chrome.alarms.create.mockImplementation(() => {});
    chrome.alarms.onAlarm.addListener.mockImplementation(() => {});
    chrome.storage.sync.get.mockImplementation((keys, callback) => callback({ inactiveThreshold: 60 }));
    chrome.storage.sync.set.mockImplementation((data, callback) => callback());

    // Mock global.self for Service Worker
    global.self = {
      addEventListener: jest.fn(),
    };

    // Spy on self.addEventListener
    selfAddEventListenerSpy = jest.spyOn(global.self, 'addEventListener');

    // Load the background script after setting up the mocks and spies
    background = require("../../src/background/background.js");

    // Spy on suspendTab function after loading the background script
    jest.spyOn(background, 'suspendTab').mockImplementation(() => Promise.resolve());
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
    expect(selfAddEventListenerSpy).toHaveBeenCalledWith("error", expect.any(Function));
    expect(selfAddEventListenerSpy).toHaveBeenCalledWith("unhandledrejection", expect.any(Function));
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

    // Update the tabActivity in the background module
    background.tabActivity[1] = now - thresholdMillis - 1; // Tab 1 is inactive beyond threshold
    background.tabActivity[2] = now; // Tab 2 is recently active

    // Call the function under test
    await background.checkForInactiveTabs();

    // Verify if the suspendTab function was called for the inactive tab
    expect(background.suspendTab).toHaveBeenCalledWith(1);
    expect(background.suspendTab).not.toHaveBeenCalledWith(2);
  });
});