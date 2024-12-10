// src/utils/stateManager.js
/**
 * @fileoverview Unified state and session management.
 */

// Use require instead of import for better compatibility with Jest
const browser = require('webextension-polyfill');

// Add SET_ARCHIVED_TABS action type
const SET_ARCHIVED_TABS = 'SET_ARCHIVED_TABS';
const RESET_STATE = 'RESET_STATE';

// Define the initial state
const initialState = {
  archivedTabs: {}, // Stores archived tabs organized by tags
  tabActivity: {}, // Tracks the last activity timestamp of tabs
  actionHistory: [], // Tracks actions performed for undo/redo purposes
  savedSessions: {}, // Stores saved tab sessions for later restoration
  isTaggingPromptActive: false, // Tracks whether the tagging prompt is active
};

/**
 * Reducer function
 * Handles state transitions based on dispatched actions.
 * @param {Object} state - The current state object.
 * @param {Object} action - The action object containing the type and payload.
 * @returns {Object} The new state object after applying the action.
 */
function rootReducer(state = initialState, action) {
  switch (action.type) {
    case 'RESET_STATE':
      return { ...initialState };

    case 'SET_TAGGING_PROMPT_ACTIVE':
      return { ...state, isTaggingPromptActive: action.value };

    case 'UPDATE_TAB_ACTIVITY':
      return {
        ...state,
        tabActivity: {
          ...state.tabActivity,
          [action.tabId]: action.timestamp,
        },
      };

    case 'ARCHIVE_TAB': {
      const { tag, tabData } = action;
      const updatedArchivedTabs = { ...state.archivedTabs };
      if (!updatedArchivedTabs[tag]) {
        updatedArchivedTabs[tag] = [];
      }
      // Prevent duplicate entries
      const exists = updatedArchivedTabs[tag].some(tab => tab.url === tabData.url);
      if (!exists) {
        updatedArchivedTabs[tag].push(tabData);
      }
      return {
        ...state,
        archivedTabs: updatedArchivedTabs,
        actionHistory: [...state.actionHistory, { type: 'archive', tab: tabData, tag }],
      };
    }

    case 'UNDO_LAST_ACTION': {
      const lastAction = state.actionHistory[state.actionHistory.length - 1];
      if (lastAction?.type === 'archive') {
        const updatedArchivedTabs = { ...state.archivedTabs };
        updatedArchivedTabs[lastAction.tag] = updatedArchivedTabs[lastAction.tag].filter(
          (tab) => tab.url !== lastAction.tab.url
        );
        return {
          ...state,
          archivedTabs: updatedArchivedTabs,
          actionHistory: state.actionHistory.slice(0, -1), // Remove the undone action
        };
      }
      return state; // If no action to undo, return unchanged state
    }

    case SET_ARCHIVED_TABS:
      return {
        ...state,
        archivedTabs: action.archivedTabs,
      };

    case 'INITIALIZE_STATE':
      return {
        ...state,
        archivedTabs: action.archivedTabs,
        // Add other state slices if necessary
      };

    case 'SAVE_SESSION':
      return {
        ...state,
        savedSessions: {
          ...state.savedSessions,
          [action.sessionName]: action.sessionTabs
        }
      };

    case 'DELETE_SESSION': {
      const updatedSessions = { ...state.savedSessions };
      delete updatedSessions[action.sessionName];
      return {
        ...state,
        savedSessions: updatedSessions
      };
    }
    
    case 'UPDATE_RULES':
      return { ...state, rules: action.rules };

    default:
      // Don't warn for test actions
      if (!action.type.startsWith('test_')) {
        console.warn(`Unhandled action type: ${action.type}`);
      }
      return state;
  }
}

// Create the Store class
class Store {
  constructor(reducer, initialState) {
    this.reducer = reducer;
    this.state = initialState;
    this.listeners = [];
  }

  /**
   * Dispatches an action to update the state.
   * @param {Object} action - The action to dispatch.
   */
  dispatch(action) {
    this.state = this.reducer(this.state, action);
    this.listeners.forEach((listener) => listener());
  }

  /**
   * Retrieves the current state.
   * @returns {Object} The current state.
   */
  getState() {
    return this.state;
  }

  /**
   * Subscribes a listener to state changes.
   * @param {Function} listener - The listener function to call on updates.
   * @returns {Function} A function to unsubscribe the listener.
   */
  subscribe(listener) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }
}

// Create the store
export const store = new Store(rootReducer, initialState);

/**
 * Retrieves whether the tagging prompt is currently active.
 * @returns {boolean} True if the tagging prompt is active, false otherwise.
 */
export function getIsTaggingPromptActive() {
  return store.getState().isTaggingPromptActive;
}

/**
 * Retrieves the archived tabs.
 * @returns {Object} The archived tabs grouped by tags.
 */
export function getArchivedTabs() {
  return store.getState().archivedTabs;
}

/**
 * Retrieves the tab activity state.
 * @returns {Object} The tab activity map with timestamps.
 */
export function getTabActivity() {
  return store.getState().tabActivity;
}

/**
 * Retrieves the action history.
 * @returns {Object[]} The history of actions performed.
 */
export function getActionHistory() {
  return store.getState().actionHistory;
}

