// tests/background.test.js

describe("Background script", () => {
    beforeAll(() => {
      global.chrome = {
        tabs: {
          onCreated: { addListener: jest.fn() },
          onUpdated: { addListener: jest.fn() }
        },
        alarms: {
          create: jest.fn(),
          onAlarm: { addListener: jest.fn() }
        }
      };
    });
  
    it("should add listeners for tab events", () => {
      require("../src/background/background.js");
      expect(chrome.tabs.onCreated.addListener).toHaveBeenCalled();
      expect(chrome.tabs.onUpdated.addListener).toHaveBeenCalled();
    });
  
    it("should set up an alarm for dormant tabs", () => {
      require("../src/background/background.js");
      expect(chrome.alarms.create).toHaveBeenCalledWith("checkDormantTabs", { periodInMinutes: 60 });
    });
  });