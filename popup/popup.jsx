// popup/popup.jsx
import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom';
import browser from 'webextension-polyfill';
import { useDispatch, useSelector } from 'react-redux';
import { connection } from '../utils/connectionManager.js';
import { store, actions } from '../utils/stateManager.js';
import { MESSAGE_TYPES, TAB_OPERATIONS, CONFIG } from '../utils/constants.js';
import TabLimitPrompt from './TabLimitPrompt.jsx';
import { Provider } from 'react-redux';

export default function Popup() {
  const [tabs, setTabs] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [isTaggingPromptVisible, setIsTaggingPromptVisible] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [connectionId, setConnectionId] = useState(null);
  const [tabCount, setTabCount] = useState(0);
  const [port, setPort] = useState(null);
  const [connected, setConnected] = useState(false);

  const [connectionState, setConnectionState] = useState({
    isConnecting: false,
    attempts: 0,
    error: null
  });

  const dispatch = useDispatch();
  const oldestTab = useSelector(state => state.tabManagement.oldestTab);
  const settings = useSelector(state => state.settings);
  const { maxTabs } = settings;

  useEffect(() => {
    const connectWithRetry = async () => {
      if (connectionState.isConnecting || connectionState.attempts >= 3) return;

      setConnectionState(prev => ({ 
        ...prev, 
        isConnecting: true 
      }));

      try {
        // Ensure the connection manager is initialized
        await connection.initialize();

        // Connect returns a connectionId
        const cId = await connection.connect({
          name: 'popup',
          timeout: 3000
        });

        const p = connection.getPort(cId);
        if (!p) {
          throw new Error('Failed to retrieve port from connectionId');
        }

        setConnected(true);
        setConnectionId(cId);
        setPort(p);
        setConnectionState({
          isConnecting: false,
          attempts: 0,
          error: null
        });

        p.onMessage.addListener((msg) => {
          if (msg.type === MESSAGE_TYPES.STATE_UPDATE) {
            loadTabs();
          }
        });

        p.onDisconnect.addListener(() => {
          const error = browser.runtime.lastError;
          setConnected(false);
          setPort(null);
          
          if (error?.message && error.message.includes('Extension context invalidated')) {
            setTimeout(connectWithRetry, 1000);
          }
        });

      } catch (error) {
        console.error('Connection failed:', error);
        setConnectionState(prev => ({
          isConnecting: false,
          attempts: prev.attempts + 1,
          error: error.message
        }));

        if (connectionState.attempts < 3) {
          setTimeout(connectWithRetry, 1000 * (connectionState.attempts + 1));
        }
      }
    };

    connectWithRetry();

    return () => {
      if (port) {
        port.disconnect();
      }
    };
  }, []);

  useEffect(() => {
    const checkTabLimit = async () => {
      const allTabs = await browser.tabs.query({});
      setTabCount(allTabs.length);

      if (allTabs.length >= maxTabs && connectionId) {
        // Request oldest tab from background
        const oldest = await sendMessage({
          type: MESSAGE_TYPES.TAB_ACTION,
          action: 'getOldestTab'
        });

        if (oldest) {
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
  }, [maxTabs, connectionId]);

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
    if (!connected) {
      console.error('Not connected');
      return;
    }
    
    console.log('Suspending inactive tabs...');
    try {
      await sendMessage({
        type: MESSAGE_TYPES.TAB_ACTION,
        action: 'suspendInactiveTabs'
      });
      console.log('Successfully sent suspend message');
      await loadTabs();
    } catch (error) {
      console.error('Error suspending tabs:', error);
      setErrorMsg('Error suspending tabs: ' + error.message);
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

  const openOptions = async () => {
    console.log('Opening options page...');
    try {
      await browser.runtime.openOptionsPage();
    } catch (error) {
      console.error('Failed to open options:', error);
      const url = browser.runtime.getURL('options/options.html');
      console.log('Trying fallback with URL:', url);
      await browser.tabs.create({ url });
    }
  };

  return (
    <div className="popup-container">
      <h1>TabCurator</h1>
      <button 
        onClick={suspendInactiveTabs}
        disabled={!connected}
        data-testid="suspend-inactive-tabs"
      >
        Suspend Inactive Tabs
      </button>
      <button onClick={refreshTabs}>Refresh Tabs</button>
      <div id="tab-list">
        {tabs.map((tab) => (
          <div key={tab.id} className="tab-item">
            {tab.title || 'Untitled Tab'}
          </div>
        ))}
      </div>

      <div className="status-bar">
        {connectionState.isConnecting && (
          <span className="connecting">Connecting to extension...</span>
        )}
        {connectionState.error && (
          <span className="error">
            Connection error: {connectionState.error}
            {connectionState.attempts < 3 && " - Retrying..."}
          </span>
        )}
        {errorMsg && <div className="error-message">{errorMsg}</div>}
      </div>

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
          onClick={openOptions}
          className="settings-button"
          data-testid="open-settings"
        >
          Settings
        </button>
      </div>

      {isTaggingPromptVisible && oldestTab && (
        <TabLimitPrompt
          oldestTab={oldestTab}
          onSubmit={handleTagSubmit}
          onClose={() => setIsTaggingPromptVisible(false)}
        />
      )}
    </div>
  );
}

ReactDOM.render(
  <Provider store={store}>
    <Popup />
  </Provider>,
  document.getElementById('root')
);