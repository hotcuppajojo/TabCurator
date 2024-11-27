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

    background.savedSessions = {}; // Reset savedSessions

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
    const now = Date.now();
    jest.spyOn(Date, 'now').mockImplementation(() => now);
    
    // Ensure mockBrowser is properly initialized
    expect(mockBrowser.tabs).toBeDefined();
    
    // Set up tabs and mock implementations
    const mockTabs = [
      { id: 1, active: false, title: 'Inactive Tab' },
      { id: 2, active: true, title: 'Active Tab' }
    ];
    
    mockBrowser.tabs.query.mockResolvedValue(mockTabs);
    mockBrowser.storage.sync.get.mockResolvedValue({
      inactiveThreshold: 60,
      tabLimit: 100
    });
    
    // Age first tab
    background.tabActivity[1] = now - (61 * 60 * 1000);
    
    await background.checkForInactiveTabs(mockBrowser);
    await flushPromises();
    
    expect(mockBrowser.tabs.discard).toHaveBeenCalledWith(1);
  });

  test("should initialize default settings on installation", () => {
    const onInstalledListener = mockBrowser.runtime.onInstalled.addListener.mock.calls[0][0];
    onInstalledListener();
    
    expect(mockBrowser.storage.sync.set).toHaveBeenCalledWith({
      inactiveThreshold: 60,
      tabLimit: 100,
      rules: []
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
    const rules = [{ condition: 'example', action: 'Tag: testTag' }];
    mockBrowser.storage.sync.get.mockResolvedValue({ rules });
    
    const tab = { id: 1, url: 'https://example.com', title: 'Example Site' };
    
    await background.applyRulesToTab(tab, mockBrowser);
    await flushPromises();
    
    expect(mockBrowser.tabs.remove).toHaveBeenCalledWith(1);
  }, 5000); // Reduced timeout

  // Tests for applyRulesToTab function
  describe("applyRulesToTab", () => {
    test("should archive tab based on rule condition", async () => {
      const rule = { condition: 'example.com', action: 'Tag: Research' };
      const tab = { id: 1, url: 'https://example.com/page', title: 'Example Page' };
      
      // Fix storage mock implementation
      mockBrowser.storage.sync.get.mockImplementation((key, callback) => {
        const data = { rules: [rule] };
        if (callback) callback(data);
        return Promise.resolve(data);
      });

      await background.applyRulesToTab(tab, mockBrowser);
      await flushPromises();

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
    beforeEach(() => {
      // Reset session state
      background.savedSessions = {};
      mockBrowser.tabs.query.mockResolvedValue([
        { id: 1, title: 'Tab 1', url: 'https://example1.com' },
        { id: 2, title: 'Tab 2', url: 'https://example2.com' }
      ]);
    });

    test("should save current session", async () => {
      const sessionName = 'Session1';
      const tabs = [
        { id: 1, title: 'Tab 1', url: 'https://example1.com' },
        { id: 2, title: 'Tab 2', url: 'https://example2.com' }
      ];

      mockBrowser.tabs.query.mockResolvedValue(tabs);
      
      await background.saveSession(sessionName, mockBrowser);
      await flushPromises();

      expect(background.savedSessions[sessionName]).toEqual(
        tabs.map(({title, url}) => ({title, url}))
      );
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
      const sendResponse = jest.fn();
      const sessionData = {
        'Session1': [{ title: 'Tab 1', url: 'https://example1.com' }]
      };
      background.savedSessions = sessionData;
      const message = { action: 'getSessions' };
      
      await background.messageListeners[0](message, null, sendResponse);
      await flushPromises();
      
      expect(sendResponse).toHaveBeenCalledWith({ sessions: sessionData });
    });

    test("should handle restoreSession message", async () => {
      const sendResponse = jest.fn();
      const message = { action: 'restoreSession', sessionName: 'Session1' };
      
      // Mock restoreSession to track calls
      jest.spyOn(background, 'restoreSession').mockResolvedValue();
      
      const result = background.messageListeners[0](message, null, sendResponse);
      expect(result).toBe(true); // Should return true for async response
      
      await flushPromises();
      
      expect(background.restoreSession).toHaveBeenCalledWith('Session1', mockBrowser);
      expect(sendResponse).toHaveBeenCalledWith({ success: true });
    });
  });

  // Tests for tabs.onCreated listener
  describe("tabs.onCreated listener", () => {
    beforeEach(() => {
      jest.spyOn(background, 'applyRulesToTab').mockResolvedValue(undefined);
    });

    test("should apply rules when a new tab is created", async () => {
      const newTab = { id: 3, url: 'https://example.com/new', title: 'New Example Tab' };
      const onCreatedListener = background.createdListeners[0];
      
      await onCreatedListener(newTab);
      await flushPromises();

      expect(background.applyRulesToTab).toHaveBeenCalledWith(newTab, mockBrowser);
    });

    test("should not apply rules when url doesn't match", async () => {
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