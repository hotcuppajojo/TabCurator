// utils/core/action.js
/**
 * @fileoverview Defines and exports the `ACTION` object, which serves as a centralized 
 * source of truth for all action constants used across the application. These actions 
 * include managing rules, sessions, application state, tabs, and tags.
 *
 * The actions align with the `browser.tabs` polyfill API methods, providing consistent 
 * abstraction for tab-related operations.
 *
 * @module utils/core/action
 */
/**
 * Centralized object for action constants used throughout the application.
 *
 * Actions are categorized by their functionality:
 * - `RULES`: Actions related to managing rules.
 * - `SESSION`: Actions for managing sessions.
 * - `STATE`: Actions for handling application state.
 * - `TAB`: Actions for managing browser tabs, including API-based methods, listeners, and zoom operations.
 * - `TAG`: Actions for managing tags associated with tabs or other entities.
 *
 * Tab actions include mappings to the `browser.tabs` polyfill API for cross-browser compatibility.
 *
 * @constant {Object} ACTION
 * @property {Object} RULES - Actions related to rule management.
 * @property {string} RULES.UPDATE - Action to update existing rules.
 * @property {string} RULES.ACTIVATE - Action to activate rules.
 * @property {string} RULES.DEACTIVATE - Action to deactivate rules.
 *
 * @property {Object} SESSION - Actions for managing sessions.
 * @property {string} SESSION.DELETE - Action to delete a session.
 * @property {string} SESSION.RESTORE - Action to restore a session.
 * @property {string} SESSION.SAVE - Action to save a session.
 *
 * @property {Object} STATE - Actions for managing application state.
 * @property {string} STATE.INITIALIZE - Action to initialize the state.
 * @property {string} STATE.RECOVER - Action to recover the state.
 * @property {string} STATE.RESET - Action to reset the state.
 * @property {string} STATE.SYNC - Action to synchronize the state.
 *
 * @property {Object} TAB - Actions for managing browser tabs.
 * @property {string} TAB.CAPTURE - Call `browser.tabs.captureVisibleTab(windowId?, options?)` to capture the visible area of the active tab.
 * @property {string} TAB.CURRENT - Call `browser.tabs.getCurrent()` to retrieve the currently active tab.
 * @property {string} TAB.CREATE - Call `browser.tabs.create(createProperties)` to create a new tab.
 * @property {string} TAB.DISCARD - Call `browser.tabs.discard(tabId?)` to discard a tab and free up resources.
 * @property {string} TAB.DUPLICATE - Call `browser.tabs.duplicate(tabId)` to duplicate a tab.
 * @property {string} TAB.GET - Call `browser.tabs.get(tabId)` to retrieve details of a specific tab.
 * @property {string} TAB.GROUP - Call `browser.tabs.group(options)` to group tabs.
 * @property {string} TAB.HIGHLIGHT - Call `browser.tabs.highlight(highlightInfo)` to highlight specified tabs.
 * @property {string} TAB.MESSAGE - Call `browser.tabs.sendMessage(tabId, message, options?)` to send a message to a tab's content script.
 * @property {string} TAB.MOVE - Call `browser.tabs.move(tabIds, moveProperties)` to move tabs within a window.
 * @property {string} TAB.LANGUAGE - Call `browser.tabs.detectLanguage(tabId?)` to detect the primary language of a tab.
 * @property {string} TAB.QUERY - Call `browser.tabs.query(queryInfo)` to query tabs based on criteria.
 * @property {string} TAB.RELOAD - Call `browser.tabs.reload(tabId?, reloadProperties?)` to reload a tab.
 * @property {string} TAB.REMOVE - Call `browser.tabs.remove(tabIds)` to close one or more tabs.
 * @property {string} TAB.UNGROUP - Call `browser.tabs.ungroup(tabIds)` to ungroup tabs.
 * @property {string} TAB.UPDATE - Call `browser.tabs.update(tabId, updateProperties)` to update tab properties.
 *
 * @property {Object} TAB.LISTEN - Tab-related listener actions.
 * @property {string} TAB.LISTEN.ACTIVATED - Call `browser.tabs.onActivated.addListener(callback)` to listen for tab activation.
 * @property {string} TAB.LISTEN.CREATED - Call `browser.tabs.onCreated.addListener(callback)` to listen for tab creation.
 * @property {string} TAB.LISTEN.REMOVED - Call `browser.tabs.onRemoved.addListener(callback)` to listen for tab removal.
 * @property {string} TAB.LISTEN.UPDATED - Call `browser.tabs.onUpdated.addListener(callback)` to listen for tab updates.
 *
 * @property {Object} TAB.ZOOM - Actions related to tab zoom settings.
 * @property {Object} TAB.ZOOM.FACTOR - Actions for managing zoom factors.
 * @property {string} TAB.ZOOM.FACTOR.GET - Call `browser.tabs.getZoom(tabId?)` to get the current zoom factor of a tab.
 * @property {string} TAB.ZOOM.FACTOR.SET - Call `browser.tabs.setZoom(tabId?, zoomFactor)` to set the zoom factor of a tab.
 * @property {Object} TAB.ZOOM.SETTINGS - Actions for managing zoom settings.
 * @property {string} TAB.ZOOM.SETTINGS.GET - Call `browser.tabs.getZoomSettings(tabId?)` to get the current zoom settings.
 * @property {string} TAB.ZOOM.SETTINGS.SET - Call `browser.tabs.setZoomSettings(tabId?, zoomSettings)` to set the zoom settings.
 *
 * @property {Object} TAG - Actions for managing tags.
 * @property {string} TAG.ADD - Action to add a tag.
 * @property {string} TAG.REMOVE - Action to remove a tag.
 * @property {string} TAG.UPDATE - Action to update a tag.
 */

