// Tests background service worker core functionality with isolated mock environment

const { createMockBrowser } = require("./mocks/browserMock");

describe("Background script", () => {
  // Prevents race conditions in async tests by ensuring microtask queue is empty
  const flushPromises = () => new Promise(resolve => setTimeout(resolve, 0));

  let background;
  let mockBrowser;

  beforeEach(() => {
    // Prevents test cross-contamination
    jest.clearAllMocks();
    
    // Sets up fresh browser mock for each test
    mockBrowser = createMockBrowser();
  
    // Mocks service worker event handling
    global.self.addEventListener = jest.fn();

    // Loads background script after mocks to ensure proper initialization
    const initBackground = require("../../src/background/background.js");
  
    // Ensures test environment for consistent behavior
    process.env.NODE_ENV = 'test';
  
    // Creates fresh background instance for each test
    background = initBackground(mockBrowser);
  
    // Resets tagging state for predictable tests
    background.setIsTaggingPromptActive(false);
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  test("should add listeners for tab events", () => {
    // Verify all critical tab lifecycle events are monitored for state management
    expect(mockBrowser.tabs.onActivated.addListener).toHaveBeenCalled();
    expect(mockBrowser.tabs.onUpdated.addListener).toHaveBeenCalled();
    expect(mockBrowser.tabs.onRemoved.addListener).toHaveBeenCalled();
    expect(mockBrowser.tabs.onCreated.addListener).toHaveBeenCalled();
  });

  test("should set up an alarm for checking inactive tabs", () => {
    // 5-minute interval balances resource usage with responsiveness
    expect(mockBrowser.alarms.create).toHaveBeenCalledWith("checkForInactiveTabs", { periodInMinutes: 5 });
  });

  test("should add a listener for messages", () => {
    // Ensures background worker can receive UI and extension messages
    expect(mockBrowser.runtime.onMessage.addListener).toHaveBeenCalled();
  });

  test("should add global error and rejection listeners", () => {
    // Global error catching prevents silent failures in service worker
    expect(global.self.addEventListener).toHaveBeenCalledWith("error", expect.any(Function));
    expect(global.self.addEventListener).toHaveBeenCalledWith("unhandledrejection", expect.any(Function));
  });

  test("should handle tagAdded message correctly", () => {
    // Testing message flow ensures UI-background communication works
    const sendResponse = jest.fn();
    const message = { action: 'tagAdded', tabId: 1 };
    
    // Direct handler call simulates browser message dispatch
    mockBrowser.runtime.onMessage.addListener.mock.calls[0][0](message, null, sendResponse);

    // Verify proper cleanup and acknowledgment
    expect(mockBrowser.storage.local.remove).toHaveBeenCalledWith('oldestTabId', expect.any(Function));
    expect(sendResponse).toHaveBeenCalledWith({ message: 'Tag processed successfully.' });
  });

  test("should prompt user to tag the oldest tab when tab limit is exceeded", async () => {
    // Set fixed time reference for deterministic age calculations
    const now = Date.now();
    const oldTime = now - (2 * 60 * 60 * 1000);
    
    // Exceed limit by one to trigger tagging prompt
    const tabs = Array.from({ length: 101 }, (_, i) => ({
      id: i + 1,
      active: i === 100
    }));

    // Mock storage responses for consistent limit testing
    mockBrowser.tabs.query = jest.fn((_, callback) => {
      callback(tabs);
      return Promise.resolve(tabs);
    });

    // Configure thresholds to guarantee limit breach
    mockBrowser.storage.sync.get.mockImplementation((keys, callback) => {
      callback({ inactiveThreshold: 60, tabLimit: 100 });
    });

    // Age first tab to ensure it's selected for tagging
    background.tabActivity[1] = oldTime;

    await background.checkForInactiveTabs();

    // Verify prompt targets oldest tab for management
    expect(mockBrowser.runtime.sendMessage).toHaveBeenCalledWith(
      { action: 'promptTagging', tabId: 1 },
      expect.any(Function)
    );
  });

  test("should suspend inactive tabs based on the threshold", async () => {
    // Fixed timestamp ensures reliable age comparisons
    const now = Date.now();
    jest.spyOn(Date, 'now').mockImplementation(() => now);
  
    // Configure system bounds for suspension criteria
    mockBrowser.storage.sync.get.mockImplementation((keys, callback) => {
      callback({
        inactiveThreshold: 60,
        tabLimit: 100
      });
      return Promise.resolve({
        inactiveThreshold: 60,
        tabLimit: 100
      });
    });
  
    // Minimal test set covers both suspension cases
    const mockTabs = [
      { id: 1, active: false, title: 'Inactive Tab' },
      { id: 2, active: true, title: 'Active Tab' }
    ];
  
    // Controlled tab state ensures predictable test results
    mockBrowser.tabs.query.mockImplementation((query, callback) => {
      callback?.(mockTabs);
      return Promise.resolve(mockTabs);
    });
  
    // Configure distinct activity times to test threshold logic
    background.tabActivity[1] = now - (61 * 60 * 1000);
    background.tabActivity[2] = now;
  
    await background.checkForInactiveTabs();
    await flushPromises();
  
    // Verify only inactive tabs are suspended
    expect(mockBrowser.tabs.discard).toHaveBeenCalledWith(1, expect.any(Function));
    expect(mockBrowser.tabs.discard).not.toHaveBeenCalledWith(2, expect.any(Function));
  });

});