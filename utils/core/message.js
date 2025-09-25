// utils/core/message.js
/**
 * @fileoverview Message constants, templates, and user-facing notifications.
 * Contains ONLY message type constants and user feedback messages - no messaging logic.
 * 
 * @module utils/core/message
 */

/**
 * Message types used for runtime messaging between different parts of the extension.
 * These are just the constant definitions - actual messaging is handled by connection.js
 * 
 * @constant {Object} MESSAGE_TYPES
 */
export const MESSAGE_TYPES = Object.freeze({
  // Tab-related actions
  TAB_ACTION: 'TAB_ACTION',
  
  // Rule management actions  
  RULE_ACTION: 'RULE_ACTION',
  RULE_UPDATE: 'RULE_UPDATE',
  
  // State synchronization
  STATE_SYNC: 'STATE_SYNC',
  STATE_UPDATE: 'STATE_UPDATE',
  
  // Session management
  SESSION_ACTION: 'SESSION_ACTION',
  GET_SESSIONS: 'GET_SESSIONS',
  
  // Service worker lifecycle
  SERVICE_WORKER_UPDATE: 'SERVICE_WORKER_UPDATE',
  
  // Tag operations
  TAG_ACTION: 'TAG_ACTION',
  
  // Testing and development
  TEST_ACTION: 'TEST_ACTION',
  TEST_MESSAGE: 'TEST_MESSAGE',
  
  // Connection management
  CONNECTION_ACK: 'CONNECTION_ACK',
  INIT_CHECK: 'INIT_CHECK',
  
  // Error handling
  ERROR: 'ERROR',
  
  // Permission requests
  PERMISSION_REQUEST: 'PERMISSION_REQUEST',
  PERMISSION_GRANTED: 'PERMISSION_GRANTED',
  PERMISSION_DENIED: 'PERMISSION_DENIED',
  
  // Batch operations
  BATCH_OPERATION: 'BATCH_OPERATION',
  BATCH_COMPLETE: 'BATCH_COMPLETE',
  
  // Configuration updates
  CONFIG_UPDATE: 'CONFIG_UPDATE',
  
  // Telemetry and analytics
  TELEMETRY_EVENT: 'TELEMETRY_EVENT',
  
  // Storage operations
  STORAGE_SYNC: 'STORAGE_SYNC',
  STORAGE_QUOTA_WARNING: 'STORAGE_QUOTA_WARNING',
  
  // UI events
  UI_UPDATE: 'UI_UPDATE',
  POPUP_OPENED: 'POPUP_OPENED',
  OPTIONS_OPENED: 'OPTIONS_OPENED',
  
  // Background script lifecycle
  BACKGROUND_READY: 'BACKGROUND_READY',
  BACKGROUND_SHUTDOWN: 'BACKGROUND_SHUTDOWN',
  
  // Extension lifecycle
  EXTENSION_INSTALLED: 'EXTENSION_INSTALLED',
  EXTENSION_UPDATED: 'EXTENSION_UPDATED',
  EXTENSION_UNINSTALLED: 'EXTENSION_UNINSTALLED'
});

/**
 * User-facing messages and notifications for different operations and states.
 * Organized by category for better maintainability and localization support.
 * 
 * @constant {Object} MESSAGES
 */
