// tests/jest/options.test.js

const { createMockBrowser } = require("./mocks/browserMock");
const initOptions = require("../../src/options/options");

describe("Options script", () => {
  let mockBrowser;
  let options;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    mockBrowser = createMockBrowser();
    
    // Mock 'browser.storage.sync.set' to return a resolved promise
    mockBrowser.storage.sync.set.mockResolvedValue();
    
    // Setup DOM elements
    document.body.innerHTML = `
      <input id="inactiveThreshold" type="number" value="60">
      <input id="tabLimit" type="number" value="100">
      <button id="save-options">Save</button>
      <div id="save-success">Options saved successfully</div>
    `;
    
    // Mock requestAnimationFrame
    window.requestAnimationFrame = jest.fn(cb => cb());
    
    options = initOptions(mockBrowser);
    global.alert = jest.fn();
  });

  it("should load stored options", () => {
    mockBrowser.storage.sync.get.mockImplementation((keys, callback) => {
      callback({ inactiveThreshold: 30, tabLimit: 50 });
    });

    options.loadOptions();

    expect(document.getElementById("inactiveThreshold").value).toBe("30");
    expect(document.getElementById("tabLimit").value).toBe("50");
  });

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

  afterEach(() => {
    jest.useRealTimers();
  });
});