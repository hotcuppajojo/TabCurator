// tests/jest/options.test.js

const { createMockBrowser } = require("./mocks/browserMock");
const initOptions = require("../../src/options/options");

describe("Options script", () => {
  let mockBrowser;
  let options;

  beforeEach(() => {
    mockBrowser = createMockBrowser();

    // Mock HTML structure for each test
    document.body.innerHTML = `
      <input id="inactiveThreshold" type="number" value="0">
      <input id="tabLimit" type="number" value="0">
      <button id="save-options">Save</button>
    `;

    // Mock window.alert
    global.alert = jest.fn();

    // Initialize options with mock browser
    options = initOptions(mockBrowser);
  });

  it("should load saved options", () => {
    options.loadOptions();
    const thresholdInput = document.getElementById("inactiveThreshold");
    const tabLimitInput = document.getElementById("tabLimit");
    expect(thresholdInput.value).toBe("60");
    expect(tabLimitInput.value).toBe("100");
  });

  it("should save new options", () => {
    options.loadOptions();

    // Initialize saveOptions to set up event listeners
    document.getElementById("save-options").addEventListener("click", options.saveOptions);

    // Set new values for the threshold and tab limit and trigger the save
    const thresholdInput = document.getElementById("inactiveThreshold");
    const tabLimitInput = document.getElementById("tabLimit");

    thresholdInput.value = "30";
    tabLimitInput.value = "50";

    document.getElementById("save-options").click();

    // Verify that the new values are saved to storage.sync with numbers
    expect(mockBrowser.storage.sync.set).toHaveBeenCalledWith(
      { inactiveThreshold: 30, tabLimit: 50 },
      expect.any(Function)
    );

    // Verify that alert was called
    expect(global.alert).toHaveBeenCalledWith('Options saved successfully.');
  });
});