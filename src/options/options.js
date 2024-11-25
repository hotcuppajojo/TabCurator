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
if (typeof module !== 'undefined' && module.exports) {
  module.exports = initOptions;
} else {
  // Initialize options in the browser
  initOptions();
}