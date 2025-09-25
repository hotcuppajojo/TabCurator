// popup/TabLimitPrompt.jsx
import React from 'react';
import { useSelector, useDispatch } from 'react-redux';
import browser from 'webextension-polyfill';
import { 
  MESSAGE_TYPES, 
  ACTION,
  recordTelemetry,
  TELEMETRY_EVENTS
} from '../utils/core/index.js';
import connectionManager from '../utils/connectionManager.js';
import { logger } from '../utils/logger.js';

const TabLimitPrompt = () => {
  const dispatch = useDispatch();
  const tabs = useSelector(state => state.tabManagement.tabs);
  const settings = useSelector(state => state.settings);
  const oldestTab = useSelector(state => state.tabManagement.oldestTab);

  const handleCloseOldest = async () => {
    if (!oldestTab) return;

    try {
      await connectionManager.sendMessage({
        type: MESSAGE_TYPES.TAB_ACTION,
        action: ACTION.TAB.TAG_AND_CLOSE,
        payload: {
          tabId: oldestTab.id,
          tag: 'auto-closed'
        }
      });

      // Record telemetry for tab auto-closing
      recordTelemetry(TELEMETRY_EVENTS.TAB_CLOSED, {
        reason: 'tab-limit',
        tabId: oldestTab.id
      });

      // Show notification
      await browser.notifications.create({
        type: 'basic',
        title: 'Tab Limit Reached',
        message: 'The oldest tab has been closed to enforce the tab limit.',
        iconUrl: 'icon-48.png'
      });
    } catch (error) {
      logger.error('Failed to close oldest tab:', { error: error.message });
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
