// tests/options.test.js

const { loadOptions, saveOptions, initOptions } = require("../src/options/options");

// Mock HTML structure
beforeEach(() => {
  document.body.innerHTML = `
    <input id="inactiveThreshold" type="number" value="60">
    <button id="save-options">Save</button>
  `;
});

describe("Options script", () => {
  beforeAll(() => {
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
    loadOptions(); // Call the function after setting up the DOM
    const input = document.getElementById("inactiveThreshold");
    expect(input.value).toBe("60");
  });

  it("should save new options", () => {
    initOptions(); // Manually set up the event listener

    // Set the input value and simulate the button click
    document.getElementById("inactiveThreshold").value = "30";
    document.getElementById("save-options").click();

    // Verify that chrome.storage.sync.set was called with the expected value and any function as the second argument
    expect(chrome.storage.sync.set).toHaveBeenCalledWith(
      expect.objectContaining({ inactiveThreshold: 30 }),
      expect.any(Function)
    );
  });
});