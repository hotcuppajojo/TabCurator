// src/options/options.jsx

import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom';
import browser from 'webextension-polyfill';

console.log('Options component mounted.');
function Options() {
  const [inactiveThreshold, setInactiveThreshold] = useState(60);
  const [tabLimit, setTabLimit] = useState(100);
  const [rules, setRules] = useState([]);
  const [savedSessions, setSavedSessions] = useState({});
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    loadOptions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadOptions = async () => {
    try {
      setErrorMsg('');
      const data = await browser.storage.sync.get(['inactiveThreshold', 'tabLimit', 'rules', 'savedSessions']);
      setInactiveThreshold(data.inactiveThreshold || 60);
      setTabLimit(data.tabLimit || 100);
      setRules(data.rules || []);
      setSavedSessions(data.savedSessions || {});
    } catch (error) {
      console.error('Error loading options:', error);
      setErrorMsg('Error loading options');
    }
  };

  return (
    <div className="options-container">
      <h1>Options</h1>
      {/* Add your options UI here */}
      {errorMsg && <div className="error-message">{errorMsg}</div>}
    </div>
  );
}

ReactDOM.render(<Options />, document.getElementById('root'));