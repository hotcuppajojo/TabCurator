// src/popup/popup.js

/**
 * @fileoverview Popup UI controller module for TabCurator extension
 * Implements user interface interactions and tab management operations
 * Provides browser-agnostic implementation for Chrome/Firefox compatibility
 * Manages tab display, actions, and event handling for extension popup
 */

function initPopup(browserInstance = (typeof browser !== 'undefined' ? browser : chrome)) {
  /**
   * Renders current window's tabs in popup UI
   * Implements dynamic list generation with XSS protection
   * @param {object} browserInstance - Browser API instance
   */
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

  /**
   * Configures tab suspension functionality
   * Implements message passing to background script
   * Handles both success and error states for suspension
   */
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

  /**
   * Manages tab tagging workflow when limit is reached
   * Implements Promise-based storage access for state management
   * Handles tab title updates and state synchronization
   */
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

  /**
   * Message handler for background script communication
   * Implements observer pattern for UI state updates
   * Manages prompt visibility and response acknowledgment
   */
  browserInstance.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'promptTagging') {
      document.getElementById('tagging-prompt').style.display = 'block';
      sendResponse({ message: 'Tagging prompt displayed.' }); // Acknowledge the message
    }
  });

  /**
   * Global error boundary configuration
   * Implements both sync and async error capture
   * Provides test environment error reporting
   */
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

  // Maintains initialization state for idempotency
  let isInitialized = false;

  /**
   * Configures all UI event listeners
   * Implements lazy initialization pattern
   * Manages archive, session, and tab management features
   */
  function initializeEventListeners() {
    if (isInitialized) return;

    const archiveButton = document.getElementById("archiveTabButton");
    const viewArchivesButton = document.getElementById("viewArchivesButton");
    const saveSessionButton = document.getElementById("saveSessionButton");
    const viewSessionsButton = document.getElementById("viewSessionsButton");

    if (archiveButton) {
      archiveButton.addEventListener("click", () => {
        const selectedTag = document.getElementById("tagInput").value;
        const tabId = parseInt(document.getElementById("currentTabId").value);

        if (selectedTag && tabId) {
          browserInstance.runtime.sendMessage(
            { action: "archiveTab", tabId, tag: selectedTag },
            () => {
              loadTabs();
              // Check if we're in a test environment
              if (typeof window !== 'undefined' && window.close) {
                window.close();
              }
            }
          );
        }
      });
    }

    if (viewArchivesButton) {
      viewArchivesButton.addEventListener("click", () => {
        browserInstance.runtime.sendMessage({ action: "getArchivedTabs" }, (response) => {
          const archiveContainer = document.getElementById("archiveList");
          if (archiveContainer && response.archivedTabs) {
            archiveContainer.innerHTML = "";
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
          }
        });
      });
    }

    if (saveSessionButton) {
      saveSessionButton.addEventListener("click", () => {
        const sessionName = prompt("Enter a name for this session:");
        if (sessionName) {
          browserInstance.runtime.sendMessage({ action: "saveSession", sessionName });
        }
      });
    }

    if (viewSessionsButton) {
      viewSessionsButton.addEventListener("click", () => {
        browserInstance.runtime.sendMessage({ action: "getSessions" }, (response) => {
          const sessionsContainer = document.getElementById("sessionsList");
          if (sessionsContainer && response.sessions) {
            sessionsContainer.innerHTML = "";
            Object.keys(response.sessions).forEach((sessionName) => {
              const sessionButton = document.createElement("button");
              sessionButton.textContent = sessionName;
              sessionButton.addEventListener("click", () => {
                browserInstance.runtime.sendMessage({ action: "restoreSession", sessionName });
              });
              sessionsContainer.appendChild(sessionButton);
            });
          }
        });
      });
    }

    setupSuspendButton();
    loadTabs();
    setupTaggingPrompt();

    isInitialized = true;
  }

  /**
   * Manages popup initialization lifecycle
   * Implements DOM readiness check
   * Ensures single initialization execution
   */
  function initialize() {
    if (document.readyState === 'complete') {
      initializeEventListeners();
    } else {
      document.addEventListener('DOMContentLoaded', initializeEventListeners, { once: true });
    }
  }

  // Execute initialization
  initialize();

  /**
   * Public API for popup controller
   * Implements test helper exposure for validation
   * @returns {Object} Public methods and test utilities
   */
  return { 
    loadTabs, 
    setupSuspendButton, 
    setupTaggingPrompt,
    _testHelpers: {
      initializeEventListeners
    }
  };
}

/**
 * Module export configuration
 * Implements CommonJS and browser global compatibility
 * Ensures proper initialization based on environment
 */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = initPopup;
} else {
  window.addEventListener('DOMContentLoaded', () => {
    window.popupInstance = initPopup(window.browser || chrome);
  });
}