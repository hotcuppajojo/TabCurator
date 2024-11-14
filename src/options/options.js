// src/options/options.js

function loadOptions() {
  chrome.storage.sync.get("inactiveThreshold", (data) => {
    const input = document.getElementById("inactiveThreshold");
    input.value = data.inactiveThreshold || 0;
  });
}

function saveOptions() {
  console.log('saveOptions called');
  const input = document.getElementById("inactiveThreshold");
  const threshold = parseInt(input.value, 10) || 0; // Convert to number and handle NaN

  chrome.storage.sync.set({ inactiveThreshold: threshold }, () => {
    if (chrome.runtime.lastError) {
      console.error('Error saving options:', chrome.runtime.lastError.message);
    } else {
      console.log('Options saved successfully.');
    }
  });
}


// Initialize options when the DOM is ready
document.addEventListener("DOMContentLoaded", () => {
  loadOptions();
  document.getElementById('save-options').addEventListener('click', saveOptions);
});

// Add global error handlers
window.addEventListener('error', (event) => {
  console.error('Global error:', event.message);
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled promise rejection:', event.reason);
});

export default { loadOptions, saveOptions };