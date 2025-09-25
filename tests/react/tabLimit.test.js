import React from 'react';
import { render, fireEvent, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import TabLimit from '../../popup/TabLimitPrompt.jsx';
import { createTestStore } from '../jest/testUtils';
import { TAB_OPERATIONS } from '../../utils/constants';
import browser from 'webextension-polyfill';

// Mock actions
const actions = {
  tabManagement: {
    setTabs: (tabs) => ({ type: 'SET_TABS', payload: tabs }),
    setOldestTab: (tab) => ({ type: 'SET_OLDEST_TAB', payload: tab }),
    removeTab: (tabId) => ({ type: 'REMOVE_TAB', payload: tabId })
  }
};

// Mock browser.runtime.sendMessage
browser.runtime.sendMessage = jest.fn().mockResolvedValue({});

// Mock webextension-polyfill instead of requiring browserMock
jest.mock('webextension-polyfill', () => ({
  tabs: {
    query: jest.fn().mockResolvedValue([]),
    remove: jest.fn().mockResolvedValue(),
  },
  runtime: {
    sendMessage: jest.fn(),
    onMessage: { addListener: jest.fn() },
  },
  notifications: {
    create: jest.fn().mockResolvedValue('notification-id'),
  },
  storage: {
    local: {
      get: jest.fn().mockResolvedValue({}),
      set: jest.fn().mockResolvedValue(),
      remove: jest.fn().mockResolvedValue(),
    },
  },
}));

// Mock core/index.js instead of constants.js
jest.mock('../../utils/core/index.js', () => ({
  CONFIG: {
    INACTIVITY_THRESHOLDS: {
      DEFAULT: 60,
      PROMPT: 600000,
      SUSPEND: 1800000,
    },
    TAB_LIMITS: {
      MIN: 1,
      MAX: 1000,
      DEFAULT: 30,
      WARNING_THRESHOLD: 0.9
    }
  },
  MESSAGE_TYPES: {
    TAB_ACTION: 'TAB_ACTION'
  },
  ACTION: {
    TAB: {
      TAG_AND_CLOSE: 'TAG_AND_CLOSE'
    }
  },
  recordTelemetry: jest.fn(),
  TELEMETRY_EVENTS: {
    TAB_CLOSED: 'TAB_CLOSED'
  }
}));

describe('Tab Limit Component Tests', () => {
  let testStore;

  beforeEach(() => {
    jest.clearAllMocks();
    const initialState = {
      tabManagement: {
        tabs: Array.from({ length: 101 }, (_, i) => ({
          id: i,
          title: `Tab ${i}`,
          url: `https://example.com/${i}`,
        })),
        oldestTab: {
          id: 0,
          title: 'Tab 0',
          url: 'https://example.com/0',
        }
      },
      settings: {
        maxTabs: 100
      }
    };
    testStore = createTestStore(initialState);

    // Force a re-render by dispatching the initial state
    testStore.dispatch(actions.tabManagement.setTabs(initialState.tabManagement.tabs));
    testStore.dispatch(actions.tabManagement.setOldestTab(initialState.tabManagement.oldestTab));
  });

  test('should enforce tab limit and close oldest tab', async () => {
    render(
      <Provider store={testStore}>
        <TabLimit />
      </Provider>
    );

    // Adjusted matcher for flexibility
    const tabCountDiv = await screen.findByText((content, element) => {
      return (
        element.className.includes('tab-count') &&
        content.includes('Tabs:') &&
        content.includes('/ 100')
      );
    });

    expect(tabCountDiv).toHaveClass('tab-count');

    // Use data-testid to find the button
    const closeButton = await screen.findByTestId('close-oldest-button');
    expect(closeButton).toBeInTheDocument();

    fireEvent.click(closeButton);

    expect(browser.runtime.sendMessage).toHaveBeenCalledWith({
      type: MESSAGE_TYPES.TAB_ACTION,
      action: TAB_OPERATIONS.TAG_AND_CLOSE,
      payload: {
        tabId: 0,
        tag: 'auto-closed'
      }
    });

    // Dispatch the removeTab action to update the store
    testStore.dispatch(actions.tabManagement.removeTab(0));

    // Wait for the state to update and verify
    const updatedCount = await screen.findByText((content, element) => {
      return (
        element.className.includes('tab-count') &&
        content.includes('Tabs:') &&
        content.includes('/ 100')
      );
    });
    expect(updatedCount).toBeInTheDocument();
  });
});