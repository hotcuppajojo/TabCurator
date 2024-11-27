// src/options/options.js

/**
 * @fileoverview Options management module for TabCurator extension
 * Implements configuration interface and storage management
 * Provides browser-agnostic storage operations for Chrome/Firefox compatibility
 * Handles user preferences, rule configuration, and real-time validation
 */

/**
 * Initializes options management system with browser API abstraction
 * Implements storage sync and UI event handling
 * @param {object} browserInstance - Browser API instance for cross-browser support
 * @returns {Object} Public API for options management operations
 */
function initOptions(browserInstance = (typeof browser !== 'undefined' ? browser : chrome)) {
  /**
   * Loads user preferences from browser storage
   * Implements batch retrieval for performance optimization
   * Handles fallback to default values
   */
  function loadOptions() {
    browserInstance.storage.sync.get(["inactiveThreshold", "tabLimit"], (data) => {
      if (browserInstance.runtime.lastError) {
        console.error('Error loading options:', browserInstance.runtime.lastError.message);
        alert('Failed to load options.');
        return;
      }
      
      const thresholdInput = document.getElementById("inactiveThreshold");
      const tabLimitInput = document.getElementById("tabLimit");
      
      if (thresholdInput && tabLimitInput) {
        thresholdInput.value = data.inactiveThreshold || 60;
        tabLimitInput.value = data.tabLimit || 100;
      }
    });
  }

  /**
   * Persists user preferences to synchronized storage
   * Implements visual feedback with auto-dismiss
   * Maintains data integrity with type conversion
   */
  function saveOptions() {
    const thresholdInput = document.getElementById("inactiveThreshold");
    const tabLimitInput = document.getElementById("tabLimit");
    const successMsg = document.getElementById('save-success');

    const threshold = parseInt(thresholdInput.value, 10) || 60;
    const tabLimit = parseInt(tabLimitInput.value, 10) || 100;

    browserInstance.storage.sync.set(
      { inactiveThreshold: threshold, tabLimit: tabLimit },
      () => {
        if (browserInstance.runtime.lastError) {
          console.error('Error saving options:', browserInstance.runtime.lastError.message);
          alert('Failed to save options. Please try again.');
        } else {
          if (successMsg) {
            // Show message immediately
            successMsg.classList.add('visible');
            
            // Remove after delay
            setTimeout(() => {
              successMsg.classList.remove('visible');
            }, 2000);
          }
        }
      }
    );
  }

  // Configure core event listeners immediately for responsive UI
  loadOptions();
  document.getElementById('save-options').addEventListener('click', saveOptions);

  // Initialize rule management interface components
  const rulesList = document.getElementById("rulesList");
  const addRuleButton = document.getElementById("addRuleButton");
  const saveRulesButton = document.getElementById("saveRulesButton");

  // Configure rule management event handlers
  addRuleButton?.addEventListener("click", () => {
    addRuleToUI({ condition: "", action: "" });
  });

  /**
   * Processes and persists rule configuration updates
   * Implements validation and background service notification
   */
  saveRulesButton?.addEventListener("click", () => {
    const rules = [];
    let isValid = true;
    
    document.querySelectorAll(".rule-item").forEach((item) => {
        const condition = item.querySelector(".rule-condition").value.trim();
        const action = item.querySelector(".rule-action").value.trim();
        
        if (condition && action) {
            rules.push({ condition, action });
        } else {
            isValid = false;
            item.querySelector(".rule-condition").classList.add('invalid');
            item.querySelector(".rule-action").classList.add('invalid');
        }
    });
    
    if (!isValid) {
        alert("Please fill out all rule fields.");
        return;
    }
    
    browserInstance.storage.sync.set({ rules }, () => {
        alert("Rules saved successfully!");
        // Notify background.js about the updated rules
        browserInstance.runtime.sendMessage({ action: "updateRules", rules }, (response) => {
            if (browserInstance.runtime.lastError) {
                console.error('Error sending updated rules:', browserInstance.runtime.lastError.message);
            } else {
                console.log(response.message);
            }
        });
    });
  });

  /**
   * Creates rule configuration UI components
   * Implements real-time validation and deletion controls
   * @param {Object} rule - Rule definition with condition and action
   */
  function addRuleToUI(rule) {
    // Create container for rule components
    const ruleItem = document.createElement("div");
    ruleItem.className = "rule-item";

    // Condition input with URL pattern matching
    const conditionInput = document.createElement("input");
    conditionInput.type = "text";
    conditionInput.className = "rule-condition";
    conditionInput.placeholder = "Condition (e.g., 'example.com')";
    conditionInput.value = rule.condition;

    // Action input for rule behavior definition
    const actionInput = document.createElement("input");
    actionInput.type = "text";
    actionInput.className = "rule-action";
    actionInput.placeholder = "Action (e.g., 'Tag: Research')";
    actionInput.value = rule.action;

    // Rule removal control
    const deleteButton = document.createElement("button");
    deleteButton.textContent = "Delete";
    deleteButton.addEventListener("click", () => ruleItem.remove());

    // Compose rule component hierarchy
    ruleItem.appendChild(conditionInput);
    ruleItem.appendChild(actionInput);
    ruleItem.appendChild(deleteButton);

    document.getElementById("rulesList").appendChild(ruleItem);
    
    /**
     * Real-time validation handlers
     * Provides immediate feedback on input validity
     */
    conditionInput.addEventListener('input', () => {
      if (!conditionInput.value.trim()) {
        conditionInput.classList.add('invalid');
      } else {
        conditionInput.classList.remove('invalid');
      }
    });
    
    actionInput.addEventListener('input', () => {
      if (!actionInput.value.trim()) {
        actionInput.classList.add('invalid');
      } else {
        actionInput.classList.remove('invalid');
      }
    });
  }

  /**
   * Global error boundary implementation
   * Captures uncaught exceptions for monitoring
   */
  window.addEventListener('error', (event) => {
    console.error('Global error:', event.message);
  });

  /**
   * Promise rejection handler for async operations
   * Implements centralized error logging
   */
  window.addEventListener('unhandledrejection', (event) => {
    console.error('Unhandled promise rejection:', event.reason);
  });

  // Expose public interface for external integration
  return { loadOptions, saveOptions };
}

/**
 * Module export configuration
 * Implements conditional initialization for test/browser environments
 */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = initOptions;
} else {
  // Initialize options in the browser
  initOptions();
}