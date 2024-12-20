// popup/TabLimitPrompt.jsx
import React from 'react';
import { useSelector, useDispatch } from 'react-redux';
import browser from 'webextension-polyfill';
import { TAB_OPERATIONS } from '../utils/constants';
import { actions } from '../utils/stateManager.js'; // Adjust the import path if necessary

const TabLimitPrompt = () => {
  const dispatch = useDispatch();
  const tabs = useSelector(state => state.tabManagement.tabs);
  const settings = useSelector(state => state.settings);
  const oldestTab = useSelector(state => state.tabManagement.oldestTab);

  const handleCloseOldest = async () => {
    if (!oldestTab) return;

    try {
      await browser.runtime.sendMessage({
        type: 'TAB_ACTION',
        action: TAB_OPERATIONS.TAG_AND_CLOSE,
        payload: {
          tabId: oldestTab.id,
          tag: 'auto-closed'
        }
      });

      dispatch(actions.tabManagement.removeTab(oldestTab.id));

      // Show notification
      await browser.notifications.create({
        type: 'basic',
        title: 'Tab Limit Reached',
        message: 'The oldest tab has been closed to enforce the tab limit.',
        iconUrl: 'icon-48.png'
      });
    } catch (error) {
      console.error('Failed to close oldest tab:', error);
    }
  };

  const isOverLimit = (tabs?.length || 0) > (settings?.maxTabs || 100);
  const tabCountClass = `tab-count ${isOverLimit ? 'warning' : ''}`;

  return (
    <div className="tab-limit-container" data-testid="tab-limit-container">
      <div className={tabCountClass}>
        Tabs: {tabs?.length || 0} / {settings?.maxTabs || 100}
      </div>
      {isOverLimit && oldestTab && (
        <button 
          onClick={handleCloseOldest}
          aria-label="Close Oldest Tab"
          type="button"
          className="close-tab-button"
          data-testid="close-oldest-button"
        >
          Close Oldest Tab
        </button>
      )}
    </div>
  );
};

export { TabLimitPrompt };
export default TabLimitPrompt;
