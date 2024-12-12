// tests/jest/options.test.js

// Import the mocked browser
const browser = require('webextension-polyfill');

const { initOptions, saveOptions, addRuleToUI, validateInput, saveRules, loadOptions } = require('../../src/options/options');

describe("Options Management", () => {
  let mockStorage;

  beforeEach(() => {
    jest.clearAllMocks();
    console.error = jest.fn();
    
    // Setup mock storage state
    mockStorage = {
      data: {
        inactiveThreshold: 45,
        tabLimit: 75,
        rules: [{ condition: 'test.com', action: 'Tag: Test' }]
      }
    };

    // Setup mock browser APIs
    browser.storage = {
      sync: {
        get: jest.fn().mockImplementation(async (keys) => {
          if (!keys) return mockStorage.data;
          if (Array.isArray(keys) || typeof keys === 'string') {
            const result = {};
            (Array.isArray(keys) ? keys : [keys]).forEach(key => {
              result[key] = mockStorage.data[key];
            });
            return result;
          }
          return mockStorage.data;
        }),
        set: jest.fn().mockImplementation(async (items) => {
          Object.assign(mockStorage.data, items);
          return Promise.resolve();
        })
      }
    };

    browser.runtime = {
      sendMessage: jest.fn().mockResolvedValue(undefined)
    };

    // Setup minimal DOM with default values
    document.body.innerHTML = `
      <input id="inactiveThreshold" type="number">
      <input id="tabLimit" type="number">
      <div id="save-success"></div>
      <button id="addRuleButton"></button>
      <button id="saveRulesButton">Save Rules</button>
      <ul id="rulesList"></ul>
    `;
  });

  afterEach(async () => {
    // Remove jest.clearAllTimers(); as timers are now managed globally
  });

  describe('Options Loading', () => {
    test('should load default values when storage is empty', async () => {
      browser.storage.sync.get.mockResolvedValue({});
      
      await loadOptions();
      
      expect(document.getElementById('inactiveThreshold').value).toBe('60');
      expect(document.getElementById('tabLimit').value).toBe('100');
    });

    test('should load stored values from browser storage', async () => {
      await loadOptions();
      
      expect(document.getElementById('inactiveThreshold').value).toBe('45');
      expect(document.getElementById('tabLimit').value).toBe('75');
    });

    test('should handle storage errors gracefully', async () => {
      const error = new Error('Storage error');
      browser.storage.sync.get.mockRejectedValueOnce(error);
      
      await loadOptions();
      
      expect(console.error).toHaveBeenCalledWith('Error loading options:', error.message);
    });
  });

  describe('Rule Management', () => {
    test('should add new rule to UI', () => {
      addRuleToUI();
      
      const rulesList = document.getElementById('rulesList');
      expect(rulesList.children.length).toBe(1);
      expect(rulesList.children[0].querySelector('.rule-condition')).toBeTruthy();
      expect(rulesList.children[0].querySelector('.rule-action')).toBeTruthy();
    });

    test('should add rule with predefined values', () => {
      const rule = { condition: 'test.com', action: 'Tag: Test' };
      addRuleToUI(rule);
      
      const ruleItem = document.getElementById('rulesList').children[0];
      expect(ruleItem.querySelector('.rule-condition').value).toBe('test.com');
      expect(ruleItem.querySelector('.rule-action').value).toBe('Tag: Test');
    });

    test('should validate and save rules', async () => {
      addRuleToUI({ condition: 'test.com', action: 'Tag: Test' });
      
      await saveRules();
      
      expect(browser.storage.sync.set).toHaveBeenCalledWith({
        rules: [{ condition: 'test.com', action: 'Tag: Test' }]
      });
      expect(browser.runtime.sendMessage).toHaveBeenCalledWith({
        action: 'updateRules',
        rules: [{ condition: 'test.com', action: 'Tag: Test' }]
      });
    });

    test('should handle invalid rules', async () => {
      addRuleToUI({ condition: '', action: '' });
      
      await saveRules();
      
      const ruleInputs = document.querySelectorAll('.rule-item input');
      ruleInputs.forEach(input => {
        expect(input.classList.contains('invalid')).toBe(true);
      });
      expect(browser.storage.sync.set).not.toHaveBeenCalled();
    });
  });

  describe('Options Saving', () => {
    test('should save valid options', async () => {
      document.getElementById('inactiveThreshold').value = '45';
      document.getElementById('tabLimit').value = '75';
      
      await saveOptions();
      
      expect(browser.storage.sync.set).toHaveBeenCalledWith({
        inactiveThreshold: 45,
        tabLimit: 75
      });
      expect(document.getElementById('save-success').classList.contains('visible')).toBe(true);
    });

    test('should handle save errors', async () => {
      const error = new Error('Save failed');
      browser.storage.sync.set.mockRejectedValueOnce(error);
      
      await saveOptions();
      
      expect(console.error).toHaveBeenCalledWith('Error saving options:', error.message);
    });
  });

  describe('Input Validation', () => {
    test('should mark empty inputs as invalid', () => {
      const input = document.createElement('input');
      input.value = '';
      
      // Add a parent element to the input
      const parent = document.createElement('div');
      parent.appendChild(input);
      document.body.appendChild(parent);
      
      validateInput(input);
      
      expect(input.classList.contains('invalid')).toBe(true);
      expect(input.parentNode.querySelector('.error-message')).toBeTruthy();
    });

    test('should mark valid inputs as valid', () => {
      const input = document.createElement('input');
      input.value = 'test';
      input.classList.add('invalid');
      
      // Add a parent element to the input
      const parent = document.createElement('div');
      parent.appendChild(input);
      document.body.appendChild(parent);
      
      validateInput(input);
      
      expect(input.classList.contains('invalid')).toBe(false);
    });
  });
});