// tests/popup.test.js

beforeEach(() => {
    document.body.innerHTML = `
      <button id="suspend-inactive-tabs">Suspend Inactive Tabs</button>
      <div id="tab-list"></div>
    `;
  });
  
  const { loadTabs } = require("../src/popup/popup");
  
  describe("Popup script", () => {
    beforeAll(() => {
      global.chrome = {
        runtime: {
          sendMessage: jest.fn((message, callback) => callback({ message: "Suspended tabs" }))
        },
        tabs: {
          query: jest.fn((_, callback) => callback([{ title: "Tab 1" }, { title: "Tab 2" }]))
        }
      };
    });
  
    it("should load tabs into the popup", () => {
      loadTabs();
  
      const tabList = document.getElementById("tab-list");
      expect(tabList.children.length).toBe(2);
      expect(tabList.children[0].textContent).toBe("Tab 1");
      expect(tabList.children[1].textContent).toBe("Tab 2");
    });
  
    it("should handle click event for suspend button", () => {
      document.dispatchEvent(new Event("DOMContentLoaded"));
      const suspendButton = document.getElementById("suspend-inactive-tabs");
      suspendButton.click();
  
      expect(global.chrome.runtime.sendMessage).toHaveBeenCalledWith(
        { action: "suspendInactiveTabs" },
        expect.any(Function)
      );
    });
  });