// src/options/options.js

function loadOptions() {
    chrome.storage.sync.get(['inactiveThreshold'], (result) => {
      const input = document.getElementById("inactiveThreshold");
      if (input) {
        input.value = result.inactiveThreshold || 60;
      }
    });
  }
  
  function saveOptions() {
    const threshold = parseInt(document.getElementById("inactiveThreshold").value, 10);
    chrome.storage.sync.set({ inactiveThreshold: threshold }, () => {
      console.log("Options saved.");
      alert("Options saved!");
    });
  }
  
  function initOptions() {
    const saveButton = document.getElementById("save-options");
    if (saveButton) {
      saveButton.addEventListener("click", saveOptions);
    }
  }
  
  // Initialize options when the DOM is ready
  document.addEventListener("DOMContentLoaded", () => {
    loadOptions();
    initOptions();
  });
  
  module.exports = { loadOptions, saveOptions, initOptions };