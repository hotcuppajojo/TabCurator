// src/popup/popup.js
/**
 * @fileoverview Popup UI controller module for TabCurator extension.
 * Implements user interface interactions and tab management operations.
 * Ensures cross-browser compatibility with Manifest V3 compliance.
 */
import browser from 'webextension-polyfill';
import { queryTabs, getTab } from '../utils/tabManager.js';

/**
 * Initializes the popup controller for TabCurator.
 * Sets up tab rendering, event listeners, and state updates.
 */
function initPopup() {
  let isInitialized = false;

  /**
   * Renders the current window's tabs in the popup UI.
   * Dynamically generates a list of tabs with proper XSS prevention measures.
   * @returns {Promise<void>}
   */
  async function loadTabs() {
    try {
      const tabs = await queryTabs({});
      const tabList = document.getElementById('tab-list');
      if (!tabList) {
        console.error('Tab list element not found');
        return;
      }

      tabList.innerHTML = ''; // Clear previous tab list

      tabs.forEach((tab) => {
        const tabItem = document.createElement('div');
        tabItem.className = 'tab-item';
        tabItem.textContent = tab.title || 'Untitled Tab';
        tabItem.setAttribute('aria-label', `Tab: ${tab.title || 'Untitled'}`);
        tabList.appendChild(tabItem);
      });
    } catch (error) {
      console.error('Error loading tabs:', error);
    }
  }

  /**
   * Configures functionality to suspend inactive tabs.
   * Sends a message to the background script to trigger the suspension process.
   */
  function setupSuspendButton() {
    const suspendButton = document.getElementById('suspend-inactive-tabs');
    if (suspendButton) {
      suspendButton.addEventListener('click', async () => {
        try {
          const response = await browser.runtime.sendMessage({ action: 'suspendInactiveTabs' });
          console.log('Suspend inactive tabs successful:', response);
          await loadTabs(); // Refresh the tab list
        } catch (error) {
          console.error('Error suspending tabs:', error.message);
        }
      });
    }
  }

  /**
   * Handles tagging of the oldest tab as prompted by the background script.
   * Retrieves the oldest tab's ID, applies a tag, and updates the UI state.
   */
  function setupTaggingPrompt() {
    const taggingPrompt = document.getElementById('tagging-prompt');
    const tagButton = document.getElementById('tag-oldest-tab');

    if (tagButton) {
      tagButton.addEventListener('click', async () => {
        try {
          const response = await browser.runtime.sendMessage({ action: 'GET_STATE' });
          const state = response?.state || {};
          const oldestTabId = state?.oldestTabId;

          if (oldestTabId) {
            const tab = await getTab(oldestTabId);
            const action = {
              type: 'ARCHIVE_TAB',
              tabId: oldestTabId,
              tag: 'Tagged',
              tabData: { title: tab.title, url: tab.url },
            };
            await browser.runtime.sendMessage({ action: 'DISPATCH_ACTION', payload: action });
            console.log(`Tab ${oldestTabId} tagged successfully.`);

            await browser.runtime.sendMessage({ action: 'tagAdded', tabId: oldestTabId });
            taggingPrompt.style.display = 'none';
            await loadTabs(); // Refresh tab list after tagging
          } else {
            alert('No oldest tab to tag.');
            taggingPrompt.style.display = 'none';
          }
        } catch (error) {
          console.error('Error tagging the oldest tab:', error);
        }
      });
    }
  }

  /**
   * Listens for messages from the background script to update UI state.
   */
  function setupMessageListener() {
    browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.action === 'promptTagging') {
        const taggingPrompt = document.getElementById('tagging-prompt');
        if (taggingPrompt) {
          taggingPrompt.style.display = 'block';
        }
        if (typeof sendResponse === 'function') {
          sendResponse({ message: 'Tagging prompt displayed.' });
        }
      }
    });
  }

  /**
   * Configures all UI event listeners and initializes the popup's interactive elements.
   */
  function initializeEventListeners() {
    if (isInitialized) return;

    // Add archive button event listener
    document.getElementById('archiveTabButton')?.addEventListener('click', async () => {
      const tabId = Number(document.getElementById('currentTabId')?.value);
      const tag = document.getElementById('tagInput')?.value || 'Research';
      try {
        await browser.runtime.sendMessage({ action: 'archiveTab', tabId, tag });
        window.close();
      } catch (error) {
        console.error('Error archiving tab:', error);
      }
    });

    // Add view archives button event listener
    document.getElementById('viewArchivesButton')?.addEventListener('click', async () => {
      try {
        await browser.runtime.sendMessage({ action: 'getArchivedTabs' });
      } catch (error) {
        console.error('Error loading archived tabs:', error);
      }
    });

    // Add view sessions button event listener
    document.getElementById('viewSessionsButton')?.addEventListener('click', async () => {
      try {
        await browser.runtime.sendMessage({ action: 'getSessions' });
      } catch (error) {
        console.error('Error loading sessions:', error);
      }
    });

    document.getElementById('saveSessionButton')?.addEventListener('click', () => {
      const sessionName = prompt('Enter a name for this session:');
      if (sessionName) {
        browser.runtime.sendMessage({ action: 'saveSession', sessionName })
          .catch((error) => console.error('Error saving session:', error));
      }
    });

    document.getElementById('viewSessionsButton')?.addEventListener('click', () => {
      browser.runtime.sendMessage({ action: 'getSessions' }, (response) => {
        const sessionsContainer = document.getElementById('sessionsList');
        if (sessionsContainer) {
          sessionsContainer.innerHTML = '';
          Object.keys(response.sessions || {}).forEach((sessionName) => {
            const sessionButton = document.createElement('button');
            sessionButton.textContent = sessionName;
            sessionButton.setAttribute('aria-label', `Restore session: ${sessionName}`);
            sessionButton.addEventListener('click', () => {
              browser.runtime.sendMessage({ action: 'restoreSession', sessionName })
                .catch((error) => console.error(`Error restoring session "${sessionName}":`, error));
            });
            sessionsContainer.appendChild(sessionButton);
          });
        }
      });
    });

    setupSuspendButton();
    setupTaggingPrompt();
    setupMessageListener();
    loadTabs();

    isInitialized = true;
  }

  /**
   * Initializes the popup controller.
   */
  function initialize() {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initializeEventListeners, { once: true });
    } else {
      initializeEventListeners();
    }
  }

  initialize();

  /**
   * Public API for testing and external integrations.
   */
  return {
    loadTabs,
    setupSuspendButton,
    setupTaggingPrompt,
    _testHelpers: {
      initializeEventListeners,
    },
  };
}

/**
 * Exports the module for testing or initializes it in the browser.
 */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = initPopup;
} else {
  window.popupInstance = initPopup();
}