import { validateArgs, addSchema } from './validation.js';
import { VALIDATION_SCHEMAS } from './schemas.js';

export const ACTION = Object.freeze({
  // Actions related to rule management
  RULES: {
    UPDATE: 'RULE_UPDATE',
    ACTIVATE: 'RULE_ACTIVATE',
    DEACTIVATE: 'RULE_DEACTIVATE',
  },

  // Actions for managing sessions
  SESSION: {
    DELETE: 'SESSION_DELETE',
    RESTORE: 'SESSION_RESTORE',
    SAVE: 'SESSION_SAVE',
  },

  // Actions for managing application state
  STATE: {
    INITIALIZE: 'STATE_INITIALIZE',
    RECOVER: 'STATE_RECOVER',
    RESET: 'STATE_RESET',
    SYNC: 'STATE_SYNC',
    CLEANUP: 'STATE_CLEANUP',
  },

  // Actions for tab management
  TAB: {
    SUSPEND_INACTIVE: 'TAB_SUSPEND_INACTIVE',
    TAG_AND_CLOSE: 'TAB_TAG_AND_CLOSE',
    GET_OLDEST: 'TAB_GET_OLDEST',
    CHECK_LIMIT: 'TAB_CHECK_LIMIT',
    ENFORCE_LIMIT: 'TAB_ENFORCE_LIMIT',
    BOOKMARK: 'TAB_BOOKMARK',
    CAPTURE: 'TAB_CAPTURE',
    CURRENT: 'TAB_GET_CURRENT',
    CREATE: 'TAB_CREATE',
    DISCARD: 'TAB_DISCARD',
    DUPLICATE: 'TAB_DUPLICATE',
    GET: 'TAB_GET',
    GROUP: 'TAB_GROUP',
    HIGHLIGHT: 'TAB_HIGHLIGHT',
    MESSAGE: 'TAB_SEND_MESSAGE',
    MOVE: 'TAB_MOVE',
    LANGUAGE: 'TAB_DETECT_LANGUAGE',
    QUERY: 'TAB_QUERY',
    RELOAD: 'TAB_RELOAD',
    REMOVE: 'TAB_REMOVE',
    UNGROUP: 'TAB_UNGROUP',
    UPDATE: 'TAB_UPDATE',

    // Tab listeners
    LISTEN: {
    ACTIVATED: 'TAB_LISTEN_ACTIVATED',
    ATTACHED: 'TAB_LISTEN_ATTACHED',
    CREATED: 'TAB_LISTEN_CREATED',
    DETACHED: 'TAB_LISTEN_DETACHED',
    MOVED: 'TAB_LISTEN_MOVED',
    REMOVED: 'TAB_LISTEN_REMOVED',
    REPLACED: 'TAB_LISTEN_REPLACED',
    UPDATED: 'TAB_LISTEN_UPDATED',
    ZOOM: 'TAB_LISTEN_ZOOM',
    },

    // Tab zoom actions
    ZOOM: {
    FACTOR: {
      GET: 'TAB_ZOOM_GET_FACTOR',
      SET: 'TAB_ZOOM_SET_FACTOR',
      },
      SETTINGS: {
      GET: 'TAB_ZOOM_GET_SETTINGS',
      SET: 'TAB_ZOOM_SET_SETTINGS',
      },
    },
  },

  // Actions for tag management
  TAG: {
    ADD: 'TAG_ADD',
    REMOVE: 'TAG_REMOVE',
    UPDATE: 'TAG_UPDATE',
  },
});

