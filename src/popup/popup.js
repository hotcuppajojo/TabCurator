// src/popup/popup.js

// Factory function pattern provides scoped instance and browser compatibility wrapper
// Allows for dependency injection of browser API for testing
function initPopup(browserInstance = (typeof browser !== 'undefined' ? browser : chrome)) {
  // Renders current tab state in popup UI
  // Uses query API to fetch all tabs and dynamically builds list elements
  function loadTabs() {
    // Query with empty filter returns all tabs in current window
    browserInstance.tabs.query({}, (tabs) => {
      const tabList = document.getElementById('tab-list');
      if (!tabList) {
        console.error('Tab list element not found');
        return;
      }
      
      // Clear and rebuild tab list for current state
      tabList.innerHTML = '';
      // Direct DOM manipulation preferred over innerHTML for XSS prevention
      tabs.forEach(tab => {
        const tabItem = document.createElement('div');
        tabItem.textContent = tab.title;
        tabList.appendChild(tabItem);
      });
    });
  }

  // Implements manual tab suspension feature
  // Uses message passing to communicate with background script
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
            loadTabs(); // Refresh the tab list after suspension
          }
        });
      });
    } else {
      console.error('Suspend button not found');
    }
  }

  // Manages workflow for tagging tabs when limit reached
  // Implements async storage access and tab state management
  function setupTaggingPrompt() {
    const taggingPrompt = document.getElementById('tagging-prompt');
    const tagButton = document.getElementById('tag-oldest-tab');
  
    if (tagButton) {
      tagButton.addEventListener('click', async () => {
        // Wraps callback-based storage API in Promise for cleaner async flow
        const data = await new Promise((resolve) => {
          browserInstance.storage.local.get('oldestTabId', (result) => {
            resolve(result);
          });
        });
  
        const { oldestTabId } = data;
  
        if (oldestTabId) {
          // Retrieves full tab data for tagging operation
          browserInstance.tabs.get(oldestTabId, (tab) => {
            // Guard clause pattern for error handling
            if (browserInstance.runtime.lastError || !tab) {
              console.error('Failed to retrieve the oldest tab:', browserInstance.runtime.lastError);
              alert('Failed to tag the oldest tab. Please try again.');
              return;
            }
  
            // Visual tag prefix helps users identify managed tabs
            const newTitle = `[Tagged] ${tab.title}`;
  
            // Updates tab title and maintains extension state
            browserInstance.tabs.update(oldestTabId, { title: newTitle }, () => {
              // Nested error handling for tab update operation
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
                loadTabs(); // Refresh the tab list after tagging
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

  // Message handler for background script communication
  // Implements observer pattern for UI updates
  browserInstance.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'promptTagging') {
      document.getElementById('tagging-prompt').style.display = 'block';
      sendResponse({ message: 'Tagging prompt displayed.' }); // Acknowledge the message
    }
  });

  // Global error handlers for debugging and testing support
  // Captures both synchronous and Promise-based errors
  window.addEventListener('error', (event) => {
    const errorData = { error: event.message };
    if (window.setTestData) {
      window.setTestData(errorData);
    }
    console.error('Error:', event.message);
  });

  window.addEventListener('unhandledrejection', (event) => {
    const rejectionData = { reason: event.reason };
    if (window.setTestData) {
      window.setTestData(rejectionData);
    }
    console.error('Unhandled Rejection:', event.reason);
  });

  // Main initialization routine
  // Ensures DOM is ready before setting up event handlers
  document.addEventListener('DOMContentLoaded', () => {
    // Initialize core tab management features
    setupSuspendButton();
    loadTabs();
    setupTaggingPrompt();

    // Tab archiving implementation
    // Provides tag-based organization of tabs
    document.getElementById("archiveTabButton").addEventListener("click", () => {
        const selectedTag = document.getElementById("tagInput").value;
        const tabId = parseInt(document.getElementById("currentTabId").value);

        if (selectedTag && tabId) {
            // Add data-tag attribute to the archived tab element
            chrome.runtime.sendMessage(
                { action: "archiveTab", tabId, tag: selectedTag },
                () => {
                    alert("Tab archived successfully!");
                    loadTabs(); // Refresh the tab list after archiving
                    window.close();
                }
            );
        } else {
            alert("Please select a tag and tab to archive.");
        }
    });

    // Archive viewing implementation
    // Renders archived tabs grouped by tags
    document.getElementById("viewArchivesButton").addEventListener("click", () => {
        chrome.runtime.sendMessage({ action: "getArchivedTabs" }, (response) => {
            const archiveContainer = document.getElementById("archiveList");
            archiveContainer.innerHTML = ""; // Clear existing content
            Object.entries(response.archivedTabs).forEach(([tag, tabs]) => {
                const tagHeader = document.createElement("h4");
                tagHeader.textContent = `Tag: ${tag}`;
                archiveContainer.appendChild(tagHeader);
                tabs.forEach((tab) => {
                    const link = document.createElement("a");
                    link.href = tab.url;
                    link.target = "_blank";
                    link.textContent = tab.title;
                    archiveContainer.appendChild(link);
                    archiveContainer.appendChild(document.createElement("br"));
                });
            });
        });
    });

    // Session management implementation
    // Enables workspace state preservation
    document.getElementById("saveSessionButton").addEventListener("click", () => {
        const sessionName = prompt("Enter a name for this session:");
        if (sessionName) {
            chrome.runtime.sendMessage({ action: "saveSession", sessionName });
        }
    });

    // Session restoration implementation
    // Provides workspace state recovery
    document.getElementById("viewSessionsButton").addEventListener("click", () => {
        chrome.runtime.sendMessage({ action: "getSessions" }, (response) => {
            const sessionsContainer = document.getElementById("sessionsList");
            sessionsContainer.innerHTML = ""; // Clear existing content
            Object.keys(response.sessions).forEach((sessionName) => {
                const sessionButton = document.createElement("button");
                sessionButton.textContent = sessionName;
                sessionButton.addEventListener("click", () => {
                    chrome.runtime.sendMessage({ action: "restoreSession", sessionName });
                });
                sessionsContainer.appendChild(sessionButton);
            });
        });
    });
  });

  // Expose core functionality for testing and external access
  return { loadTabs, setupSuspendButton, setupTaggingPrompt };
}

// Module system compatibility wrapper
// Supports both CommonJS and direct browser usage
if (typeof module !== 'undefined' && module.exports) {
  module.exports = initPopup;
} else {
  window.addEventListener('DOMContentLoaded', () => {
    window.popupInstance = initPopup(window.browser || chrome);
  });
}