export const MESSAGES = Object.freeze({
  // Tab-related messages
  TAB: {
    // Success messages
    CREATED: 'Tab created successfully.',
    REMOVED: 'Tab removed successfully.',
    UPDATED: 'Tab updated successfully.',
    DUPLICATED: 'Tab duplicated successfully.',
    GROUPED: 'Tabs grouped successfully.',
    UNGROUPED: 'Tabs ungrouped successfully.',
    MOVED: 'Tab moved successfully.',
    RELOADED: 'Tab reloaded successfully.',
    DISCARDED: 'Tab discarded to free memory.',
    HIGHLIGHTED: 'Tabs highlighted successfully.',
    CAPTURED: 'Tab screenshot captured.',
    BOOKMARKED: 'Tab bookmarked successfully.',
    TAGGED: 'Tab tagged successfully.',
    SUSPENDED: 'Inactive tab suspended.',
    RESTORED: 'Tab restored from suspension.',
    
    // Error messages
    ERROR: 'An error occurred with tab operations.',
    LIMIT_EXCEEDED: 'Tab limit exceeded. Please close a tab to proceed.',
    NOT_FOUND: 'Tab not found.',
    PERMISSION_DENIED: 'Permission denied for tab operation.',
    INVALID_URL: 'Invalid URL provided for tab.',
    CREATION_FAILED: 'Failed to create new tab.',
    UPDATE_FAILED: 'Failed to update tab.',
    REMOVAL_FAILED: 'Failed to remove tab.',
    DUPLICATE_FAILED: 'Failed to duplicate tab.',
    GROUP_FAILED: 'Failed to group tabs.',
    MOVE_FAILED: 'Failed to move tab.',
    RELOAD_FAILED: 'Failed to reload tab.',
    DISCARD_FAILED: 'Failed to discard tab.',
    CAPTURE_FAILED: 'Failed to capture tab screenshot.',
    BOOKMARK_FAILED: 'Failed to bookmark tab.',
    TAG_FAILED: 'Failed to tag tab.',
    SUSPEND_FAILED: 'Failed to suspend tab.',
    RESTORE_FAILED: 'Failed to restore tab.',
    
    // Warning messages
    HIGH_MEMORY_USAGE: 'High memory usage detected. Consider closing some tabs.',
    INACTIVE_WARNING: 'Tab has been inactive for a long time.',
    UNRESPONSIVE: 'Tab is not responding.',
    
    // Information messages
    LANGUAGE_DETECTED: 'Page language detected: {language}',
    ZOOM_CHANGED: 'Zoom level changed to {level}%',
    MUTED: 'Tab audio muted.',
    UNMUTED: 'Tab audio unmuted.'
  },
  
  // Session management messages
  SESSION: {
    SAVED: 'Session "{name}" saved successfully.',
    RESTORED: 'Session "{name}" restored successfully.',
    DELETED: 'Session "{name}" deleted successfully.',
    EXPORTED: 'Session exported successfully.',
    IMPORTED: 'Session imported successfully.',
    
    // Errors
    SAVE_FAILED: 'Failed to save session.',
    RESTORE_FAILED: 'Failed to restore session.',
    DELETE_FAILED: 'Failed to delete session.',
    NOT_FOUND: 'Session not found.',
    INVALID_DATA: 'Invalid session data.',
    EXPORT_FAILED: 'Failed to export session.',
    IMPORT_FAILED: 'Failed to import session.',
    
    // Warnings
    OVERWRITE_WARNING: 'A session with this name already exists. Overwrite?',
    LARGE_SESSION_WARNING: 'This session contains many tabs and may take time to restore.'
  },
  
  // Rule management messages
  RULES: {
    CREATED: 'Rule created successfully.',
    UPDATED: 'Rule updated successfully.',
    DELETED: 'Rule deleted successfully.',
    ACTIVATED: 'Rules activated successfully.',
    DEACTIVATED: 'Rules deactivated successfully.',
    APPLIED: 'Rule applied to {count} tabs.',
    
    // Errors
    CREATION_FAILED: 'Failed to create rule.',
    UPDATE_FAILED: 'Failed to update rule.',
    DELETE_FAILED: 'Failed to delete rule.',
    ACTIVATION_FAILED: 'Failed to activate rules.',
    INVALID_PATTERN: 'Invalid URL pattern in rule.',
    INVALID_ACTION: 'Invalid action specified in rule.',
    
    // Warnings
    CONFLICTING_RULES: 'Multiple rules match this condition.',
    PERFORMANCE_WARNING: 'Complex rules may impact performance.'
  },
  
  // Tag management messages
  TAGS: {
    ADDED: 'Tag "{tag}" added successfully.',
    REMOVED: 'Tag "{tag}" removed successfully.',
    UPDATED: 'Tag updated successfully.',
    
    // Errors
    ADD_FAILED: 'Failed to add tag.',
    REMOVE_FAILED: 'Failed to remove tag.',
    UPDATE_FAILED: 'Failed to update tag.',
    INVALID_FORMAT: 'Invalid tag format. Use only letters, numbers, hyphens, and underscores.',
    TOO_LONG: 'Tag is too long. Maximum {max} characters allowed.',
    ALREADY_EXISTS: 'Tag already exists.',
    
    // Information
    REQUIRED: 'Please add a tag before closing this tab.'
  },
  
  // Storage and sync messages
  STORAGE: {
    SYNCED: 'Data synchronized successfully.',
    QUOTA_WARNING: 'Storage quota nearly full. Consider cleaning up data.',
    QUOTA_EXCEEDED: 'Storage quota exceeded. Some data may not be saved.',
    BACKUP_CREATED: 'Backup created successfully.',
    BACKUP_RESTORED: 'Data restored from backup.',
    
    // Errors
    SYNC_FAILED: 'Failed to synchronize data.',
    BACKUP_FAILED: 'Failed to create backup.',
    RESTORE_FAILED: 'Failed to restore from backup.',
    CORRUPTION_DETECTED: 'Data corruption detected. Attempting recovery.',
    ACCESS_DENIED: 'Storage access denied.'
  },
  
  // Permission messages
  PERMISSIONS: {
    GRANTED: 'Permission granted successfully.',
    DENIED: 'Permission denied.',
    REQUIRED: 'Additional permissions required for this feature.',
    REVOKED: 'Permission has been revoked.',
    
    // Specific permission messages
    TABS_REQUIRED: 'Tab access permission required.',
    BOOKMARKS_REQUIRED: 'Bookmark access permission required.',
    STORAGE_REQUIRED: 'Storage access permission required.',
    BACKGROUND_REQUIRED: 'Background script permission required.'
  },
  
  // Connection and communication messages
  CONNECTION: {
    ESTABLISHED: 'Connection established successfully.',
    LOST: 'Connection lost. Attempting to reconnect...',
    RESTORED: 'Connection restored successfully.',
    FAILED: 'Failed to establish connection.',
    TIMEOUT: 'Connection timed out.',
    
    // Background script messages
    BACKGROUND_READY: 'Background script is ready.',
    BACKGROUND_ERROR: 'Background script encountered an error.',
    SERVICE_WORKER_UPDATED: 'Extension updated. Please refresh to use new features.'
  },
  
  // General system messages
  GENERAL: {
    SUCCESS: 'Operation completed successfully.',
    FAILED: 'Operation failed.',
    CANCELLED: 'Operation cancelled.',
    PROCESSING: 'Processing...',
    LOADING: 'Loading...',
    SAVING: 'Saving...',
    UNKNOWN_ERROR: 'An unknown error occurred.',
    NETWORK_ERROR: 'Network connection error.',
    INVALID_INPUT: 'Invalid input provided.',
    FEATURE_UNAVAILABLE: 'This feature is not available in your browser.',
    RATE_LIMITED: 'Too many requests. Please wait before trying again.',
    
    // Configuration messages
    SETTINGS_SAVED: 'Settings saved successfully.',
    SETTINGS_RESET: 'Settings reset to defaults.',
    IMPORT_SUCCESS: 'Configuration imported successfully.',
    EXPORT_SUCCESS: 'Configuration exported successfully.'
  },
  
  // Performance and monitoring messages
  PERFORMANCE: {
    HIGH_MEMORY: 'High memory usage detected.',
    SLOW_OPERATION: 'Operation is taking longer than expected.',
    OPTIMIZATION_APPLIED: 'Performance optimization applied.',
    QUOTA_WARNING: 'Resource quota warning.',
    
    // Telemetry
    TELEMETRY_ENABLED: 'Anonymous usage statistics enabled.',
    TELEMETRY_DISABLED: 'Anonymous usage statistics disabled.'
  },
  
  // Extension lifecycle messages
  EXTENSION: {
    INSTALLED: 'TabCurator installed successfully!',
    UPDATED: 'TabCurator has been updated to version {version}.',
    UNINSTALLED: 'TabCurator has been uninstalled.',
    STARTUP_COMPLETE: 'Extension startup complete.',
    SHUTDOWN_INITIATED: 'Extension shutdown initiated.',
    
    // First run messages
    WELCOME: 'Welcome to TabCurator! Let\'s get you started.',
    SETUP_COMPLETE: 'Setup complete. You\'re ready to manage your tabs!',
    MIGRATION_COMPLETE: 'Data migration completed successfully.'
  }
});

