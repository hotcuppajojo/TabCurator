// popup/popup.jsx
import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom';
import browser from 'webextension-polyfill';
import { useDispatch, useSelector } from 'react-redux';
import { connection } from '../utils/connectionManager.js';
import { store, actions } from '../utils/stateManager.js';
import { MESSAGE_TYPES, TAB_OPERATIONS, CONFIG } from '../utils/constants.js';
import { TabLimitPrompt } from './TabLimitPrompt.jsx'; // Ensure correct import path for TabLimitPrompt

export default function Popup() {
  const [tabs, setTabs] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [isTaggingPromptVisible, setIsTaggingPromptVisible] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [connectionId, setConnectionId] = useState(null);
  const [tabCount, setTabCount] = useState(0);

  const dispatch = useDispatch();
  const oldestTab = useSelector(state => state.tabManagement.oldestTab);
  const settings = useSelector(state => state.settings);
  const { maxTabs } = settings;

  useEffect(() => {
    const connect = async () => {
      try {
        // Add fallback values and safe access with optional chaining
        const connId = await connection.connect({
          batchSize: CONFIG?.BATCH?.DEFAULT?.SIZE || 10,
          timeout: CONFIG?.BATCH?.DEFAULT?.TIMEOUT || 5000
        });
        setConnectionId(connId);
        // Listen for messages from connection if needed
        connection.onMessage((message) => {
          // Handle state updates or errors if needed
        });
      } catch (error) {
        console.error('Failed to connect to service worker:', error);
      }
    };
    connect();

    return () => connection.disconnect();
  }, []);

  useEffect(() => {
    const checkTabLimit = async () => {
      const allTabs = await browser.tabs.query({});
      setTabCount(allTabs.length);

      if (allTabs.length >= maxTabs) {
        // Request oldest tab from background
        const oldest = await sendMessage({
          type: MESSAGE_TYPES.TAB_ACTION,
          action: 'getOldestTab'
        });

        if (oldest) {
          // Show prompt
          setIsTaggingPromptVisible(true);
        }
      }
    };

    checkTabLimit();
    browser.tabs.onCreated.addListener(checkTabLimit);
    browser.tabs.onRemoved.addListener(checkTabLimit);

    return () => {
      browser.tabs.onCreated.removeListener(checkTabLimit);
      browser.tabs.onRemoved.removeListener(checkTabLimit);
    };
  }, [maxTabs]);

  const sendMessage = async (message) => {
    if (!connectionId) throw new Error('No active connection');
    return connection.sendMessage(connectionId, message);
  };

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

  const refreshTabs = () => {
    loadTabs();
  };

  const suspendInactiveTabs = async () => {
    try {
      // If defined in background: just send message
      await sendMessage({
        type: MESSAGE_TYPES.TAB_ACTION,
        action: 'suspendInactiveTabs'
      });
      await loadTabs();
    } catch (error) {
      console.error('Error suspending tabs:', error);
    }
  };

  const saveSession = async () => {
    const sessionName = prompt('Enter a name for this session:');
    if (sessionName) {
      try {
        await sendMessage({
          type: MESSAGE_TYPES.SESSION_ACTION,
          action: 'saveSession',
          payload: { sessionName }
        });
        console.log(`Session "${sessionName}" saved successfully.`);
      } catch (error) {
        console.error('Error saving session:', error);
        setErrorMsg('Error saving session');
      }
    }
  };

  const loadSessions = async () => {
    try {
      setErrorMsg('');
      const response = await sendMessage({
        type: MESSAGE_TYPES.SESSION_ACTION,
        action: 'getSessions'
      });
      setSessions(response.sessions || []);
    } catch (error) {
      console.error('Error loading sessions:', error);
      setErrorMsg('Error loading sessions');
    }
  };

  const restoreSession = async (sessionName) => {
    try {
      await sendMessage({
        type: MESSAGE_TYPES.SESSION_ACTION,
        action: 'restoreSession',
        payload: { sessionName }
      });
      console.log(`Session "${sessionName}" restored successfully.`);
    } catch (error) {
      console.error(`Error restoring session "${sessionName}":`, error);
      setErrorMsg('Error restoring session');
    }
  };

  const handleTagSubmit = async (tag) => {
    if (!oldestTab) return;
    try {
      // Send TAG_AND_CLOSE action to background
      await sendMessage({
        type: MESSAGE_TYPES.TAB_ACTION,
        action: TAB_OPERATIONS.TAG_AND_CLOSE,
        payload: { tabId: oldestTab.id, tag }
      });
      setIsTaggingPromptVisible(false);
      await loadTabs();
    } catch (error) {
      setErrorMsg(`Failed to tag and close tab: ${error.message}`);
    }
  };

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

      <div className="tab-status">
        <div className={`tab-count ${tabCount >= maxTabs * 0.9 ? 'warning' : ''}`}>
          Tabs: {tabCount} / {maxTabs}
        </div>
        <button 
          onClick={() => browser.runtime.openOptionsPage()}
          className="settings-button"
        >
          Settings
        </button>
      </div>

      {isTaggingPromptVisible && oldestTab && (
        <TabLimitPrompt
          oldestTab={oldestTab}
          onSubmit={handleTagSubmit} // Pass the handleTagSubmit callback
          onClose={() => setIsTaggingPromptVisible(false)}
        />
      )}
    </div>
  );
}

ReactDOM.render(<Popup />, document.getElementById('root'));