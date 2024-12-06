// src/options/options.js
/**
 * @fileoverview Options management module for TabCurator extension.
 * Handles user preferences, rule configuration, and validation.
 * Provides browser-agnostic storage operations for cross-browser compatibility.
 */
import browser from 'webextension-polyfill';

/**
 * Loads user preferences from browser storage.
 * Provides fallback values and populates the UI.
 */
async function loadOptions() {
  try {
    const { inactiveThreshold = 60, tabLimit = 100 } = await browser.storage.sync.get(['inactiveThreshold', 'tabLimit']);
    const thresholdInput = document.getElementById('inactiveThreshold');
    const tabLimitInput = document.getElementById('tabLimit');

    if (thresholdInput) thresholdInput.value = inactiveThreshold;
    if (tabLimitInput) tabLimitInput.value = tabLimit;
  } catch (error) {
    console.error('Error loading options:', error.message);
    alert('Failed to load options.');
  }
}

/**
 * Saves user preferences to browser storage.
 * Displays feedback on success or failure.
 */
async function saveOptions() {
  const thresholdInput = document.getElementById('inactiveThreshold');
  const tabLimitInput = document.getElementById('tabLimit');
  const successMsg = document.getElementById('save-success');

  const inactiveThreshold = parseInt(thresholdInput.value, 10) || 60;
  const tabLimit = parseInt(tabLimitInput.value, 10) || 100;

  try {
    await browser.storage.sync.set({ inactiveThreshold, tabLimit });

    if (successMsg) {
      successMsg.classList.add('visible');
      setTimeout(() => successMsg.classList.remove('visible'), 2000);
    }
  } catch (error) {
    console.error('Error saving options:', error.message);
    alert('Failed to save options. Please try again.');
  }
}

/**
 * Adds a new rule to the UI and storage.
 * @param {Object} rule - A rule object with `condition` and `action` properties.
 */
function addRuleToUI(rule = { condition: '', action: '' }) {
  const rulesList = document.getElementById('rulesList');
  if (!rulesList) return;

  const ruleItem = document.createElement('div');
  ruleItem.className = 'rule-item';

  const conditionInput = document.createElement('input');
  conditionInput.type = 'text';
  conditionInput.className = 'rule-condition';
  conditionInput.placeholder = 'Condition (e.g., "example.com")';
  conditionInput.value = rule.condition;
  conditionInput.setAttribute('aria-label', 'Rule Condition');

  const actionInput = document.createElement('input');
  actionInput.type = 'text';
  actionInput.className = 'rule-action';
  actionInput.placeholder = 'Action (e.g., "Tag: Research")';
  actionInput.value = rule.action;
  actionInput.setAttribute('aria-label', 'Rule Action');

  const deleteButton = document.createElement('button');
  deleteButton.textContent = 'Delete';
  deleteButton.setAttribute('aria-label', 'Delete Rule');
  deleteButton.addEventListener('click', () => {
    if (confirm('Are you sure you want to delete this rule?')) {
      rulesList.removeChild(ruleItem);
    }
  });

  ruleItem.append(conditionInput, actionInput, deleteButton);
  rulesList.appendChild(ruleItem);

  // Add real-time validation
  conditionInput.addEventListener('input', () => validateInput(conditionInput));
  actionInput.addEventListener('input', () => validateInput(actionInput));
}

/**
 * Validates an input field and adds or removes an 'invalid' class.
 * @param {HTMLElement} input - The input field to validate.
 */
function validateInput(input) {
  if (input.value.trim()) {
    input.classList.remove('invalid');
  } else {
    input.classList.add('invalid');
    const errorSpan = document.createElement('span');
    errorSpan.className = 'error-message';
    errorSpan.textContent = 'This field is required.';
    if (!input.parentNode.querySelector('.error-message')) {
      input.parentNode.appendChild(errorSpan);
    }
  }
}

/**
 * Saves all rules to browser storage.
 * Validates rules before saving and notifies the background script.
 */
async function saveRules() {
  const rules = [];
  let isValid = true;

  document.querySelectorAll('.rule-item').forEach((item) => {
    const condition = item.querySelector('.rule-condition').value.trim();
    const action = item.querySelector('.rule-action').value.trim();

    if (condition && action) {
      rules.push({ condition, action });
    } else {
      isValid = false;
      validateInput(item.querySelector('.rule-condition'));
      validateInput(item.querySelector('.rule-action'));
    }
  });

  if (!isValid) {
    alert('Please fill out all rule fields.');
    return;
  }

  try {
    await browser.storage.sync.set({ rules });
    alert('Rules saved successfully!');
    await browser.runtime.sendMessage({ action: 'updateRules', rules });
  } catch (error) {
    console.error('Error saving rules:', error.message);
  }
}

/**
 * Initializes the options management system.
 * Loads preferences, sets up event listeners, and manages rule configurations.
 */
function initOptions() {
  /**
   * Loads existing rules from storage and populates the UI.
   */
  async function loadRules() {
    try {
      const { rules = [] } = await browser.storage.sync.get('rules');
      rules.forEach((rule) => addRuleToUI(rule));
    } catch (error) {
      console.error('Error loading rules:', error.message);
    }
  }

  /**
   * Attaches event listeners to UI components.
   */
  function setupEventListeners() {
    document.getElementById('save-options')?.addEventListener('click', saveOptions);
    document.getElementById('addRuleButton')?.addEventListener('click', () => addRuleToUI());
    document.getElementById('saveRulesButton')?.addEventListener('click', saveRules);
  }

  async function init() {
    await loadOptions();
    await loadRules();
    setupEventListeners();
  }

  init();
}

// Export for testing or initialize for browser
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    initOptions,
    loadOptions,
    saveOptions,
    addRuleToUI,
    validateInput,
    saveRules
  };
} else {
  document.addEventListener('DOMContentLoaded', initOptions);
}