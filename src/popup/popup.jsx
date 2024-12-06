import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom';
import browser from 'webextension-polyfill';

function Popup() {
  const [tabs, setTabs] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [isTaggingPromptVisible, setIsTaggingPromptVisible] = useState(false);
  const [oldestTabId, setOldestTabId] = useState(null);

  useEffect(() => {
    loadTabs();
    setupMessageListener();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Loads the current window's tabs and updates the state.
   */
  const loadTabs = async () => {
    try {
      const tabs = await browser.tabs.query({});
      setTabs(tabs);
    } catch (error) {
      console.error('Error loading tabs:', error);
    }
  };

  /**
   * Suspends inactive tabs by sending a message to the background script.
   */
  const suspendInactiveTabs = async () => {
    try {
      await browser.runtime.sendMessage({ action: 'suspendInactiveTabs' });
      await loadTabs(); // Refresh the tab list
    } catch (error) {
      console.error('Error suspending tabs:', error.message);
    }
  };

  /**
   * Handles tagging the oldest tab when the tab limit is exceeded.
   */
  const tagOldestTab = async () => {
    try {
      const response = await browser.runtime.sendMessage({ action: 'GET_STATE' });
      const state = response?.state || {};
      const oldestTabId = state?.oldestTabId;

      if (oldestTabId) {
        const tab = await browser.tabs.get(oldestTabId);
        const action = {
          type: 'ARCHIVE_TAB',
          tabId: oldestTabId,
          tag: 'Tagged',
          tabData: { title: tab.title, url: tab.url },
        };
        await browser.runtime.sendMessage({ action: 'DISPATCH_ACTION', payload: action });
        console.log(`Tab ${oldestTabId} tagged successfully.`);

        await browser.runtime.sendMessage({ action: 'tagAdded', tabId: oldestTabId });
        setIsTaggingPromptVisible(false);
        await loadTabs(); // Refresh tab list after tagging
      } else {
        alert('No oldest tab to tag.');
        setIsTaggingPromptVisible(false);
      }
    } catch (error) {
      console.error('Error tagging the oldest tab:', error);
    }
  };

  /**
   * Listens for messages from the background script to update UI state.
   */
  const setupMessageListener = () => {
    browser.runtime.onMessage.addListener((message) => {
      if (message.action === 'promptTagging') {
        setIsTaggingPromptVisible(true);
        setOldestTabId(message.oldestTabId);
      }
    });
  };

  /**
   * Saves the current session with a user-provided name.
   */
  const saveSession = async () => {
    const sessionName = prompt('Enter a name for this session:');
    if (sessionName) {
      try {
        await browser.runtime.sendMessage({ action: 'saveSession', sessionName });
        console.log(`Session "${sessionName}" saved successfully.`);
      } catch (error) {
        console.error('Error saving session:', error);
      }
    }
  };

  /**
   * Loads saved sessions from the background script.
   */
  const loadSessions = async () => {
    try {
      const response = await browser.runtime.sendMessage({ action: 'getSessions' });
      setSessions(Object.keys(response.sessions || {}));
    } catch (error) {
      console.error('Error loading sessions:', error);
    }
  };

  /**
   * Restores a selected session.
   * @param {string} sessionName - The name of the session to restore.
   */
  const restoreSession = async (sessionName) => {
    try {
      await browser.runtime.sendMessage({ action: 'restoreSession', sessionName });
      console.log(`Session "${sessionName}" restored successfully.`);
    } catch (error) {
      console.error(`Error restoring session "${sessionName}":`, error);
    }
  };

  return (
    <div className="popup-container">
      <h1>TabCurator</h1>
      <button onClick={suspendInactiveTabs}>Suspend Inactive Tabs</button>
      <div id="tab-list">
        {tabs.map((tab) => (
          <div key={tab.id} className="tab-item">
            {tab.title || 'Untitled Tab'}
          </div>
        ))}
      </div>

      {/* Session management */}
      <div>
        <button onClick={saveSession}>Save Current Session</button>
        <button onClick={loadSessions}>View Saved Sessions</button>
        <div id="sessionsList">
          {sessions.map((sessionName) => (
            <button
              key={sessionName}
              onClick={() => restoreSession(sessionName)}
              aria-label={`Restore session: ${sessionName}`}
            >
              {sessionName}
            </button>
          ))}
        </div>
      </div>

      {/* Tagging prompt */}
      {isTaggingPromptVisible && (
        <div
          id="tagging-prompt"
          style={{
            display: 'block',
            position: 'fixed',
            top: '20%',
            left: '50%',
            transform: 'translate(-50%, -20%)',
            padding: '20px',
            backgroundColor: 'white',
            border: '1px solid #ccc',
            boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
          }}
        >
          <p>You have exceeded the tab limit. Please tag the oldest tab to allow new tabs.</p>
          <button onClick={tagOldestTab}>Tag Oldest Tab</button>
        </div>
      )}
    </div>
  );
}

ReactDOM.render(<Popup />, document.getElementById('root'));