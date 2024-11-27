// src/content/content.js

console.log("TabCurator content script injected on this page.");

// Track user interactions to update activity status
let lastActivity = Date.now();

function updateActivity() {
  lastActivity = Date.now();
  browser.runtime.sendMessage({ action: 'updateActivity', timestamp: lastActivity });
}

window.addEventListener('mousemove', updateActivity);
window.addEventListener('keydown', updateActivity);
window.addEventListener('scroll', updateActivity);

// Inform background.js of initial activity
browser.runtime.sendMessage({ action: 'updateActivity', timestamp: lastActivity });