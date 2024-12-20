// src/options/options.jsx
import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom';
import browser from 'webextension-polyfill';
import './options.css';

import { store, actions } from '../utils/stateManager'; // If Redux integration is still needed
import { CONFIG, TAB_LIMITS } from '../utils/constants'; // For limits and defaults

export default function Options() {
  const [inactiveThreshold, setInactiveThreshold] = useState(60);
  const [tabLimit, setTabLimit] = useState(100);
  const [rules, setRules] = useState([]);
  const [saveSuccessVisible, setSaveSuccessVisible] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    loadOptions();
  }, []);

  const loadOptions = async () => {
    try {
      setErrorMsg('');
      const items = await browser.storage.sync.get(['inactiveThreshold', 'tabLimit', 'rules']);
      setInactiveThreshold(items.inactiveThreshold ?? 60);
      setTabLimit(items.tabLimit ?? 100);
      setRules(items.rules || []);
    } catch (error) {
      console.error('Error loading options:', error);
      setErrorMsg('Error loading options.');
    }
  };

  const handleSaveOptions = async () => {
    try {
      const inactiveVal = parseInt(inactiveThreshold, 10);
      const tabLimitVal = Math.min(Math.max(parseInt(tabLimit, 10), TAB_LIMITS.MIN), TAB_LIMITS.MAX);

      await browser.storage.sync.set({ inactiveThreshold: inactiveVal, tabLimit: tabLimitVal });
      
      // Optionally dispatch something to the store if needed:
      // store.dispatch(actions.settings.updateSettings({ inactivityThreshold: inactiveVal, maxTabs: tabLimitVal }));

      showSaveSuccess();
    } catch (error) {
      console.error('Error saving options:', error);
      setErrorMsg('Error saving options.');
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
        setErrorMsg('Please fill out all rule fields.');
        return;
      }

      await browser.storage.sync.set({ rules });
      await browser.runtime.sendMessage({ action: 'updateRules', rules });
      showSaveSuccess();
    } catch (error) {
      console.error('Error saving rules:', error);
      setErrorMsg('Error saving rules.');
    }
  };

  return (
    <div className="options-container">
      <h1>TabCurator Options</h1>
      {errorMsg && <div className="error-message">{errorMsg}</div>}

      <div className="setting-group">
        <label htmlFor="inactiveThreshold">Inactive Threshold (minutes):</label>
        <input
          type="number"
          id="inactiveThreshold"
          value={inactiveThreshold}
          onChange={(e) => setInactiveThreshold(e.target.value)}
          min="1"
        />
      </div>

      <div className="setting-group">
        <label htmlFor="tabLimit">Maximum Tabs:</label>
        <input
          type="number"
          id="tabLimit"
          value={tabLimit}
          onChange={(e) => setTabLimit(e.target.value)}
          min={TAB_LIMITS.MIN}
          max={TAB_LIMITS.MAX}
        />
        <span className="setting-hint">
          Limit: {TAB_LIMITS.MIN} - {TAB_LIMITS.MAX} tabs
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

ReactDOM.render(<Options />, document.getElementById('root'));
