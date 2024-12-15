// src/options/options.js
/**
 * @fileoverview Options management module for TabCurator extension.
 * Handles user preferences, rule configuration, and validation.
 * Provides browser-agnostic storage operations for cross-browser compatibility.
 */

/**
 * Loads user preferences from browser storage.
 * Provides fallback values and populates the UI.
 */
async function loadOptions() {
  try {
    const items = await browser.storage.sync.get(['inactiveThreshold', 'tabLimit', 'rules']);
    const inactiveThreshold = items.inactiveThreshold ?? 60;  // Use nullish coalescing
    const tabLimit = items.tabLimit ?? 100;  // Use nullish coalescing
    
    document.getElementById('inactiveThreshold').value = inactiveThreshold;
    document.getElementById('tabLimit').value = tabLimit;

    // Load rules into the UI
    const rules = items.rules || [];
    rules.forEach(addRuleToUI);
  } catch (error) {
    console.error('Error loading options:', error.message);
  }
}

/**
 * Saves user preferences to browser storage.
 * Displays feedback on success or failure.
 */
async function saveOptions() {
  try {
    const inactiveThreshold = parseInt(document.getElementById('inactiveThreshold').value, 10);
    const tabLimit = parseInt(document.getElementById('tabLimit').value, 10);

    await browser.storage.sync.set({ inactiveThreshold, tabLimit });

    document.getElementById('save-success').classList.add('visible');

    setTimeout(() => {
      document.getElementById('save-success').classList.remove('visible');
    }, 2000);
  } catch (error) {
    console.error('Error saving options:', error.message);
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
  const isEmpty = !input.value.trim();
  
  // Remove any existing error message
  const existingError = input.parentNode.querySelector('.error-message');
  if (existingError) {
    existingError.remove();
  }

  if (isEmpty) {
    input.classList.add('invalid');
    const errorSpan = document.createElement('span');
    errorSpan.className = 'error-message';
    errorSpan.textContent = 'This field is required.';
    input.parentNode.appendChild(errorSpan);
  } else {
    input.classList.remove('invalid');
  }

  return !isEmpty;
}

/**
 * Saves all rules to browser storage.
 * Validates rules before saving and notifies the background script.
 */
async function saveRules() {
  try {
    const ruleInputs = Array.from(document.querySelectorAll('.rule-item'));
    let hasErrors = false;

    const rules = ruleInputs.map(ruleItem => {
      const condition = ruleItem.querySelector('.rule-condition');
      const action = ruleItem.querySelector('.rule-action');
      
      const isConditionValid = validateInput(condition);
      const isActionValid = validateInput(action);
      
      if (!isConditionValid || !isActionValid) {
        hasErrors = true;
      }

      return {
        condition: condition.value.trim(),
        action: action.value.trim()
      };
    });

    if (hasErrors) {
      throw new Error('Invalid rule');
    }

    await browser.storage.sync.set({ rules });
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