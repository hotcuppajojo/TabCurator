// src/popup/popup.js

// Browser compatibility wrapper for unified extension API access across browsers
function initPopup(browserInstance = (typeof browser !== 'undefined' ? browser : chrome)) {
  // Fetch and display all tabs to provide user overview
  function loadTabs() {
    browserInstance.tabs.query({}, (tabs) => {
      const tabList = document.getElementById('tab-list');
      if (tabList) {
        // Reset list to prevent duplicate entries on refresh
        tabList.innerHTML = '';
        tabs.forEach(tab => {
          // Simple div elements for performance in large tab sets
          const tabItem = document.createElement('div');
          tabItem.textContent = tab.title;
          tabList.appendChild(tabItem);
        });
      }
    });
  }

  // Enable manual tab suspension to reduce memory usage
  function setupSuspendButton() {
    const suspendButton = document.getElementById('suspend-inactive-tabs');
    if (suspendButton) {
      suspendButton.addEventListener('click', () => {
        // Delegate suspension logic to background script for persistence
        browserInstance.runtime.sendMessage({ action: 'suspendInactiveTabs' }, (response) => {
          // Surface runtime errors to aid debugging
          if (browserInstance.runtime.lastError) {
            console.error('Error:', browserInstance.runtime.lastError.message);
          } else {
            console.log(response.message);
          }
        });
      });
    }
  }

  // Handle tab tagging workflow when tab limit is reached
  function setupTaggingPrompt() {
    const taggingPrompt = document.getElementById('tagging-prompt');
    const tagButton = document.getElementById('tag-oldest-tab');
  
    if (tagButton) {
      tagButton.addEventListener('click', async () => {
        // Promise wrapper simplifies async storage access
        const data = await new Promise((resolve) => {
          browserInstance.storage.local.get('oldestTabId', (result) => {
            resolve(result);
          });
        });
  
        const { oldestTabId } = data;
  
        if (oldestTabId) {
          browserInstance.tabs.get(oldestTabId, (tab) => {
            // Early returns reduce nesting and improve error handling clarity
            if (browserInstance.runtime.lastError || !tab) {
              console.error('Failed to retrieve the oldest tab:', browserInstance.runtime.lastError);
              alert('Failed to tag the oldest tab. Please try again.');
              return;
            }
  
            // Visual prefix helps users identify tagged tabs
            const newTitle = `[Tagged] ${tab.title}`;
  
            browserInstance.tabs.update(oldestTabId, { title: newTitle }, () => {
              if (browserInstance.runtime.lastError) {
                console.error('Failed to tag the oldest tab:', browserInstance.runtime.lastError.message);
                alert('Failed to tag the oldest tab. Please try again.');
              } else {
                console.log(`Tab ${oldestTabId} tagged successfully.`);
                // Notify background script to maintain state consistency
                browserInstance.runtime.sendMessage({ action: 'tagAdded', tabId: oldestTabId }, (response) => {
                  if (browserInstance.runtime.lastError) {
                    console.error('Error sending tagAdded message:', browserInstance.runtime.lastError.message);
                  } else {
                    console.log(response.message);
                  }
                });
  
                // Hide prompt after successful tagging
                taggingPrompt.style.display = 'none';
              }
            });
          });
        } else {
          console.warn('No oldestTabId found.');
          alert('No oldest tab to tag.');
          taggingPrompt.style.display = 'none';
        }
      });
    }
  }

// Listen for background script tagging requests
browserInstance.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'promptTagging') {
    document.getElementById('tagging-prompt').style.display = 'block';
  }
});

// Initialize components after DOM load to ensure element availability
document.addEventListener('DOMContentLoaded', () => {
  setupSuspendButton();
  loadTabs();
  setupTaggingPrompt();
});

return { loadTabs, setupSuspendButton, setupTaggingPrompt };
}

module.exports = initPopup;