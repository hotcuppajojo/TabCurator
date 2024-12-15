// popup/popup.jsx
import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom';
import browser from 'webextension-polyfill'; // Ensure proper import
import { CONNECTION_NAME } from '../background/constants.js'; // Import CONNECTION_NAME to ensure consistency
import { connection } from '../utils/connectionManager.js';
import { 
  store, 
  actions, 
  getSavedSessions 
} from '../utils/stateManager.js';
import { MESSAGE_TYPES } from '../utils/types.js';

// Establish a persistent connection with the background script using the consistent CONNECTION_NAME
let port = browser.runtime.connect({ name: CONNECTION_NAME });

// Expose the browser API to the global window object for testing purposes
window.browser = browser;

// React Component
function Popup() {
  const [tabs, setTabs] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [isTaggingPromptVisible, setIsTaggingPromptVisible] = useState(false);
  const [oldestTabId, setOldestTabId] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [connectionId, setConnectionId] = useState(null);

  // Move setupConnection inside the Popup component
  const setupConnection = () => {
    port = browser.runtime.connect({ name: CONNECTION_NAME });

    port.onMessage.addListener(handlePortMessage);

    port.onDisconnect.addListener(() => {
      console.error("Disconnected from background script.");
      setErrorMsg('Disconnected from background script. Attempting to reconnect...');
      // Attempt to reconnect after a delay
      setTimeout(() => {
        setupConnection();
      }, 2000);
    });
  };

  // Initial connection setup
  useEffect(() => {
    const connect = async () => {
      try {
        // Use the ConnectionManager
        await connection.connect();
        
        // Once connected, set up message handlers
        connection.onMessage((message) => {
          switch (message.type) {
            case 'STATE_UPDATE':
              handleStateUpdate(message.payload);
              break;
            case 'ERROR':
              handleError(message.error);
              break;
            // ...handle other message types
          }
        });

      } catch (error) {
        console.error('Failed to connect to service worker:', error);
      }
    };

    connect();

    return () => connection.disconnect();
  }, []);

  useEffect(() => {
    async function initializeConnection() {
      try {
        const connId = await connection.connect();
        setConnectionId(connId);
      } catch (error) {
        console.error('Failed to connect:', error);
      }
    }

    initializeConnection();
  }, []);

  const sendMessage = async (message) => {
    if (!connectionId) throw new Error('No active connection');
    return connection.sendMessage(connectionId, message);
  };

  /**
   * Loads the current window's tabs and updates the state.
   */
  const loadTabs = async () => {
    try {
      setErrorMsg('');
      const fetchedTabs = await browser.tabs.query({});
      setTabs(fetchedTabs);
    } catch (error) {
      console.error('Error loading tabs:', error);
      setErrorMsg('Error loading tabs');
    }
  };

  /**
   * Refreshes the list of tabs.
   */
  const refreshTabs = () => {
    loadTabs();
  };

  /**
   * Suspends inactive tabs by sending a message to the background script.
   */
  const suspendInactiveTabs = async () => {
    try {
      await sendMessage({ 
        type: MESSAGE_TYPES.TAB_ACTION,
        action: 'suspendInactiveTabs' 
      });
      await loadTabs();
    } catch (error) {
      console.error('Error suspending tabs:', error);
    }
  };

  /**
   * Handles tagging the oldest tab when the tab limit is exceeded.
   */
  const tagOldestTab = async () => {
    try {
      if (oldestTabId) {
        // Send a message to archive the oldest tab
        await port.postMessage({ action: 'archiveTab', tabId: oldestTabId, tag: 'Tagged' });
        console.log(`Tab ${oldestTabId} tagged successfully.`);
        
        // Inform the background script that a tag has been added
        await port.postMessage({ action: 'tagAdded', tabId: oldestTabId });
        
        // Hide the tagging prompt and refresh the tab list
        setIsTaggingPromptVisible(false);
        await loadTabs();
      } else {
        alert('No oldest tab to tag.');
        setIsTaggingPromptVisible(false);
      }
    } catch (error) {
      console.error('Error tagging the oldest tab:', error);
      setErrorMsg('Error tagging the oldest tab');
    }
  };

  /**
   * Listens for messages from the background script to update UI state.
   */
  const setupMessageListener = () => {
    // Since we've already set up port.onMessage at the top, this function can be used for additional setups if needed
  };

  /**
   * Handles incoming messages from the background script.
   * @param {object} message - The message object received.
   */
  const handlePortMessage = (message) => {
    if (message.type === "CONNECTION_ACK") {
      console.log('Received CONNECTION_ACK from background script.');
      // Now safe to send other messages
      port.postMessage({ action: "getState" });
    } else if (message.action === 'state') {
      // Handle state response from the background script
      const state = message.state;
      setTabs(state.tabs || []);
      setSessions(state.sessions || []);
    } else if (message.action === 'promptTagging') {
      // Show the tagging prompt when prompted by the background script
      setIsTaggingPromptVisible(true);
      setOldestTabId(message.oldestTabId);
    } else if (message.error) {
      // Handle errors sent from the background script
      setErrorMsg(message.error);
    }
  };

  /**
   * Handles port disconnection.
   */
  const handlePortDisconnect = () => {
    console.error("Disconnected from background script.");
    // Optionally, you can attempt to reconnect or update the UI accordingly
  };

  /**
   * Saves the current session with a user-provided name.
   */
  const saveSession = async () => {
    const sessionName = prompt('Enter a name for this session:');
    if (sessionName) {
      try {
        await port.postMessage({ action: 'saveSession', sessionName });
        console.log(`Session "${sessionName}" saved successfully.`);
      } catch (error) {
        console.error('Error saving session:', error);
        setErrorMsg('Error saving session');
      }
    }
  };

  /**
   * Loads saved sessions from the background script.
   */
  const loadSessions = async () => {
    try {
      setErrorMsg('');
      await port.postMessage({ action: 'getSessions' });
      // The response will be handled in the port.onMessage listener
    } catch (error) {
      console.error('Error loading sessions:', error);
      setErrorMsg('Error loading sessions');
    }
  };

  /**
   * Restores a selected session.
   * @param {string} sessionName - The name of the session to restore.
   */
  const restoreSession = async (sessionName) => {
    try {
      await port.postMessage({ action: 'restoreSession', sessionName });
      console.log(`Session "${sessionName}" restored successfully.`);
    } catch (error) {
      console.error(`Error restoring session "${sessionName}":`, error);
      setErrorMsg('Error restoring session');
    }
  };

  const handleArchiveTab = async (tabId, tag) => {
    await sendMessage({ 
      type: MESSAGE_TYPES.TAB_ACTION,
      action: actions.tab.archive(tabId, tag)
    });
  };

  const handleTabAction = async (tabId, action) => {
    try {
      await sendMessage({
        type: MESSAGE_TYPES.TAB_ACTION,
        action: action(tabId)
      });
      await loadTabs();
    } catch (error) {
      setErrorMsg(`Failed to perform action: ${error.message}`);
    }
  };

  const archiveTab = (tabId, tag) => 
    handleTabAction(tabId, (id) => actions.tab.archive(id, tag));

  const suspendTab = (tabId) => 
    handleTabAction(tabId, () => actions.tab.suspend(tabId));

  return (
    <div className="popup-container">
      <h1>TabCurator</h1>
      <button onClick={suspendInactiveTabs}>Suspend Inactive Tabs</button>
      <button onClick={refreshTabs}>Refresh Tabs</button>
      <div id="tab-list">
        {tabs.map((tab) => (
          <div key={tab.id} className="tab-item">
            {tab.title || 'Untitled Tab'}
          </div>
        ))}
      </div>

      {errorMsg && <div className="error-message">{errorMsg}</div>}

      {/* Session management */}
      <div>
        <input id="session-name-input" placeholder="Session Name" />
        <button id="save-session" onClick={saveSession}>Save Current Session</button>
        <button id="view-sessions" onClick={loadSessions}>View Saved Sessions</button>
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
            width: 'auto', // Allow width to adjust based on content
            // maxWidth: '90%', // Optional: Prevent it from being too wide on larger screens
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