/**
 * Message templates for dynamic content.
 * These templates support placeholder replacement for personalized messages.
 * 
 * @constant {Object} MESSAGE_TEMPLATES
 */
export const MESSAGE_TEMPLATES = Object.freeze({
  TAB_COUNT: 'You have {count} tabs open.',
  TABS_SUSPENDED: '{count} inactive tabs have been suspended.',
  RULE_APPLIED: 'Rule "{ruleName}" applied to {count} tabs.',
  SESSION_TABS: 'Session "{sessionName}" contains {count} tabs.',
  STORAGE_USAGE: 'Using {used} of {total} storage space ({percentage}%).',
  TIME_SAVED: 'TabCurator has saved you {time} by managing {count} tabs.',
  MEMORY_FREED: 'Freed {amount} of memory by suspending tabs.',
  TABS_ARCHIVED: '{count} tabs archived with tag "{tag}".',
  BACKUP_SIZE: 'Backup created: {size} containing {items} items.',
  SYNC_STATUS: 'Last synced: {time} ago. {changes} changes pending.'
});

/**
 * Action confirmation messages for destructive operations.
 * These messages are shown before performing potentially harmful actions.
 * 
 * @constant {Object} CONFIRMATIONS
 */
export const CONFIRMATIONS = Object.freeze({
  DELETE_SESSION: 'Are you sure you want to delete the session "{name}"?',
  DELETE_RULE: 'Are you sure you want to delete this rule?',
  CLOSE_ALL_TABS: 'Are you sure you want to close all tabs?',
  RESET_SETTINGS: 'Are you sure you want to reset all settings to defaults?',
  CLEAR_DATA: 'Are you sure you want to clear all extension data?',
  SUSPEND_ALL: 'Are you sure you want to suspend all inactive tabs?',
  DELETE_BACKUP: 'Are you sure you want to delete this backup?',
  OVERWRITE_RULE: 'A rule with similar conditions exists. Overwrite it?',
  BATCH_OPERATION: 'This will affect {count} tabs. Continue?'
});

