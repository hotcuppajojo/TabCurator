// src/popup/popup.js

// Browser compatibility wrapper for unified extension API access across browsers
function initPopup(browserInstance = (typeof browser !== 'undefined' ? browser : chrome)) {
  // Fetch and display all tabs to provide user overview
  function loadTabs() {
    browserInstance.tabs.query({}, (tabs) => {
      const tabList = document.getElementById('tab-list');
      if (!tabList) {
        console.error('Tab list element not found');
        return;
      }
      
      tabList.innerHTML = '';
      tabs.forEach(tab => {
        const tabItem = document.createElement('div');
        tabItem.textContent = tab.title;
        tabList.appendChild(tabItem);
      });
    });
  }

  // Enable manual tab suspension to reduce memory usage
  function setupSuspendButton() {
    const suspendButton = document.getElementById('suspend-inactive-tabs');
    if (suspendButton) {
      console.log('Attaching click event to suspend button');
      suspendButton.addEventListener('click', () => {
        console.log('Suspend button clicked');
        const message = { action: 'suspendInactiveTabs' };

        browserInstance.runtime.sendMessage(message, (response) => {
          if (browserInstance.runtime.lastError) {
            console.error('Error:', browserInstance.runtime.lastError.message);
            // Handle the error as needed
          } else {
            console.log('Suspend inactive tabs successful:', response);
          }
        });
      });
    } else {
      console.error('Suspend button not found');
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
                if (window.setTestData) {
                  window.setTestData({ type: 'TAG_ADDED', tabId: oldestTabId });
                }
              }
            });
          });
        } else {
          console.warn('No oldestTabId found.');
          alert('No oldest tab to tag.');
          taggingPrompt.style.display = 'none';
          if (window.setTestData) {
            window.setTestData({ type: 'NO_OLDEST_TAB' });
          }
        }
      });
    }
  }

  // Listen for background script tagging requests
  browserInstance.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'promptTagging') {
      document.getElementById('tagging-prompt').style.display = 'block';
      sendResponse({ message: 'Tagging prompt displayed.' }); // Acknowledge the message
    }
  });

  // Add global error handler
  window.addEventListener('error', (event) => {
    const errorData = { error: event.message };
    if (window.setTestData) {
      window.setTestData(errorData);
    }
    console.error('Error:', event.message);
  });

  // Add global unhandledrejection handler
  window.addEventListener('unhandledrejection', (event) => {
    const rejectionData = { reason: event.reason };
    if (window.setTestData) {
      window.setTestData(rejectionData);
    }
    console.error('Unhandled Rejection:', event.reason);
  });

  // Initialize components after DOM load to ensure element availability
  document.addEventListener('DOMContentLoaded', () => {
    setupSuspendButton();
    loadTabs();
    setupTaggingPrompt();
  });

  return { loadTabs, setupSuspendButton, setupTaggingPrompt };
}

// Support both module exports and global initialization
if (typeof module !== 'undefined' && module.exports) {
  module.exports = initPopup;
} else {
  // Auto-initialize when loaded as script
  window.addEventListener('DOMContentLoaded', () => {
    window.popupInstance = initPopup(window.browser || chrome);
  });
}