// popup/popup.jsx
import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { Provider } from 'react-redux';
import stateManager from '../utils/stateManager.js';
import connectionManager from '../utils/connectionManager.js';  // Use correct import name
import browser from 'webextension-polyfill';
import { useDispatch, useSelector } from 'react-redux';
import { 
  MESSAGE_TYPES, 
  ACTION,
  CONFIG,
  formatMessage, 
  MESSAGES,
  recordTelemetry,
  TELEMETRY_EVENTS
} from '../utils/core/index.js';  // Use core imports
import TabLimitPrompt from './TabLimitPrompt.jsx';
import { logger } from '../utils/logger.js';

const Popup = () => {
  const [tabs, setTabs] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [isTaggingPromptVisible, setIsTaggingPromptVisible] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [connectionId, setConnectionId] = useState(null);
  const [tabCount, setTabCount] = useState(0);
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
        // Connect using connectionManager
        const connection = await connectionManager.connect();
        
        setConnected(true);
        setConnectionId(connection.connectionId);
        setConnectionState({
          isConnecting: false,
          attempts: 0,
          error: null
        });

        // Initial data loading after connection
        await loadTabs();
        await loadSessions();
        
        logger.info('Popup connected to background service worker');
        
        // Record successful connection
        recordTelemetry(TELEMETRY_EVENTS.POPUP_OPENED, {
          connectionId: connection.connectionId
        });
      } catch (error) {
        logger.error('Connection failed:', { error: error.message });
        setConnectionState(prev => ({
          isConnecting: false,
          attempts: prev.attempts + 1,
          error: error.message
        }));

        if (connectionState.attempts < 3) {
          // Exponential backoff for retries
          setTimeout(connectWithRetry, 1000 * Math.pow(2, connectionState.attempts));
        }
      }
    };

    connectWithRetry();

    return () => {
      // Clean up on unmount
      if (connectionId) {
        connectionManager.cleanup();
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
          if (connected) {
            const response = await sendMessage({
              type: MESSAGE_TYPES.TAB_ACTION,
              action: ACTION.TAB.GET_OLDEST,
              payload: {}
            });
            
            if (response && response.oldestTab) {
              setIsTaggingPromptVisible(true);
            }
          }
        } catch (error) {
          logger.error('Error handling tab limit:', { error: error.message });
        }
      }
    };

    checkTabLimit();
    
    // Listen for tab changes
    const tabListener = async () => {
      await checkTabLimit();
    };

    browser.tabs.onCreated.addListener(tabListener);
    browser.tabs.onRemoved.addListener(tabListener);

    return () => {
      browser.tabs.onCreated.removeListener(tabListener);
      browser.tabs.onRemoved.removeListener(tabListener);
    };
  }, [maxTabs, connectionId, connected]);

  // Updated sendMessage function
  const sendMessage = async (message) => {
    try {
      // If the local connected state hasn't updated yet (React state is async),
      // prefer an existing connection from the ConnectionManager instance. This
      // is faster and avoids creating duplicate ports. If none exists, attempt
      // a connect() as a fallback; if that also fails, ConnectionManager's
      // sendMessage will still try runtime.sendMessage fallback.
      if (!connected) {
        try {
          if (connectionManager && connectionManager.connections && connectionManager.connections.size > 0) {
            // Use the first available connection
            const firstConn = connectionManager.connections.values().next().value;
            if (firstConn) {
              setConnected(true);
              setConnectionId(firstConn.connectionId);
            }
          } else if (connectionManager && connectionManager.connect) {
            // Attempt to create a connection (connect may be synchronous)
            const conn = connectionManager.connect();
            if (conn) {
              setConnected(true);
              setConnectionId(conn.connectionId);
            }
          }
        } catch (connErr) {
          logger.debug('Deferred connect attempt failed in sendMessage', { error: connErr && connErr.message ? connErr.message : connErr });
        }
      }

      // Use connectionManager.sendMessage directly. ConnectionManager now
      // contains a runtime.sendMessage fallback for port failures.
      return await connectionManager.sendMessage(message);
    } catch (error) {
      // Log the full error for diagnostics and rethrow
      logger.error('Send Message Error:', error);
      throw error;
    }
  };

  const loadTabs = async () => {
    try {
      setErrorMsg('');
      const fetchedTabs = await browser.tabs.query({});
      setTabs(fetchedTabs);
      logger.info('Tabs loaded successfully.');
    } catch (error) {
      logger.error('Error loading tabs:', { error: error.message });
      setErrorMsg('Error loading tabs');
    }
  };

  const refreshTabs = () => {
    loadTabs();
  };

  const suspendInactiveTabs = async () => {
    if (!connected) {
      setErrorMsg('Not connected to background service');
      return;
    }
    
    try {
      const response = await sendMessage({
        type: MESSAGE_TYPES.TAB_ACTION,
        action: ACTION.TAB.SUSPEND_INACTIVE,
        payload: {}
      });
      
      if (response && response.success) {
        const count = response.suspendedCount || 0;
        logger.info(formatMessage(MESSAGES.TAB.SUSPENDED, { count }));
      }
      
      await loadTabs(); // Refresh UI after operation
    } catch (error) {
      logger.error('Failed to suspend tabs:', { error: error.message });
      setErrorMsg(error.message);
    }
  };

  const saveSession = async () => {
    const sessionName = prompt('Enter a name for this session:');
    if (!sessionName?.trim()) return;

    try {
      await sendMessage({
        type: MESSAGE_TYPES.SESSION_ACTION,
        action: ACTION.SESSION.SAVE,
        payload: { name: sessionName, timestamp: Date.now() }
      });
      
      await loadSessions();
      logger.info(formatMessage(MESSAGES.SESSION.SAVED, { name: sessionName }));
    } catch (error) {
      logger.error('Failed to save session:', { error: error.message });
      setErrorMsg(error.message);
    }
  };

  const loadSessions = async () => {
    try {
      const response = await sendMessage({
        type: MESSAGE_TYPES.GET_SESSIONS,
        payload: {}
      });
      
      // Normalize sessions: allow either array of strings or array of objects
      const raw = response.sessions || [];
      const normalized = raw.map(item => {
        if (typeof item === 'string') return item;
        if (item && typeof item === 'object') {
          // prefer 'name' or 'sessionName'
          return {
            name: item.name || item.sessionName || (item.title || undefined),
            timestamp: item.timestamp || item.createdAt || null,
            ...item
          };
        }
        return String(item);
      });

      setSessions(normalized);
    } catch (error) {
      // Log full error so we can see returned objects (some handlers return {error:...})
      logger.error('Failed to load sessions:', error);
      const msg = error?.message || (typeof error === 'object' ? JSON.stringify(error) : String(error));
      setErrorMsg(`Failed to load sessions: ${msg}`);
      setSessions([]);
    }
  };

  const restoreSession = async (session) => {
    // session may be a string (name) or an object {name, timestamp, tabs}
    const sessionName = typeof session === 'string' ? session : (session.name || session.sessionName || String(session));
    try {
      await sendMessage({
        type: MESSAGE_TYPES.SESSION_ACTION,
        action: ACTION.SESSION.RESTORE,
        payload: { sessionName }
      });

      logger.info(formatMessage(MESSAGES.SESSION.RESTORED, { name: sessionName }));
    } catch (error) {
      logger.error('Error restoring session:', { name: sessionName, error: error && error.message ? error.message : error });
    }
  };

  const handleTagSubmit = async (tag) => {
    if (!oldestTab) return;
    
    try {
      await sendMessage({
        type: MESSAGE_TYPES.TAB_ACTION,
        action: ACTION.TAB.TAG_AND_CLOSE,
        payload: { tabId: oldestTab.id, tag }
      });
      
      setIsTaggingPromptVisible(false);
      await loadTabs();
      logger.info(formatMessage(MESSAGES.TAB.TAGGED, { tag }));
    } catch (error) {
      logger.error(`Failed to tag tab:`, { error: error.message });
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
        {sessions.map((sessionItem, idx) => {
          const name = typeof sessionItem === 'string' ? sessionItem : (sessionItem.name || sessionItem.sessionName || `session-${idx}`);
          const key = typeof sessionItem === 'object' && (sessionItem.id || sessionItem.timestamp)
            ? `${name}-${sessionItem.id || sessionItem.timestamp}`
            : `${name}-${idx}`;

          return (
            <div key={key} className="session-item">
              <span className="session-name">{name}</span>
              <button
                onClick={() => restoreSession(sessionItem)}
                className="restore-button"
                aria-label={`Restore session: ${name}`}
              >
                Restore
              </button>
            </div>
          );
        })}
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