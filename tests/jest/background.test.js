// Tests background service worker core functionality with isolated mock environment

const { createMockBrowser } = require("./mocks/browserMock");
const background = require('../../src/background/background.js');

describe("Background script", () => {
  // Prevents race conditions in async tests by ensuring microtask queue is empty
  const flushPromises = () => new Promise(resolve => setTimeout(resolve, 0));

  let mockBrowser;

  // Handle module-level initialization
  beforeAll(() => {
    // Clear any existing modules
    jest.resetModules();

    // Ensure global.self exists and has proper event listener capabilities
    global.self = {
      addEventListener: jest.fn(),
      error: jest.fn(),
      unhandledrejection: jest.fn()
    };
  });

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockBrowser = createMockBrowser();

    // Mock runtime.onMessage to store listeners
    const messageListeners = [];
    mockBrowser.runtime.onMessage = {
      addListener: jest.fn((listener) => messageListeners.push(listener)),
      callListeners: (...args) => messageListeners.forEach(listener => listener(...args))
    };

    // Mock onUpdated to store listeners
    const updatedListeners = [];
    mockBrowser.tabs.onUpdated = {
      addListener: jest.fn((listener) => updatedListeners.push(listener)),
      callListeners: (...args) => updatedListeners.forEach(listener => listener(...args))
    };

    // Store listeners for other events
    const createdListeners = [];
    mockBrowser.tabs.onCreated = {
      addListener: jest.fn((listener) => createdListeners.push(listener)),
      callListeners: (...args) => createdListeners.forEach(listener => listener(...args))
    };

    // Initialize background with mocks
    background.initBackground(mockBrowser);

    // Make listeners accessible in tests
    background.messageListeners = messageListeners;
    background.updatedListeners = updatedListeners;
    background.createdListeners = createdListeners;

    // Reset test state
    background.actionHistory.length = 0;
    Object.keys(background.archivedTabs).forEach(key => delete background.archivedTabs[key]);
    background.setIsTaggingPromptActive(false);
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
    await background.checkForInactiveTabs(mockBrowser);
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
    // FAILING: TypeError - Cannot read properties of undefined (reading '0')
    // Root cause: mock.calls array is empty because onInstalled listener was never registered
    // Fix: Need to ensure onInstalled mock is properly initialized in beforeEach
    // Alternative: Mock implementation may need to store callback for later access
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
  
    await background.undoLastAction(mockBrowser);
    await flushPromises();
  
    expect(mockBrowser.tabs.create).toHaveBeenCalledWith(
      expect.objectContaining({ url: 'https://example.com', active: true })
    );
    expect(background.archivedTabs['testTag']).toHaveLength(0);
  });

  test("should apply user-defined rules on tab update", async () => {
    // FAILING: Test timeout after 10000ms
    // Root cause: Async operations not completing or promises not resolving
    // Potential fixes:
    // - Increase Jest timeout threshold
    // - Check for unresolved promises in rule application
    // - Verify all async mock implementations resolve properly
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

  // Tests for applyRulesToTab function
  describe("applyRulesToTab", () => {
    test("should archive tab based on rule condition", async () => {
      // FAILING: TypeError - Cannot read properties of undefined (reading 'storage')
      // Root cause: browserInstance.storage not properly initialized in test
      // Fix areas:
      // - Mock initialization sequence
      // - Storage API simulation
      // - Browser context setup
      const rule = { condition: 'example.com', action: 'Tag: Research', tag: 'Research' };
      const tab = { id: 1, url: 'https://example.com/page', title: 'Example Page' };

      mockBrowser.storage.sync.get.mockImplementation((key, callback) => {
        if (key === "rules") {
          callback({ rules: [rule] });
        }
      });

      await background.applyRulesToTab(tab);

      expect(background.archivedTabs['Research']).toContainEqual({ title: 'Example Page', url: 'https://example.com/page' });
      expect(background.actionHistory).toContainEqual({
        type: 'archive',
        tab,
        tag: 'Research'
      });
      expect(mockBrowser.tabs.remove).toHaveBeenCalledWith(1);
    });

    test("should not archive tab if no rule matches", async () => {
      const rule = { condition: 'nonmatching.com', action: 'Tag: Work', tag: 'Work' };
      const tab = { id: 2, url: 'https://example.com/page2', title: 'Another Page' };

      mockBrowser.storage.sync.get.mockImplementation((key, callback) => {
        if (key === "rules") {
          callback({ rules: [rule] });
        }
      });

      await background.applyRulesToTab(tab, mockBrowser);

      expect(background.archivedTabs['Work']).toBeUndefined();
      expect(background.actionHistory).toHaveLength(0);
      expect(mockBrowser.tabs.remove).not.toHaveBeenCalledWith(2);
    });
  });

  // Tests for session management
  describe("Session management", () => {
    test("should save current session", async () => {
      // FAILING: TypeError - callback is not a function
      // Root cause: Mismatch between promise and callback patterns
      // Implementation issues:
      // - tabs.query mock using inconsistent API style
      // - Mock trying to use callback when none provided
      // - Promise resolution timing problems
      const sessionName = 'Session1';
      const tabs = [
        { id: 1, title: 'Tab 1', url: 'https://example1.com' },
        { id: 2, title: 'Tab 2', url: 'https://example2.com' }
      ];

      mockBrowser.tabs.query.mockImplementation((query, callback) => {
        callback(tabs);
        return Promise.resolve(tabs);
      });

      global.alert = jest.fn();

      await background.saveSession(sessionName, mockBrowser);

      expect(background.savedSessions[sessionName]).toEqual([
        { title: 'Tab 1', url: 'https://example1.com' },
        { title: 'Tab 2', url: 'https://example2.com' }
      ]);
      expect(mockBrowser.storage.sync.set).toHaveBeenCalledWith({ savedSessions: background.savedSessions });
      expect(global.alert).toHaveBeenCalledWith(`Session "${sessionName}" saved successfully!`);
    });

    test("should restore a saved session", async () => {
      // FAILING: Expected mock function call not received
      // Root cause: Tab creation calls not being tracked/executed
      // Debug points:
      // - Mock function registration
      // - Promise chain completion
      // - Event timing issues
      const sessionName = 'Session1';
      background.savedSessions[sessionName] = [
        { title: 'Tab 1', url: 'https://example1.com' },
        { title: 'Tab 2', url: 'https://example2.com' }
      ];

      global.alert = jest.fn();

      await background.restoreSession(sessionName, mockBrowser);
      await flushPromises();

      expect(mockBrowser.tabs.create).toHaveBeenCalledWith({ url: 'https://example1.com' });
      expect(mockBrowser.tabs.create).toHaveBeenCalledWith({ url: 'https://example2.com' });
      expect(global.alert).toHaveBeenCalledWith(`Session "${sessionName}" restored successfully!`);
    });

    test("should alert if session to restore does not exist", async () => {
      const sessionName = 'NonExistentSession';

      global.alert = jest.fn();

      await background.restoreSession(sessionName, mockBrowser);
      await flushPromises();

      expect(mockBrowser.tabs.create).not.toHaveBeenCalled();
      expect(global.alert).toHaveBeenCalledWith(`Session "${sessionName}" not found.`);
    });

    test("should handle saveSession message", async () => {
      const sendResponse = jest.fn();
      const message = { action: 'saveSession', sessionName: 'Session1' };

      background.messageListeners[0](message, null, sendResponse);
      await flushPromises();

      expect(mockBrowser.tabs.query).toHaveBeenCalledWith({ currentWindow: true });
    });

    test("should handle getSessions message", async () => {
      // FAILING: Mock return value mismatch
      // Root cause: savedSessions state not persisting
      // Issues to check:
      // - State initialization timing
      // - Mock persistence between operations
      // - Session storage synchronization
      const sendResponse = jest.fn();
      background.savedSessions = {
        'Session1': [{ title: 'Tab 1', url: 'https://example1.com' }]
      };
      const message = { action: 'getSessions' };

      await mockBrowser.runtime.onMessage.addListener.mock.calls[0][0](message, null, sendResponse);

      expect(sendResponse).toHaveBeenCalledWith({ sessions: background.savedSessions });
    });

    test("should handle restoreSession message", async () => {
      // FAILING: Expected function call with specific arguments
      // Root cause: Message handler binding issues
      // Potential problems:
      // - Context binding for background methods
      // - Mock function replacement disrupting scope
      // - Async execution order
      const sendResponse = jest.fn();
      const message = { action: 'restoreSession', sessionName: 'Session1' };

      background.restoreSession = jest.fn().mockResolvedValue();

      await background.messageListeners[0](message, null, sendResponse);

      expect(background.restoreSession).toHaveBeenCalledWith('Session1', mockBrowser);
      expect(sendResponse).toHaveBeenCalledWith({ success: true });
    });
  });

  // Tests for tabs.onCreated listener
  describe("tabs.onCreated listener", () => {
    test("should apply rules when a new tab is created", async () => {
      // FAILING: Expected mock function calls not occurring
      // Root cause: Event listener or rule application not working
      // Investigation areas:
      // - Event listener registration
      // - Rule application logic
      // - Mock function setup
      const rule = { condition: 'example.com', action: 'Tag: Research', tag: 'Research' };
      const newTab = { id: 3, url: 'https://example.com/new', title: 'New Example Tab' };

      mockBrowser.storage.sync.get.mockImplementation((key, callback) => {
        if (key === "rules") {
          callback({ rules: [rule] });
        }
      });

      background.applyRulesToTab = jest.fn().mockResolvedValue();

      // Retrieve the onCreated listener
      const onCreatedListener = mockBrowser.tabs.onCreated.addListener.mock.calls[0][0];

      await onCreatedListener(newTab);

      expect(background.applyRulesToTab).toHaveBeenCalledWith(newTab);
      expect(mockBrowser.tabs.remove).toHaveBeenCalledWith(3);
    });

    test("should not archive tab if no rules match on creation", async () => {
      // FAILING: Expected mock function call verification
      // Root cause: applyRulesToTab mock not being called
      // Check:
      // - Event propagation
      // - Mock function registration
      // - Async timing issues
      const rule = { condition: 'nonmatching.com', action: 'Tag: Work', tag: 'Work' };
      const newTab = { id: 4, url: 'https://example.com/new2', title: 'Another New Tab' };

      mockBrowser.storage.sync.get.mockImplementation(async (key, callback) => {
        if (key === "rules") {
          callback({ rules: [rule] });
        }
      });

      const onCreatedListener = mockBrowser.tabs.onCreated.addListener.mock.calls[0][0];

      await onCreatedListener(newTab);

      expect(background.applyRulesToTab).toHaveBeenCalledWith(newTab);
      expect(mockBrowser.tabs.remove).not.toHaveBeenCalledWith(4);
    });
  });
});