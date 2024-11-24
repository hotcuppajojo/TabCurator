// src/options/options.js

// Browser API abstraction for cross-browser extension support
function initOptions(browserInstance = (typeof browser !== 'undefined' ? browser : chrome)) {
  function loadOptions() {
    // Batch storage request for performance optimization
    browserInstance.storage.sync.get(["inactiveThreshold", "tabLimit"], (data) => {
      const thresholdInput = document.getElementById("inactiveThreshold");
      thresholdInput.value = data.inactiveThreshold || 60;

      const tabLimitInput = document.getElementById("tabLimit");
      tabLimitInput.value = data.tabLimit || 100;
    });
  }

  function saveOptions() {
    console.log('saveOptions called');
    const thresholdInput = document.getElementById("inactiveThreshold");
    const tabLimitInput = document.getElementById("tabLimit");

    // Fallback values prevent extension crashes from invalid input
    const threshold = parseInt(thresholdInput.value, 10) || 60; // Default to 60 minutes
    const tabLimit = parseInt(tabLimitInput.value, 10) || 100; // Default to 100 tabs

    // Sync storage enables multi-device settings persistence
    browserInstance.storage.sync.set({ inactiveThreshold: threshold, tabLimit: tabLimit }, () => {
      // Runtime error handling for robustness
      if (browserInstance.runtime.lastError) {
        console.error('Error saving options:', browserInstance.runtime.lastError.message);
        alert('Failed to save options. Please try again.');
      } else {
        console.log('Options saved successfully.');
        alert('Options saved successfully.');
      }
    });
  }

  // Defer initialization until DOM ensures element availability
  document.addEventListener("DOMContentLoaded", () => {
    loadOptions();
    document.getElementById('save-options').addEventListener('click', saveOptions);
  });

  // Global error capture for debugging and telemetry
  window.addEventListener('error', (event) => {
    console.error('Global error:', event.message);
  });

  window.addEventListener('unhandledrejection', (event) => {
    console.error('Unhandled promise rejection:', event.reason);
  });

  // Expose API for testing and external access
  return { loadOptions, saveOptions };
}

// Enable module usage in test environment
module.exports = initOptions;