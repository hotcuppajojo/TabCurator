// tests/jest/options.test.js

const { loadOptions, saveOptions, initOptions } = require("../../src/options/options");

describe("Options script", () => {
  beforeEach(() => {
    // Mock HTML structure for each test
    document.body.innerHTML = `
      <input id="inactiveThreshold" type="number" value="0">
      <button id="save-options">Save</button>
    `;

    // Mock the chrome.storage API
    global.chrome = {
      storage: {
        sync: {
          get: jest.fn((_, callback) => callback({ inactiveThreshold: 60 })),
          set: jest.fn()
        }
      }
    };
  });

  it("should load saved options", () => {
    loadOptions();
    const input = document.getElementById("inactiveThreshold");
    expect(input.value).toBe("60");
  });

  it("should save new options", () => {
    initOptions(); // Sets up the save button event listener

    // Set a new value for the threshold and trigger the save
    const input = document.getElementById("inactiveThreshold");
    input.value = "30";
    document.getElementById("save-options").click();

    // Verify that the new value is saved to chrome.storage
    expect(chrome.storage.sync.set).toHaveBeenCalledWith(
      expect.objectContaining({ inactiveThreshold: 30 }),
      expect.any(Function)
    );
  });
});