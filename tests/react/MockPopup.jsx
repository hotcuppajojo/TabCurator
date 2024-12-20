// tests/jest/react/MockPopup.jsx

import React from 'react';
import { useSelector } from 'react-redux';

const MockPopup = () => {
  const tabs = useSelector(state => state?.tabManagement?.tabs ?? []);
  
  return (
    <div data-testid="mock-popup">
      <h1>TabCurator</h1>
      <div className="tab-count">Open Tabs: {tabs.length}</div>
      <button>Settings</button>
    </div>
  );
};

export default MockPopup;
