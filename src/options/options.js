// src/options/options.js

/**
 * @fileoverview Options management module for TabCurator extension
 * Handles user preferences, rule configuration, and storage interaction
 * Implements browser-agnostic storage API wrapper for Chrome/Firefox compatibility
 */

/**
 * @param {object} browserInstance - Browser API instance (Chrome or Firefox)
 * @returns {Object} Public API for options management
 */
function initOptions(browserInstance = (typeof browser !== 'undefined' ? browser : chrome)) {
  /**
   * Retrieves and populates option values from browser storage
   * Uses batch storage request for performance optimization
   */
  function loadOptions() {
    browserInstance.storage.sync.get(["inactiveThreshold", "tabLimit"], (data) => {
      const thresholdInput = document.getElementById("inactiveThreshold");
      thresholdInput.value = data.inactiveThreshold || 60;

      const tabLimitInput = document.getElementById("tabLimit");
      tabLimitInput.value = data.tabLimit || 100;
    });
  }

  /**
   * Persists user preferences to browser storage
   * Implements error handling and success feedback with auto-dismiss
   * @fires browser.storage.sync.set
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

  // Initialize event listeners and rule management UI
  document.addEventListener("DOMContentLoaded", () => {
    loadOptions();
    document.getElementById('save-options').addEventListener('click', saveOptions);

    const rulesList = document.getElementById("rulesList");
    const addRuleButton = document.getElementById("addRuleButton");
    const saveRulesButton = document.getElementById("saveRulesButton");

    // Fetch and restore previously saved rules
    // Default to empty array if no rules exist
    browserInstance.storage.sync.get("rules", (data) => {
        const rules = data.rules || [];
        rules.forEach((rule) => addRuleToUI(rule));
    });

    /**
     * Rule creation handler
     * Injects blank rule template for user configuration
     */
    addRuleButton.addEventListener("click", () => {
        addRuleToUI({ condition: "", action: "" });
    });

    /**
     * Rule persistence handler
     * Validates rule completeness before storage
     * Notifies background process of rule updates
     */
    saveRulesButton.addEventListener("click", () => {
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
  });

  /**
   * Creates and injects rule UI components
   * Implements input validation and delete functionality
   * @param {Object} rule - Rule configuration {condition, action}
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
   * Global error handlers for debugging and telemetry
   * Captures uncaught exceptions and promise rejections
   */
  window.addEventListener('error', (event) => {
    console.error('Global error:', event.message);
  });

  window.addEventListener('unhandledrejection', (event) => {
    console.error('Unhandled promise rejection:', event.reason);
  });

  // Public API surface for external interaction
  return { loadOptions, saveOptions };
}

/**
 * Module export configuration
 * Supports both testing environment and browser context
 */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = initOptions;
} else {
  // Initialize options in the browser
  initOptions();
}