// tests/jest/options.test.js

const { loadOptions, saveOptions } = require("../../src/options/options").default;

describe("Options script", () => {
  beforeEach(() => {
    // Mock HTML structure for each test
    document.body.innerHTML = `
      <input id="inactiveThreshold" type="number" value="0">
      <button id="save-options">Save</button>
    `;

    // Mock the chrome.storage API responses
    chrome.storage.sync.get.mockImplementation((keys, callback) => {
      callback({ inactiveThreshold: 60 });
    });

    chrome.storage.sync.set.mockImplementation((data, callback) => {
      callback();
    });
  });

  it("should load saved options", () => {
    loadOptions();
    const input = document.getElementById("inactiveThreshold");
    expect(input.value).toBe("60");
  });

  it("should save new options", () => {
    // Initialize options to set up event listeners
    document.getElementById("save-options").addEventListener("click", saveOptions);

    // Set a new value for the threshold and trigger the save
    const input = document.getElementById("inactiveThreshold");
    input.value = "30";
    document.getElementById("save-options").click();

    // Verify that the new value is saved to chrome.storage with a number
    expect(chrome.storage.sync.set).toHaveBeenCalledWith(
      { inactiveThreshold: 30 },
      expect.any(Function)
    );
  });
});