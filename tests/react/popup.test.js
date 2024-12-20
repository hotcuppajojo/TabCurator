import React from 'react';
import { render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { store } from '../../utils/stateManager.js';
import MockPopup from './MockPopup'; // Ensure MockPopup is correctly imported
import { createTestStore } from '../jest/testUtils';

// Mock browser.storage.local
jest.mock('webextension-polyfill', () => ({
  storage: {
    local: {
      get: jest.fn().mockResolvedValue({}),
      set: jest.fn().mockResolvedValue(),
      remove: jest.fn().mockResolvedValue(),
    },
  },
  runtime: {
    sendMessage: jest.fn(),
    onMessage: {
      addListener: jest.fn(),
    },
  },
}));

// Mock CONFIG and other constants
jest.mock('../../utils/constants.js', () => ({
  CONFIG: {
    INACTIVITY_THRESHOLDS: {
      DEFAULT: 60,
      PROMPT: 600000,
      SUSPEND: 1800000,
    }
  },
  SERVICE_TYPES: {
    WORKER: 'WORKER',
    CONTENT: 'CONTENT',
    POPUP: 'POPUP',
    BACKGROUND: 'BACKGROUND'
  },
  ACTION_TYPES: {
    STATE: {
      RESET: 'RESET_STATE',
      INITIALIZE: 'INITIALIZE_STATE',
      RECOVER: 'RECOVER_STATE',
      SYNC: 'SYNC_STATE'
    },
    TAB: {
      ARCHIVE: 'ARCHIVE_TAB',
      UPDATE_ACTIVITY: 'UPDATE_TAB_ACTIVITY'
    }
  },
  TAB_STATES: {
    ACTIVE: 'ACTIVE',
    SUSPENDED: 'SUSPENDED',
    ARCHIVED: 'ARCHIVED'
  },
  MESSAGE_TYPES: {
    STATE_SYNC: 'STATE_SYNC',
    STATE_UPDATE: 'STATE_UPDATE'
  },
  VALIDATION_TYPES: {
    TAB: {
      required: ['id', 'url']
    }
  },
  BATCH_CONFIG: {
    DEFAULT_SIZE: 10,
    MAX_SIZE: 100
  },
  selectors: {
    selectTabs: state => state.tabs,
    selectTabActivity: state => state.tabActivity
  },
  VALIDATION_ERRORS: {
    INVALID_MESSAGE: 'Invalid Message'
  }
}));

describe('Popup Component', () => {
  let testStore;

  beforeEach(() => {
    testStore = createTestStore();
  });

  test('renders without crashing', () => {
    render(
      <Provider store={testStore}>
        <MockPopup />
      </Provider>
    );
    
    expect(screen.getByTestId('mock-popup')).toBeInTheDocument();
    expect(screen.getByText('TabCurator')).toBeInTheDocument();
    expect(screen.getByText('Open Tabs: 0')).toBeInTheDocument();
  });
});