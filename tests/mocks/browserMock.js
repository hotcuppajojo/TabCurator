
// ...existing code...

const alarmsOnAlarmListeners = [];

const browserMock = {
  // ...other mocks...

  alarms: {
    onAlarm: {
      addListener: jest.fn((listener) => {
        alarmsOnAlarmListeners.push(listener);
      }),
      removeListener: jest.fn((listener) => {
        const index = alarmsOnAlarmListeners.indexOf(listener);
        if (index > -1) {
          alarmsOnAlarmListeners.splice(index, 1);
        }
      }),
      // Add the trigger method to simulate alarm events
      trigger: jest.fn((alarm) => {
        alarmsOnAlarmListeners.forEach((listener) => listener(alarm));
      }),
    },
    create: jest.fn(),
    clearAll: jest.fn(),
    updateDynamicRules: jest.fn().mockResolvedValue(),
  },

  // ...other mocks...
};

module.exports = browserMock;