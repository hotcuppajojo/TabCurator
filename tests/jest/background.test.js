// Tests background service worker core functionality with isolated mock environment

const { createMockBrowser } = require("./mocks/browserMock");
const initBackground = require('../../src/background/background.js');

describe("Background script", () => {
  // Prevents race conditions in async tests by ensuring microtask queue is empty
  const flushPromises = () => new Promise(resolve => setTimeout(resolve, 0));

  let background;
  let mockBrowser;
  let actionHistory; // Move actionHistory to be accessible in tests
  let archivedTabs;  // Move archivedTabs to be accessible in tests

  beforeEach(() => {
    // Prevents test cross-contamination
    jest.clearAllMocks();
    
    // Sets up fresh browser mock for each test
    mockBrowser = createMockBrowser();

    // Create tabs.onUpdated.addListener to store the listener function
    const onUpdatedListeners = [];
    mockBrowser.tabs.onUpdated = {
      addListener: jest.fn((listener) => {
        onUpdatedListeners.push(listener);
      })
    };

    // Mock tabs.onActivated.addListener
    mockBrowser.tabs.onActivated.addListener = jest.fn();

    // Mock tabs.onRemoved.addListener
    mockBrowser.tabs.onRemoved.addListener = jest.fn();

    // Mock tabs.onCreated.addListener
    mockBrowser.tabs.onCreated.addListener = jest.fn();

    // Mock tabs.create to ensure it records calls
    mockBrowser.tabs.create = jest.fn().mockImplementation((properties) => {
      return Promise.resolve({ id: 2, ...properties });
    });

    // Mocks service worker event handling
    global.self = {
      addEventListener: jest.fn()
    };

    // Create shared references for actionHistory and archivedTabs
    actionHistory = []; // Initialize actionHistory
    archivedTabs = {};  // Initialize archivedTabs

    // Fix the import and initialization
    jest.isolateModules(() => {
      background = initBackground(mockBrowser, actionHistory, archivedTabs);
    });

    // Assign shared references to background for convenience
    background.actionHistory = actionHistory;
    background.archivedTabs = archivedTabs;

    // Resets tagging state for predictable tests
    background.setIsTaggingPromptActive(false);

    // Mock tabs.query to return a Promise resolving to 101 tabs
    mockBrowser.tabs.query.mockResolvedValue(
      Array.from({ length: 101 }, (_, i) => ({
        id: i + 1,
        active: false,
        title: `Tab ${i + 1}`
      }))
    );

    // Ensure sendMessage correctly handles callbacks
    mockBrowser.runtime.sendMessage.mockImplementation((message, callback) => {
      if (typeof callback === 'function') {
        callback({ success: true });
      }
      return Promise.resolve({ success: true });
    });

    // Expose the listeners for use in tests
    background.onUpdatedListeners = onUpdatedListeners;

    // Instead of pre-populating actionHistory, reset it to ensure test isolation
    background.actionHistory = [];

    // Ensure tabs.remove is mocked
    mockBrowser.tabs.remove = jest.fn().mockResolvedValue();

    // Ensure global.self.addEventListener remains a mock function
    if (jest.isMockFunction(global.self.addEventListener)) {
      global.self.addEventListener.mockReset();
    } else {
      global.self.addEventListener = jest.fn();
    }
  });

  afterEach(() => {
    jest.clearAllMocks();
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
    expect(sendResponse).toHaveBeenCalledWith({ message: 'Tag processed successfully.' });
  });

  test("should prompt user to tag the oldest tab when tab limit is exceeded", async () => {
    // Set fixed time reference for deterministic age calculations
    const now = Date.now();
    const oldTime = now - (2 * 60 * 60 * 1000);
    
    // Exceed limit by one to trigger tagging prompt
    const tabs = Array.from({ length: 101 }, (_, i) => ({
      id: i + 1,
      active: false
    }));

    // Mock tabs.query to return the prepared tabs without using callbacks
    mockBrowser.tabs.query.mockResolvedValue(tabs);

    // Configure storage to breach the tab limit
    mockBrowser.storage.sync.get.mockResolvedValue({
      inactiveThreshold: 60,
      tabLimit: 100
    });

    // Age first tab to ensure it's selected for tagging
    background.tabActivity[1] = oldTime;

    // Trigger the alarm manually
    await background.checkForInactiveTabs();
    await flushPromises();

    // Verify sendMessage was called correctly
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
    expect(mockBrowser.tabs.discard).toHaveBeenCalledWith(1);
    expect(mockBrowser.tabs.discard).not.toHaveBeenCalledWith(2, expect.any(Function));
  });

  test("should initialize default settings on installation", () => {
    // Simulate the onInstalled event
    const onInstalledCallback = mockBrowser.runtime.onInstalled.addListener.mock.calls[0][0];
    onInstalledCallback();

    // Check that storage.sync.set was called with default settings
    expect(mockBrowser.storage.sync.set).toHaveBeenCalledWith({
      inactiveThreshold: 60,
      tabLimit: 100,
      rules: [], // Ensure rules are initialized
    });
  });

  test("should handle undoLastAction message correctly", async () => {
    // Pre-populate actionHistory with an archive action
    const archivedTab = { id: 1, url: 'https://example.com', title: 'Example Tab' };
    background.actionHistory.push({
      type: 'archive',
      tab: archivedTab,
      tag: 'testTag'
    });
  
    background.archivedTabs['testTag'] = [
      { url: 'https://example.com', title: 'Example Tab' }
    ];
  
    // Mock tabs.create to return a predictable result
    mockBrowser.tabs.create.mockResolvedValueOnce({
      id: 2,
      url: 'https://example.com',
      active: true
    });
  
    await background.undoLastAction();
    await flushPromises();
  
    expect(mockBrowser.tabs.create).toHaveBeenCalledWith(
      expect.objectContaining({ url: 'https://example.com', active: true })
    );
    expect(background.archivedTabs['testTag']).toHaveLength(0);
  });

  test("should apply user-defined rules on tab update", async () => {
    const rules = [{ keyword: 'example', action: 'archive', tag: 'testTag' }];
    mockBrowser.storage.sync.get.mockImplementation((key) => {
      return Promise.resolve({ rules });
    });
  
    const tab = { id: 1, url: 'https://example.com', title: 'Example Site' };
    const changeInfo = { status: 'complete' };
  
    // Get the actual listener that was registered
    const [listener] = mockBrowser.tabs.onUpdated.addListener.mock.calls[0];
    
    // Call the listener and wait for any promises to resolve
    await listener(tab.id, changeInfo, tab);
    await flushPromises();
  
    // Now verify the action history
    expect(background.actionHistory[0]).toEqual({
      type: 'archive',
      tab: expect.objectContaining({ id: 1, title: 'Example Site', url: 'https://example.com' }),
      tag: 'testTag'
    });
  });

});