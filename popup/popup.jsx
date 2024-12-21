// popup/popup.jsx
import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { Provider } from 'react-redux';
import stateManager from '../utils/stateManager.js';
import { connection } from '../utils/connectionManager.js'; // Updated import
import browser from 'webextension-polyfill';
import { useDispatch, useSelector } from 'react-redux';
import { MESSAGE_TYPES, TAB_OPERATIONS, ACTION_TYPES } from '../utils/constants.js';
import TabLimitPrompt from './TabLimitPrompt.jsx';
import { logger } from '../utils/logger.js'; // Add logger import

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

  // Updated sendMessage function
  const sendMessage = async (message) => {
    try {
      const response = await connection.sendMessage(connectionId, message);
      if (!response) {
        throw new Error('No response received');
      }
  
      if (response.error) {
        throw new Error(response.error);
      }
  
      return response;
    } catch (error) {
      logger.error('Send Message Error:', error); // Replace console.error
      throw error;
    }
  };

  const loadTabs = async () => {
    try {
      setErrorMsg('');
      const fetchedTabs = await browser.tabs.query({});
      setTabs(fetchedTabs);
      logger.info('Tabs loaded successfully.'); // Add logging
    } catch (error) {
      logger.error('Error loading tabs:', error); // Replace console.error
      setErrorMsg('Error loading tabs');
    }
  };

  const refreshTabs = () => {
    loadTabs();
  };

  const suspendInactiveTabs = async () => {
    try {
      const response = await sendMessage({
        type: MESSAGE_TYPES.TAB_ACTION,
        action: TAB_OPERATIONS.SUSPEND_INACTIVE,
        payload: {} // Empty payload for this operation
      });
      if (response.success) {
        logger.info(`Suspended ${response.suspendedTabs} inactive tabs.`);
      }
      await loadTabs(); // Refresh UI after operation
    } catch (error) {
      logger.error('Failed to suspend tabs:', error);
      setErrorMsg(error.message);
    }
  };

  const saveSession = async () => {
    const sessionName = prompt('Enter a name for this session:');
    if (!sessionName?.trim()) return;

    try {
      await sendMessage({
        type: MESSAGE_TYPES.SESSION_ACTION,
        action: ACTION_TYPES.SESSION.SAVE_SESSION,
        payload: { name: sessionName }
      });
      await loadSessions();
    } catch (error) {
      logger.error('Failed to save session:', error);
      setErrorMsg(error.message);
    }
  };

  const loadSessions = async () => {
    try {
      logger.info('Sending getSessions message...');
      const response = await sendMessage({
        type: MESSAGE_TYPES.GET_SESSIONS,
        payload: {}
      });
      setSessions(response.sessions || []);
    } catch (error) {
      logger.error('Failed to load sessions:', error);
      setErrorMsg(error.message);
      setSessions([]);
    }
  };

  const restoreSession = async (sessionName) => {
    try {
      const message = {
        type: MESSAGE_TYPES.SESSION_ACTION,
        action: ACTION_TYPES.SESSION.RESTORE_SESSION,
        payload: { sessionName }
      };
      await sendMessage(message);
      logger.info(`Session "${sessionName}" restored successfully.`);
    } catch (error) {
      logger.error(`Error restoring session "${sessionName}":`, error);
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
      logger.error(`Failed to tag tab: ${error.message}`);
    }
  };
  
  const openOptions = async () => {
    logger.info('Opening options page...'); 
    try {
      await browser.runtime.openOptionsPage();
    } catch (error) {
      logger.error('Failed to open options:', error);
      const url = browser.runtime.getURL('options/options.html');
      logger.info('Trying fallback with URL:', url);
      await browser.tabs.create({ url });
    }
  };

  const renderSessions = () => {
    if (!sessions.length) {
      return <div className="no-sessions">No saved sessions</div>;
    }

    return (
      <div id="sessionsList" className="sessions-list">
        {sessions.map((sessionName) => (
          <div key={sessionName} className="session-item">
            <span className="session-name">{sessionName}</span>
            <button
              onClick={() => restoreSession(sessionName)}
              className="restore-button"
              aria-label={`Restore session: ${sessionName}`}
            >
              Restore
            </button>
          </div>
        ))}
      </div>
    );
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

      <div className="sessions-container">
        <div className="sessions-controls">
          <button 
            id="save-session" 
            onClick={saveSession}
            disabled={!connected}
          >
            Save Current Session
          </button>
          <button 
            id="view-sessions" 
            onClick={loadSessions}
            disabled={!connected}
          >
            View Saved Sessions
          </button>
        </div>
        {renderSessions()}
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
      <Provider store={stateManager.store}>
        <Popup />
      </Provider>,
      document.getElementById('root')
    );
  } catch (error) {
    logger.error('Error rendering popup:', error); // Replace console.error
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