/**
 * Progress messages for long-running operations.
 * 
 * @constant {Object} PROGRESS_MESSAGES
 */
export const PROGRESS_MESSAGES = Object.freeze({
  LOADING_TABS: 'Loading tabs...',
  SAVING_SESSION: 'Saving session...',
  RESTORING_SESSION: 'Restoring session...',
  APPLYING_RULES: 'Applying rules...',
  SYNCING_DATA: 'Synchronizing data...',
  CREATING_BACKUP: 'Creating backup...',
  PROCESSING_BATCH: 'Processing {current} of {total} items...',
  ANALYZING_TABS: 'Analyzing tab usage patterns...',
  OPTIMIZING_PERFORMANCE: 'Optimizing performance...',
  CLEANING_STORAGE: 'Cleaning up storage...'
});

/**
 * Utility function to replace placeholders in message templates.
 * This is just a formatting utility, not messaging logic.
 */
export function formatMessage(template, values = {}) {
  return template.replace(/\{(\w+)\}/g, (match, key) => {
    return values[key] !== undefined ? values[key] : match;
  });
}

/**
 * Message severity levels for proper styling and handling.
 * 
 * @constant {Object} MESSAGE_SEVERITY
 */
export const MESSAGE_SEVERITY = Object.freeze({
  INFO: 'info',
  SUCCESS: 'success',
  WARNING: 'warning',
  ERROR: 'error',
  CRITICAL: 'critical'
});

/**
 * Context-specific message collections for different UI components.
 * 
 * @constant {Object} UI_MESSAGES
 */
export const UI_MESSAGES = Object.freeze({
  POPUP: {
    NO_TABS: 'No tabs found.',
    LOADING: 'Loading tabs...',
    SEARCH_PLACEHOLDER: 'Search tabs...',
    FILTER_ALL: 'All tabs',
    FILTER_ACTIVE: 'Active tabs',
    FILTER_SUSPENDED: 'Suspended tabs',
    SORT_BY_TITLE: 'Sort by title',
    SORT_BY_URL: 'Sort by URL',
    SORT_BY_TIME: 'Sort by last accessed'
  },
  
  OPTIONS: {
    SAVE_SETTINGS: 'Save Settings',
    RESET_SETTINGS: 'Reset to Defaults',
    IMPORT_CONFIG: 'Import Configuration',
    EXPORT_CONFIG: 'Export Configuration',
    TAB_LIMITS: 'Tab Limits',
    INACTIVITY_SETTINGS: 'Inactivity Settings',
    RULE_MANAGEMENT: 'Rule Management',
    BACKUP_RESTORE: 'Backup & Restore'
  },
  
  BACKGROUND: {
    INITIALIZATION: 'Initializing TabCurator...',
    READY: 'TabCurator is ready.',
    PROCESSING: 'Processing tab operations...',
    CLEANUP: 'Performing cleanup...',
    SHUTDOWN: 'Shutting down gracefully...'
  }
});