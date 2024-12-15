// popup/test-helpers.js
import browser from 'webextension-polyfill';

(function() {
    // Define test helpers on the global window object
    window.testHelpers = {
      resetMocks: () => {
        console.log('Resetting mocks...');
        if (!window.testHelpers.originalSendMessage) {
          window.testHelpers.originalSendMessage = window.browser.runtime.sendMessage;
        }
  
        window.browser.runtime.sendMessage = async (message) => {
          window.browser.runtime.sendMessage.mock.calls.push(message);
          console.log('Mock sendMessage called with:', message);
          if (window.browser.runtime.sendMessage.shouldFail) {
            window.browser.runtime.lastError = { message: 'Simulated error' };
            throw new Error('Simulated error');
          }
          return window.testHelpers.originalSendMessage(message);
        };
  
        window.browser.runtime.sendMessage.mock = {
          calls: [],
          shouldFail: false
        };
        window.browser.runtime.sendMessage.shouldFail = false;
        window.browser.runtime.sendMessage.mock.calls = [];
  
        console.log('Mocks have been reset.');
      },
      getSendMessageCalls: () => {
        console.log('SendMessage calls:', window.browser.runtime.sendMessage.mock?.calls);
        return window.browser.runtime.sendMessage.mock?.calls;
      },
      getLastError: () => {
        const error = window.browser.runtime.sendMessage.mock.shouldFail ? 'Simulated error' : null;
        console.log('Last error:', error);
        return error;
      }
    };
  
    // Log to confirm testHelpers is attached
    console.log('window.testHelpers:', window.testHelpers);
})();