// src/options/options.jsx

import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom';
import browser from 'webextension-polyfill';

function Options() {
  const [inactiveThreshold, setInactiveThreshold] = useState(60);
  const [tabLimit, setTabLimit] = useState(100);
  const [rules, setRules] = useState([]);

  useEffect(() => {
    async function loadOptions() {
      try {
        const { inactiveThreshold = 60, tabLimit = 100 } = await browser.storage.sync.get(['inactiveThreshold', 'tabLimit']);
        setInactiveThreshold(inactiveThreshold);
        setTabLimit(tabLimit);
      } catch (error) {
        console.error('Error loading options:', error.message);
        alert('Failed to load options.');
      }
    }

    async function loadRules() {
      try {
        const { rules = [] } = await browser.storage.sync.get('rules');
        setRules(rules);
      } catch (error) {
        console.error('Error loading rules:', error.message);
      }
    }

    loadOptions();
    loadRules();
  }, []);

  const saveOptions = async () => {
    try {
      await browser.storage.sync.set({ inactiveThreshold, tabLimit });
      alert('Options saved successfully!');
    } catch (error) {
      console.error('Error saving options:', error.message);
      alert('Failed to save options. Please try again.');
    }
  };

  const addRule = () => {
    setRules([...rules, { condition: '', action: '' }]);
  };

  const updateRule = (index, key, value) => {
    const newRules = [...rules];
    newRules[index][key] = value;
    setRules(newRules);
  };

  const deleteRule = (index) => {
    const newRules = rules.filter((_, i) => i !== index);
    setRules(newRules);
  };

  const saveRules = async () => {
    try {
      await browser.storage.sync.set({ rules });
      alert('Rules saved successfully!');
      await browser.runtime.sendMessage({ action: 'updateRules', rules });
    } catch (error) {
      console.error('Error saving rules:', error.message);
    }
  };

  return (
    <div className="options-container">
      <h1>TabCurator Options</h1>
      <div>
        <label htmlFor="inactiveThreshold">Inactivity threshold (minutes):</label>
        <input
          type="number"
          id="inactiveThreshold"
          min="1"
          value={inactiveThreshold}
          onChange={(e) => setInactiveThreshold(parseInt(e.target.value, 10))}
        />
      </div>
      <div>
        <label htmlFor="tabLimit">Maximum Number of Tabs:</label>
        <input
          type="number"
          id="tabLimit"
          min="1"
          value={tabLimit}
          onChange={(e) => setTabLimit(parseInt(e.target.value, 10))}
        />
      </div>
      <button onClick={saveOptions}>Save</button>
      <h2>Manage Rules</h2>
      <div id="rulesList">
        {rules.map((rule, index) => (
          <div key={index} className="rule-item">
            <input
              type="text"
              className="rule-condition"
              placeholder='Condition (e.g., "example.com")'
              value={rule.condition}
              onChange={(e) => updateRule(index, 'condition', e.target.value)}
            />
            <input
              type="text"
              className="rule-action"
              placeholder='Action (e.g., "Tag: Research")'
              value={rule.action}
              onChange={(e) => updateRule(index, 'action', e.target.value)}
            />
            <button onClick={() => deleteRule(index)}>Delete</button>
          </div>
        ))}
      </div>
      <button onClick={addRule}>Add Rule</button>
      <button onClick={saveRules}>Save Rules</button>
    </div>
  );
}

ReactDOM.render(<Options />, document.getElementById('root'));