/**
 * Dynamically adds or updates a validation schema.
 * @param {string} methodName - Name of the method.
 * @param {Array} schema - Validation schema for the method.
 */
export function extendSchema(methodName, schema) {
  addSchema(methodName, schema);
}

/**
 * Dynamic API methods for browser.tabs operations.
 * @type {Object<string, function>}
 * @namespace TabAPI
 */
export const TabAPI = (() => {
  const api = {};

  Object.entries(ACTION.TAB).forEach(([key, value]) => {
    if (typeof value === 'object') {
      // Handle nested actions (e.g., ZOOM)
      api[key.toLowerCase()] = Object.entries(value).reduce((nestedApi, [nestedKey, nestedValue]) => {
        /**
         * Dynamically generated nested method with argument validation.
         * @function
         * @name TabAPI.[nestedKey]
         * @param {...*} args - Arguments required by the browser.tabs API.
         * @returns {Promise<any>} The result of the API call.
         */
        nestedApi[nestedKey.toLowerCase()] = async (...args) => {
          const methodName = nestedValue.replace('TAB_', '').toLowerCase();
          if (browser.tabs[methodName]) {
            validateArgs(methodName, args, VALIDATION_SCHEMAS);
            try {
              return await browser.tabs[methodName](...args);
            } catch (error) {
              console.error(`Error in ${methodName}:`, error);
              throw error;
            }
          } else {
            throw new Error(`Unsupported action: ${value}`);
          }
        };
        return nestedApi;
      }, {});
    } else {
      /**
       * Dynamically generated method with argument validation.
       * @function
       * @name TabAPI.[key]
       * @param {...*} args - Arguments required by the browser.tabs API.
       * @returns {Promise<any>} The result of the API call.
       */
      api[key.toLowerCase()] = async (...args) => {
        const methodName = value.replace('TAB_', '').toLowerCase();
        if (browser.tabs[methodName]) {
          const schema = VALIDATION_SCHEMAS[methodName];
          if (schema) {
            validateArgs(methodName, args, schema);
          } else {
            console.warn(`No validation schema found for ${methodName}. Skipping validation.`);
          }
          try {
            return await browser.tabs[methodName](...args);
          } catch (error) {
            console.error(`Error in ${methodName}:`, error);
            throw new Error(
              `Validation failed for ${methodName}: Argument at index ${error.index} is invalid. Expected ${error.expectedType}, received ${typeof error.receivedArg}.`
            );
          }
        } else {
          const availableMethods = Object.keys(browser.tabs).join(', ');
          throw new Error(
            `Unsupported action: ${value}. Ensure that ${methodName} is a valid browser.tabs API method. Available methods: ${availableMethods}.`
          );
        }
      };
    }
  });

  return api;
})();
  
/**
 * JSDoc for IntelliSense for dynamic API functions.
 * Replace `[methodName]` with actual method name as needed in IDE hints.
 *
 * @example
 * // Example usage of TabAPI.create
 * const newTab = await TabAPI.create({ url: 'https://example.com' });
 * console.log('Created tab:', newTab);
 *
 * @example
 * // Example usage of TabAPI.update
 * const updatedTab = await TabAPI.update(tabId, { title: 'New Title' });
 * console.log('Updated tab:', updatedTab);
 *
 * @example
 * // Example usage of TabAPI.remove
 * await TabAPI.remove([tabId1, tabId2]);
 * console.log('Tabs removed successfully.');
 *
 * @param {...*} args - Arguments for the respective method.
 * @returns {Promise<any>} Returns the result of the API call.
 */