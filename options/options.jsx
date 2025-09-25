// src/options/options.jsx
import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom';
import browser from 'webextension-polyfill';
import './options.css';

import { Provider, useDispatch, useSelector } from 'react-redux';
import stateManager from '../utils/stateManager.js';
import connectionManager from '../utils/connectionManager.js';
import { 
  CONFIG, 
  MESSAGE_TYPES, 
  ACTION, 
  selectors,
  formatMessage,
  MESSAGES,
  recordTelemetry,
  TELEMETRY_EVENTS
} from '../utils/core/index.js';
import { logger } from '../utils/logger.js';

function Options() {
  const dispatch = useDispatch();
  const settings = useSelector(state => selectors.selectSettings(state));
  const [connected, setConnected] = useState(false);
  const [connectionId, setConnectionId] = useState(null);

  const [inactiveThreshold, setInactiveThreshold] = useState(
    settings?.inactivityThreshold || CONFIG.INACTIVITY_THRESHOLDS.DEFAULT
  );
  const [tabLimit, setTabLimit] = useState(
    settings?.maxTabs || CONFIG.TAB_LIMITS.DEFAULT
  );
  const [rules, setRules] = useState([]);
  const [saveSuccessVisible, setSaveSuccessVisible] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Connect to background service worker on component mount
  useEffect(() => {
    const initConnection = async () => {
      try {
        const connection = await connectionManager.connect();
        setConnectionId(connection.connectionId);
        setConnected(true);
        logger.info('Options page connected to background service worker');
      } catch (error) {
        logger.error('Failed to connect to background', { error: error.message });
        setErrorMsg('Failed to connect to extension background service');
      }
    };
    
    initConnection();
    
    return () => {
      // Clean up connection when component unmounts
      if (connectionId) {
        connectionManager.cleanup();
      }
    };
  }, []);

  // Load settings from state
  useEffect(() => {
    loadOptions();
  }, [connected]);

  const loadOptions = async () => {
    try {
      setErrorMsg('');
      
      // First try to get fresh settings from state manager
      if (connected && connectionId) {
        const response = await connectionManager.sendMessage({
          type: MESSAGE_TYPES.CONFIG_UPDATE,
          action: ACTION.STATE.SYNC,
          payload: {}
        });
        
        if (response && response.settings) {
          setInactiveThreshold(response.settings.inactivityThreshold || CONFIG.INACTIVITY_THRESHOLDS.DEFAULT);
          setTabLimit(response.settings.maxTabs || CONFIG.TAB_LIMITS.DEFAULT);
          return;
        }
      }
      
      // Fallback to stored settings if necessary
      const items = await browser.storage.local.get(['settings', 'rules']);
      setInactiveThreshold(items.settings?.inactivityThreshold || CONFIG.INACTIVITY_THRESHOLDS.DEFAULT);
      setTabLimit(items.settings?.maxTabs || CONFIG.TAB_LIMITS.DEFAULT);
      setRules(items.rules || []);
    } catch (error) {
      logger.error('Error loading options', { error: error.message });
      setErrorMsg('Error loading options');
    }
  };

  const handleSaveOptions = async () => {
    try {
      // Parse and validate values
      const inactiveVal = parseInt(inactiveThreshold, 10);
      const tabLimitVal = Math.min(
        Math.max(parseInt(tabLimit, 10), CONFIG.TAB_LIMITS.MIN), 
        CONFIG.TAB_LIMITS.MAX
      );
      
      const updatedSettings = { 
        inactivityThreshold: inactiveVal, 
        maxTabs: tabLimitVal 
      };
  
      // 1. Update Redux store through stateManager
      dispatch(stateManager.actions.settings.updateSettings(updatedSettings));
      
      // 2. Notify background through connectionManager
      if (connected && connectionId) {
        await connectionManager.sendMessage({
          type: MESSAGE_TYPES.CONFIG_UPDATE,
          payload: updatedSettings
        });
      }
      
      // 3. Save to browser storage as backup
      await browser.storage.local.set({ 
        settings: updatedSettings
      });
      
      // Record telemetry
      recordTelemetry(TELEMETRY_EVENTS.SETTINGS_UPDATED, updatedSettings);
      
      // Show success message
      showSaveSuccess();
    } catch (error) {
      logger.error('Error saving options', { error: error.message });
      setErrorMsg('Error saving options');
    }
  };

  const showSaveSuccess = () => {
    setSaveSuccessVisible(true);
    setTimeout(() => setSaveSuccessVisible(false), 2000);
  };

  const addRule = () => {
    setRules([...rules, { condition: '', action: '' }]);
  };

  const updateRule = (index, field, value) => {
    const newRules = [...rules];
    newRules[index][field] = value;
    setRules(newRules);
  };

  const deleteRule = (index) => {
    if (confirm('Are you sure you want to delete this rule?')) {
      const newRules = [...rules];
      newRules.splice(index, 1);
      setRules(newRules);
    }
  };

  const validateInput = (value) => {
    return value.trim().length > 0;
  };

  const handleSaveRules = async () => {
    try {
      let hasErrors = false;
      
      for (const rule of rules) {
        if (!validateInput(rule.condition) || !validateInput(rule.action)) {
          hasErrors = true;
          break;
        }
      }

      if (hasErrors) {
        setErrorMsg('Please fill out all rule fields');
        return;
      }

      // Save rules to storage
      await browser.storage.local.set({ rules });
      
      // Update rules through connectionManager
      if (connected && connectionId) {
        await connectionManager.sendMessage({
          type: MESSAGE_TYPES.RULE_UPDATE,
          action: ACTION.RULES.UPDATE,
          payload: { rules }
        });
      }
      
      showSaveSuccess();
    } catch (error) {
      logger.error('Error saving rules', { error: error.message });
      setErrorMsg('Error saving rules');
    }
  };

  return (
    <div className="options-container">
      <h1>TabCurator Options</h1>
      {errorMsg && <div className="error-message">{errorMsg}</div>}
      {!connected && <div className="connection-warning">Not connected to background service</div>}

      <div className="setting-group">
        <label htmlFor="inactiveThreshold">Inactive Threshold (minutes):</label>
        <input
          type="number"
          id="inactiveThreshold"
          value={inactiveThreshold}
          onChange={(e) => setInactiveThreshold(e.target.value)}
          min="1"
        />
        <span className="setting-hint">
          Time before tabs are considered inactive
        </span>
      </div>

      <div className="setting-group">
        <label htmlFor="tabLimit">Maximum Tabs:</label>
        <input
          type="number"
          id="tabLimit"
          value={tabLimit}
          onChange={(e) => setTabLimit(e.target.value)}
          min={CONFIG.TAB_LIMITS.MIN}
          max={CONFIG.TAB_LIMITS.MAX}
        />
        <span className="setting-hint">
          Limit: {CONFIG.TAB_LIMITS.MIN} - {CONFIG.TAB_LIMITS.MAX} tabs
        </span>
      </div>

      <button id="save-options" onClick={handleSaveOptions}>Save Options</button>

      <h2>Rules</h2>
      <div id="rulesList">
        {rules.map((rule, index) => (
          <div key={index} className="rule-item">
            <input
              type="text"
              className={`rule-condition ${!validateInput(rule.condition) ? 'invalid' : ''}`}
              placeholder='Condition (e.g. "example.com")'
              value={rule.condition}
              onChange={(e) => updateRule(index, 'condition', e.target.value)}
              aria-label="Rule Condition"
            />
            <input
              type="text"
              className={`rule-action ${!validateInput(rule.action) ? 'invalid' : ''}`}
              placeholder='Action (e.g. "Tag: Research")'
              value={rule.action}
              onChange={(e) => updateRule(index, 'action', e.target.value)}
              aria-label="Rule Action"
            />
            <button aria-label="Delete Rule" onClick={() => deleteRule(index)}>Delete</button>
          </div>
        ))}
      </div>
      <button id="addRuleButton" onClick={addRule}>Add Rule</button>
      <button id="saveRulesButton" onClick={handleSaveRules}>Save Rules</button>

      <div id="save-success" className={saveSuccessVisible ? 'visible' : ''}>
        Settings saved successfully!
      </div>
    </div>
  );
}

// Render with proper Provider
ReactDOM.render(
  <Provider store={stateManager.store}>
    <Options />
  </Provider>,
  document.getElementById('root')
);