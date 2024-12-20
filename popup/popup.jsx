// popup/popup.jsx
import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { Provider } from 'react-redux';
import { store } from '../utils/stateManager.js';
import { connection } from '../utils/connectionManager.js';
import browser from 'webextension-polyfill';
import { useDispatch, useSelector } from 'react-redux';
import { MESSAGE_TYPES, TAB_OPERATIONS, CONFIG } from '../utils/constants.js';
import TabLimitPrompt from './TabLimitPrompt.jsx';

const Popup = () => {
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
        // Try to connect and validate background initialization
        const cId = await connection.connect({
          name: 'popup',
          timeout: 3000
        });

        const p = connection.getPort(cId);
        if (!p) {
          throw new Error('Failed to retrieve port');
        }

        setConnected(true);
        setConnectionId(cId);
        setPort(p);
        setConnectionState({
          isConnecting: false,
          attempts: 0,
          error: null
        });

        // Setup message listeners after successful connection
        p.onMessage.addListener((msg) => {
          if (msg.error) {
            setErrorMsg(msg.error);
            return;
          }
          if (msg.type === MESSAGE_TYPES.STATE_UPDATE) {
            loadTabs();
          }
        });

        p.onDisconnect.addListener(() => {
          setConnected(false);
          setPort(null);
          
          const error = browser.runtime.lastError;
          if (error?.message.includes('Extension context invalidated')) {
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
          setTimeout(connectWithRetry, 1000 * Math.pow(2, connectionState.attempts));
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

  // Enhanced tab limit check
  useEffect(() => {
    const checkTabLimit = async () => {
      const allTabs = await browser.tabs.query({});
      setTabCount(allTabs.length);

      // If we're at or above the limit
      if (allTabs.length >= maxTabs) {
        // Find and close the oldest tab
        try {
          const oldest = await sendMessage({
            type: MESSAGE_TYPES.TAB_ACTION,
            action: TAB_OPERATIONS.GET_OLDEST,
            payload: {} // Added empty payload
          });

          if (oldest) {
            setIsTaggingPromptVisible(true);
            // Prevent new tab creation if we're at the limit
            const currentTab = await browser.tabs.getCurrent();
            if (currentTab && allTabs.length > maxTabs) {
              await browser.tabs.remove(currentTab.id);
            }
          }
        } catch (error) {
          console.error('Error handling tab limit:', error);
        }
      }
    };

    checkTabLimit();
    
    // Listen for tab changes
    const tabListener = async (tab) => {
      await checkTabLimit();
    };

    browser.tabs.onCreated.addListener(tabListener);
    browser.tabs.onRemoved.addListener(tabListener);

    return () => {
      browser.tabs.onCreated.removeListener(tabListener);
      browser.tabs.onRemoved.removeListener(tabListener);
    };
  }, [maxTabs, connectionId]);

  useEffect(() => {
    // Expose logger to the popup's window for console access
    if (process.env.NODE_ENV !== 'production') {
      window.tabCuratorLogger = logger;
      console.info('tabCuratorLogger is available in the popup console.');
    }
  }, []);

  const sendMessage = async (message) => {
    if (!connectionId) throw new Error('No active connection');
    try {
      const response = await connection.sendMessage(connectionId, message);
      return response;
    } catch (error) {
      console.error('Send Message Error:', error);
      throw error;
    }
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
    
    try {
      const response = await sendMessage({
        type: MESSAGE_TYPES.TAB_ACTION,
        action: TAB_OPERATIONS.SUSPEND_INACTIVE,
        payload: { operation: 'SUSPEND_INACTIVE' }
      });

      if (response && response.error) { // Added check for response existence
        setErrorMsg(response.error);
        return;
      }

      console.log('Successfully sent suspend message');
      await loadTabs();
    } catch (error) {
      console.error('Error suspending tabs:', error);
      setErrorMsg('Error suspending tabs: ' + error.message);
    }
  };

  const saveSession = async () => {
    if (!connected || !connectionId) {
      setErrorMsg('Not connected');
      return;
    }

    const sessionName = prompt('Enter a name for this session:');
    if (sessionName) {
      try {
        await connection.sendMessage(connectionId, {
          type: MESSAGE_TYPES.SESSION_ACTION,
          action: 'saveSession',
          payload: { sessionName }
        });
        
        console.log(`Session "${sessionName}" saved successfully.`);
        await loadSessions(); // Refresh sessions list
      } catch (error) {
        console.error('Error saving session:', error);
        setErrorMsg('Error saving session');
      }
    }
  };

  const loadSessions = async () => {
    try {
      setErrorMsg('');
      console.log('Sending getSessions message...');
      
      const response = await sendMessage({
        type: MESSAGE_TYPES.GET_SESSIONS,
        payload: {} // Ensure payload is present
      });

      if (!response) { // Added check for undefined response
        setErrorMsg('Received undefined response from getSessions');
        setSessions([]);
        return;
      }
      
      if (response.error) {
        setErrorMsg(response.error);
        setSessions([]);
        return;
      }

      console.log('Raw sessions response:', response);
      const sessions = response.sessions || [];
      console.log('Processed sessions:', sessions);
      setSessions(sessions);
      
    } catch (error) {
      console.error('Error loading sessions:', error);
      setErrorMsg('Error loading sessions');
      setSessions([]);
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
};

// Wrap the render with error boundary
const renderPopup = () => {
  try {
    ReactDOM.render(
      <Provider store={store}>
        <Popup />
      </Provider>,
      document.getElementById('root')
    );
  } catch (error) {
    console.error('Error rendering popup:', error);
    // Render error fallback
    ReactDOM.render(
      <div className="error-container">
        <h2>Error Loading TabCurator</h2>
        <p>Please try reloading the extension.</p>
      </div>,
      document.getElementById('root')
    );
  }
};

renderPopup();