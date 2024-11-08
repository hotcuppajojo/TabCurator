// src/options/options.js

function loadOptions() {
  chrome.storage.sync.get('inactiveThreshold', (data) => {
    document.getElementById('inactiveThreshold').value = data.inactiveThreshold || 60;
    if (chrome.runtime.lastError) {
      console.error('Error loading options:', chrome.runtime.lastError.message);
    }
  });
}

function saveOptions() {
  console.log('saveOptions called');
  const inactiveThreshold = document.getElementById('inactiveThreshold').value;
  chrome.storage.sync.set({ inactiveThreshold }, () => {
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