/**
 * Retrieves the saved sessions.
 * @returns {Object} The saved tab sessions.
 */
export function getSavedSessions() {
  return store.getState().savedSessions;
}

/**
 * Sets the tagging prompt's active status.
 * @param {boolean} value - True to activate the prompt, false to deactivate it.
 * @throws {Error} If value is not a boolean
 */
export function setIsTaggingPromptActive(value) {
  if (typeof value !== 'boolean') {
    throw new Error('Value must be a boolean');
  }
  store.dispatch({ type: 'SET_TAGGING_PROMPT_ACTIVE', value });
}

/**
 * Updates the tab activity state.
 * @param {number} tabId - The ID of the tab to update.
 * @param {number} timestamp - The timestamp of the last activity.
 * @throws {Error} If tabId is not a number or timestamp is invalid
 */
export function updateTabActivity(tabId, timestamp) {
  if (typeof tabId !== 'number' || !tabId) {
    throw new Error('Tab ID must be a valid number');
  }
  if (!timestamp || isNaN(timestamp)) {
    throw new Error('Timestamp must be a valid number');
  }
  store.dispatch({ type: 'UPDATE_TAB_ACTIVITY', tabId, timestamp });
}

/**
 * Archives a tab under a specified tag.
 * @param {number} tabId - The ID of the tab to archive.
 * @param {string} tag - The tag to group the tab under.
 * @param {Object} tabData - The tab data to archive.
 * @throws {Error} If any parameters are invalid
 */
export function archiveTab(tabId, tag, tabData) {
  if (typeof tabId !== 'number' || !tabId) {
    throw new Error('Tab ID must be a valid number');
  }
  if (!tag || typeof tag !== 'string') {
    throw new Error('Tag must be a non-empty string');
  }
  if (!tabData || typeof tabData !== 'object') {
    throw new Error('Tab data must be a valid object');
  }
  store.dispatch({ type: 'ARCHIVE_TAB', tabId, tag, tabData });
}

/**
 * Undoes the last action in the action history.
 */
export function undoLastAction() {
  store.dispatch({ type: 'UNDO_LAST_ACTION' });
}

/**
 * Initializes the state from browser storage.
 * Retrieves data from storage and updates the state.
 * @returns {Promise<void>} 
 */
export async function initializeStateFromStorage() {
  try {
    const data = await browser.storage.sync.get(['archivedTabs']);
    const archivedTabs = data.archivedTabs || {};
    store.dispatch({
      type: 'INITIALIZE_STATE',
      archivedTabs: archivedTabs,
    });
  } catch (error) {
    console.error('Error initializing state from storage:', error);
    store.dispatch({
      type: 'INITIALIZE_STATE',
      archivedTabs: {},
    });
  }
}

/**
 * Updates rules in storage and state.
 * @param {Array} rules - Array of rule objects to update.
 * @param {object} browserInstance - Browser API instance.
 */
export async function updateRulesHandler(rules, browserInstance) {
  try {
    store.dispatch({ type: 'UPDATE_RULES', rules });
    await browserInstance.storage.sync.set({ rules });
    console.log("Rules updated successfully.");
  } catch (error) {
    console.error("Error updating rules:", error);
  }
}

// Add session management functions
export async function saveSessionHandler(sessionName, browserInstance) {
  try {
    const tabs = await browserInstance.tabs.query({ currentWindow: true });
    const sessionTabs = tabs.map(({ title, url }) => ({ title, url }));
    store.dispatch({ type: 'SAVE_SESSION', sessionName, sessionTabs });
    await browserInstance.storage.sync.set({ 
      savedSessions: store.getState().savedSessions 
    });
    console.log(`Session '${sessionName}' saved with ${sessionTabs.length} tabs.`);
  } catch (error) {
    console.error(`Error saving session '${sessionName}':`, error);
    throw error;
  }
}

export async function restoreSessionHandler(sessionName, browserInstance) {
  const sessionTabs = store.getState().savedSessions[sessionName];
  if (!sessionTabs) {
    throw new Error(`Session '${sessionName}' not found`);
  }

  try {
    for (const tab of sessionTabs) {
      await browserInstance.tabs.create({ url: tab.url });
    }
    console.log(`Session '${sessionName}' restored successfully.`);
  } catch (error) {
    console.error(`Error restoring session '${sessionName}':`, error);
    throw error;
  }
}

export async function getSessions(browserInstance) {
  try {
    const data = await browserInstance.storage.sync.get('savedSessions');
    return data.savedSessions || store.getState().savedSessions || {};
  } catch (error) {
    console.error("Error retrieving sessions:", error);
    return {};
  }
}

export async function deleteSessionHandler(sessionName, browserInstance) {
  try {
    const sessions = await getSessions(browserInstance);
    if (!sessions[sessionName]) {
      throw new Error(`Session '${sessionName}' not found`);
    }

    delete sessions[sessionName];
    await browserInstance.storage.sync.set({ savedSessions: sessions });
    store.dispatch({ type: 'DELETE_SESSION', sessionName });
    console.log(`Session '${sessionName}' deleted.`);
  } catch (error) {
    console.error(`Error deleting session '${sessionName}':`, error);
    throw error;
  }
}