// tests/jest/options.test.js
/**
 * @fileoverview Test suite for TabCurator options management module
 * Validates configuration persistence, rule management, and UI interactions
 * Implements comprehensive mock browser environment for isolated testing
 * Ensures cross-browser compatibility of options handling
 */

const { createMockBrowser } = require("./mocks/browserMock");
const initOptions = require("../../src/options/options");

/**
 * Primary test suite for options management functionality
 * Implements isolated testing environment with mocked browser APIs
 */
describe("Options script", () => {
  let mockBrowser;
  let options;

  /**
   * Test environment setup
   * Implements fresh DOM and mock state for each test
   * Ensures isolation between test cases
   */
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    mockBrowser = createMockBrowser();
    
    // Mock 'browser.storage.sync.set' to return a resolved promise
    mockBrowser.storage.sync.set.mockResolvedValue();
    
    // Setup DOM elements with saveRulesButton
    document.body.innerHTML = `
      <input id="inactiveThreshold" type="number" value="60">
      <input id="tabLimit" type="number" value="100">
      <button id="save-options">Save</button>
      <div id="save-success">Options saved successfully</div>
      <button id="addRuleButton"></button>
      <button id="saveRulesButton">Save Rules</button>
      <ul id="rulesList"></ul>
    `;
    
    // Mock requestAnimationFrame
    window.requestAnimationFrame = jest.fn(cb => cb());
    
    options = initOptions(mockBrowser);
    global.alert = jest.fn();
  });

  /**
   * Validates options load functionality
   * Tests storage retrieval and DOM updates
   */
  it("should load stored options", () => {
    mockBrowser.storage.sync.get.mockImplementation((keys, callback) => {
      callback({ inactiveThreshold: 30, tabLimit: 50 });
    });

    options.loadOptions();

    expect(document.getElementById("inactiveThreshold").value).toBe("30");
    expect(document.getElementById("tabLimit").value).toBe("50");
  });

  /**
   * Validates options persistence
   * Tests storage updates and success notification
   * Implements animation frame handling
   */
  it("should save new options", async () => {
    const thresholdInput = document.getElementById("inactiveThreshold");
    const tabLimitInput = document.getElementById("tabLimit");
    
    thresholdInput.value = "45";
    tabLimitInput.value = "75";
    
    // Override requestAnimationFrame for this test
    const originalRAF = window.requestAnimationFrame;
    let rafCallback;
    window.requestAnimationFrame = jest.fn(cb => {
      rafCallback = cb;
      return 1;
    });
    
    options.saveOptions();

    // Execute storage callback
    mockBrowser.storage.sync.set.mock.calls[0][1]();

    // Execute rAF callback if it was set
    if (rafCallback) {
      rafCallback();
    }

    // Run timers
    jest.advanceTimersByTime(0);
    await Promise.resolve();

    expect(mockBrowser.storage.sync.set).toHaveBeenCalledWith(
      { inactiveThreshold: 45, tabLimit: 75 },
      expect.any(Function)
    );

    const successMsg = document.getElementById('save-success');
    expect(successMsg.classList.contains('visible')).toBe(true);

    // Restore original requestAnimationFrame
    window.requestAnimationFrame = originalRAF;
  });

  /**
   * Validates error handling during options loading
   * Tests user notification for storage failures
   */
  it("should handle errors when loading options", () => {
    // Set up the error before the get call
    mockBrowser.runtime.lastError = { message: "Failed to load" };
    
    // Mock the get implementation to trigger the error callback
    mockBrowser.storage.sync.get.mockImplementation((keys, callback) => {
      callback({});
    });

    options.loadOptions();

    expect(global.alert).toHaveBeenCalledWith("Failed to load options.");
    
    // Clean up
    mockBrowser.runtime.lastError = null;
  });

  /**
   * Validates rule creation UI functionality
   * Tests DOM manipulation for rule addition
   */
  it("should add a new rule to the UI", () => {
    options.loadOptions();
    const addRuleButton = document.getElementById("addRuleButton");
    addRuleButton.click();

    const rulesList = document.getElementById("rulesList");
    expect(rulesList.children.length).toBe(1);
    expect(rulesList.children[0].querySelector(".rule-condition").value).toBe("");
    expect(rulesList.children[0].querySelector(".rule-action").value).toBe("");
  });

  /**
   * Validates rule deletion UI functionality
   * Tests DOM cleanup for rule removal
   */
  it("should delete a rule from the UI", () => {
    options.loadOptions();
    const addRuleButton = document.getElementById("addRuleButton");
    addRuleButton.click();

    let rulesList = document.getElementById("rulesList");
    const deleteButton = rulesList.children[0].querySelector("button");
    deleteButton.click();

    expect(rulesList.children.length).toBe(0);
  });

  /**
   * Validates rule persistence functionality
   * Tests storage integration for rule saving
   * Implements format validation
   */
  it("should save rules successfully", () => {
    mockBrowser.runtime.lastError = null; // Clear any previous error state
    mockBrowser.storage.sync.set.mockResolvedValue();

    options.loadOptions();
    const addRuleButton = document.getElementById("addRuleButton");
    addRuleButton.click();

    const rulesList = document.getElementById("rulesList");
    const ruleItem = rulesList.children[0];
    const conditionInput = ruleItem.querySelector(".rule-condition");
    const actionInput = ruleItem.querySelector(".rule-action");

    conditionInput.value = "test.com";
    actionInput.value = "Tag: Test";

    const saveRulesButton = document.getElementById("saveRulesButton");
    expect(saveRulesButton).not.toBeNull(); // Add assertion
    saveRulesButton.click();

    expect(mockBrowser.storage.sync.set).toHaveBeenCalledWith(
      { rules: [{ condition: "test.com", action: "Tag: Test" }] },
      expect.any(Function)
    );
  });

  /**
   * Validates error handling during options saving
   * Tests user notification for storage failures
   */
  it("should handle errors when saving options", () => {
    mockBrowser.storage.sync.set.mockImplementation((items, callback) => {
      mockBrowser.runtime.lastError = { message: "Save failed" };
      callback();
    });

    const thresholdInput = document.getElementById("inactiveThreshold");
    const tabLimitInput = document.getElementById("tabLimit");

    thresholdInput.value = "45";
    tabLimitInput.value = "75";

    options.saveOptions();

    expect(global.alert).toHaveBeenCalledWith("Failed to save options. Please try again.");
  });

  /**
   * Test environment cleanup
   * Restores timer functionality post-test
   */
  afterEach(() => {
    jest.useRealTimers();
  });
});