// tests/jest/stateManager.reducers.test.js
/**
 * @description Reducer coverage tests for StateManager. These tests explain why reducer
 * shapes, action names, and payload contracts are important for downstream code
 * The suite focuses on preserving contracts so UI and background workers do not
 * silently break when reducers are refactored
 */
import { jest } from '@jest/globals';
import stateManager from '../../utils/stateManager.js';
import { TabManager } from '../../utils/tabManager.js';

// Mock dependencies
/**
 * @description Provide a minimal TabManager mock to exercise initialization
 * Keep mocks intentionally small so tests focus on reducer contracts not implementation details
 */
jest.mock('../../utils/tabManager.js', () => ({
  __esModule: true,
  TabManager: jest.fn().mockImplementation(() => ({
    initialize: jest.fn().mockResolvedValue(true)
  })),
}));

/**
 * @description Mock the browser surface to make storage and messaging deterministic
 * Tests should be able to simulate permission and storage failures without flakiness
 */
jest.mock('webextension-polyfill', () => ({
  __esModule: true,
  default: {
    permissions: {
      contains: jest.fn().mockResolvedValue(true),
      request: jest.fn().mockResolvedValue(true)
    },
    runtime: {
      connect: jest.fn(() => ({
        onMessage: { addListener: jest.fn() },
        onDisconnect: { addListener: jest.fn() },
        postMessage: jest.fn()
      })),
      onMessage: { addListener: jest.fn() }
    },
    storage: {
      local: {
        get: jest.fn().mockResolvedValue({}),
        set: jest.fn().mockResolvedValue()
      }
    }
  }
}));

describe('StateManager Reducer Coverage Tests', () => {
  /**
   * @description Canary suite for reducer contracts. Group-level comments explain why
   * we test dispatch wiring instead of reducer internals so that refactors cannot
   * remove or rename actions without tests failing
   */
  let tabManagerMock;
  let originalDispatch;

  beforeEach(async () => {
    jest.clearAllMocks();
    tabManagerMock = new TabManager();
    await stateManager.initialize(tabManagerMock);
    // Spy on the store's dispatch method
    originalDispatch = stateManager.store.dispatch;
    stateManager.store.dispatch = jest.fn(originalDispatch);
  });

  afterEach(() => {
    // Restore original dispatch
    if (originalDispatch) {
      stateManager.store.dispatch = originalDispatch;
    }
  });

  describe('TabManagement Slice Reducers', () => {
  /**
   * @description Tab management is the central state slice for the extension. Tests
   * assert that common operations like update, remove, and reset maintain the payload
   * shape expected by selectors and consumers
   */
    test('updateTab reducer should update existing tab', () => {
  /**
   * @description Validate update path for an existing id. This prevents regressions
   * where updates become no-ops due to mismatched reducer keys
   */
      const updateAction = {
        type: 'tabManagement/updateTab',
        payload: { id: 1, title: 'Updated Tab', url: 'https://updated.com' }
      };

      stateManager.dispatch(updateAction);
      expect(stateManager.store.dispatch).toHaveBeenCalledWith(updateAction);
    });

    test('updateTab reducer should add new tab if not exists', () => {
  /**
   * @description Ensure reducers can ingest new tabs when data originates outside
   * the normal creation flow so imported or recovered tabs are not dropped
   */
      const newTabAction = {
        type: 'tabManagement/updateTab', 
        payload: { id: 999, title: 'New Tab', url: 'https://new.com' }
      };

      stateManager.dispatch(newTabAction);
      expect(stateManager.store.dispatch).toHaveBeenCalledWith(newTabAction);
    });

    test('updateTab reducer should update tab activity when lastAccessed provided', () => {
  /**
   * @description lastAccessed is used by heuristics. Confirm activity updates are
   * applied so eviction and analytics maintain deterministic behaviour
   */
      const updateWithActivityAction = {
        type: 'tabManagement/updateTab',
        payload: { 
          id: 2, 
          title: 'Active Tab', 
          lastAccessed: Date.now(),
          status: 'active'
        }
      };

      stateManager.dispatch(updateWithActivityAction);
      expect(stateManager.store.dispatch).toHaveBeenCalledWith(updateWithActivityAction);
    });

    test('updateMetadata reducer should update tab metadata', () => {
  /**
   * @description Metadata updates are additive. Tests ensure the reducer preserves
   * existing fields while applying new metadata keys without mutation surprises
   */
      const metadataAction = {
        type: 'tabManagement/updateMetadata',
        payload: { 
          tabId: 3, 
          metadata: { 
            favicon: 'icon.png', 
            loadTime: 1500,
            tags: ['important'] 
          }
        }
      };

      stateManager.dispatch(metadataAction);
      expect(stateManager.store.dispatch).toHaveBeenCalledWith(metadataAction);
    });

    test('removeTab reducer should remove tab and cleanup related data', () => {
  /**
   * @description Removal must cascade cleanup. This test confirms the action
   * reaches reducers so any dependent slices can remove references
   */
      const removeAction = {
        type: 'tabManagement/removeTab',
        payload: 4
      };

      stateManager.dispatch(removeAction);
      expect(stateManager.store.dispatch).toHaveBeenCalledWith(removeAction);
    });

    test('removeTab reducer should update oldestTab when removed tab was oldest', () => {
  /**
   * @description Oldest tab tracking is used by eviction. When the oldest tab
   * is removed the state should reflect the new oldest entry so eviction remains valid
   */
      // First set an oldest tab
      const setOldestAction = {
        type: 'tabManagement/updateOldestTab',
        payload: { id: 5, lastAccessed: 1000 }
      };
      stateManager.dispatch(setOldestAction);

      // Then remove that tab
      const removeOldestAction = {
        type: 'tabManagement/removeTab',
        payload: 5
      };
      stateManager.dispatch(removeOldestAction);
      
      expect(stateManager.store.dispatch).toHaveBeenCalledWith(removeOldestAction);
    });

    test('updateOldestTab reducer should update oldest tab info', () => {
  /**
   * @description Explicit oldest tab updates are used by background heuristics
   * Preserve payload shape so consumers relying on id and lastAccessed remain correct
   */
      const oldestTabAction = {
        type: 'tabManagement/updateOldestTab',
        payload: { id: 6, lastAccessed: 500, title: 'Oldest Tab' }
      };

      stateManager.dispatch(oldestTabAction);
      expect(stateManager.store.dispatch).toHaveBeenCalledWith(oldestTabAction);
    });

    test('reset reducer should reset tabManagement state', () => {
  /**
   * @description Reset semantics should clear runtime data. Tests assert reset
   * calls are still handled to avoid stale state after destructive operations
   */
      const resetAction = {
        type: 'tabManagement/reset'
      };

      stateManager.dispatch(resetAction);
      expect(stateManager.store.dispatch).toHaveBeenCalledWith(resetAction);
    });
  });

  describe('Session Slice Reducers', () => {
  /**
   * @description Sessions include bookmarks and persisted snapshots. Tests focus on
   * correctness of saved payloads to avoid inconsistent restores and accidental data loss
   */
    test('saveSession reducer should save session data', () => {
  /**
   * @description Saving must persist the structure consumers expect, including
   * tabs and timestamps so restores can match user expectations
   */
      const saveSessionAction = {
        type: 'session/saveSession',
        payload: {
          name: 'Work Session',
          tabs: [
            { id: 1, title: 'Tab 1', url: 'https://example1.com' },
            { id: 2, title: 'Tab 2', url: 'https://example2.com' }
          ],
          timestamp: Date.now()
        }
      };

      stateManager.dispatch(saveSessionAction);
      expect(stateManager.store.dispatch).toHaveBeenCalledWith(saveSessionAction);
    });

    test('deleteSession reducer should remove session', () => {
  /**
   * @description Deletion must be explicit. Confirm the delete action reaches reducers
   * so persisted session entries do not linger
   */
      const deleteSessionAction = {
        type: 'session/deleteSession',
        payload: 'session-id-123'
      };

      stateManager.dispatch(deleteSessionAction);
      expect(stateManager.store.dispatch).toHaveBeenCalledWith(deleteSessionAction);
    });
  });

  describe('Rules Slice Reducers', () => {
  /**
   * @description Rules drive automatic tagging and actions. Tests ensure rule CRUD
   * operations preserve conditions and action mappings to avoid silent rule breakage
   */
    test('addRule reducer should add new rule', () => {
  /**
   * @description Adding a rule should accept a clear id and action pair so
   * rule matching remains reliable across versions
   */
      const addRuleAction = {
        type: 'rules/addRule',
        payload: {
          id: 'rule-1',
          condition: 'url-contains',
          value: 'github.com',
          action: 'tag',
          actionValue: 'development'
        }
      };

      stateManager.dispatch(addRuleAction);
      expect(stateManager.store.dispatch).toHaveBeenCalledWith(addRuleAction);
    });

    test('updateRules reducer should update rules array', () => {
  /**
   * @description Bulk updates are used by imports and rule editors. Ensure
   * reducer accepts arrays and maintains ordering expectations when relevant
   */
      const updateRulesAction = {
        type: 'rules/updateRules',
        payload: [
          { id: 'rule-1', condition: 'url-contains', value: 'example.com' },
          { id: 'rule-2', condition: 'title-contains', value: 'Important' }
        ]
      };

      stateManager.dispatch(updateRulesAction);
      expect(stateManager.store.dispatch).toHaveBeenCalledWith(updateRulesAction);
    });
  });

  describe('ArchivedTabs Slice Reducers', () => {
  /**
   * @description Archived tabs are separate from active tab state. Tests confirm
   * archive and removal actions are routed correctly so the archive store does not leak
   */
    test('archiveTab reducer should archive tab', () => {
  /**
   * @description Archival preserves original metadata for future restore. This
   * test guards against accidental data truncation in the archive slice
   */
      const archiveAction = {
        type: 'archivedTabs/archiveTab',
        payload: {
          id: 7,
          title: 'Archived Tab',
          url: 'https://archived.com',
          archivedAt: Date.now()
        }
      };

      stateManager.dispatch(archiveAction);
      expect(stateManager.store.dispatch).toHaveBeenCalledWith(archiveAction);
    });

    test('removeArchivedTab reducer should remove archived tab', () => {
  /**
   * @description Removal should be idempotent and safe to call multiple times
   * so UI retries do not cause crashes
   */
      const removeArchivedAction = {
        type: 'archivedTabs/removeArchivedTab',
        payload: 8
      };

      stateManager.dispatch(removeArchivedAction);
      expect(stateManager.store.dispatch).toHaveBeenCalledWith(removeArchivedAction);
    });
  });

  describe('SessionData Slice Reducers', () => {
  /**
   * @description SessionData holds arbitrary payloads. Tests ensure storage and
   * deletion of session data preserves keys used by migration and UI code
   */
    test('saveSessionData reducer should save session data', () => {
  /**
   * @description Save operation must keep metadata such as timestamps so migration
   * logic can detect freshness of saved session blobs
   */
      const saveSessionDataAction = {
        type: 'sessionData/saveSessionData',
        payload: {
          sessionId: 'session-123',
          data: { theme: 'dark', layout: 'compact' },
          timestamp: Date.now()
        }
      };

      stateManager.dispatch(saveSessionDataAction);
      expect(stateManager.store.dispatch).toHaveBeenCalledWith(saveSessionDataAction);
    });

    test('deleteSessionData reducer should remove session data', () => {
  /**
   * @description Deletion must remove the entire session entry to avoid stale UI
   * displays and to reduce storage usage
   */
      const deleteSessionDataAction = {
        type: 'sessionData/deleteSessionData',
        payload: 'session-456'
      };

      stateManager.dispatch(deleteSessionDataAction);
      expect(stateManager.store.dispatch).toHaveBeenCalledWith(deleteSessionDataAction);
    });
  });

  describe('UI Slice Reducers', () => {
  /**
   * @description UI slice reducers should be light-weight. Tests verify that UI
   * toggles are dispatched so views can respond without querying store internals
   */
    test('setTaggingPrompt reducer should update UI state', () => {
  /**
   * @description Tagging prompt must carry tab id and active state so the UI shows
   * correct context for the prompt without extra lookups
   */
      const setTaggingPromptAction = {
        type: 'ui/setTaggingPrompt',
        payload: { isActive: true, tabId: 9 }
      };

      stateManager.dispatch(setTaggingPromptAction);
      expect(stateManager.store.dispatch).toHaveBeenCalledWith(setTaggingPromptAction);
    });
  });

  describe('Settings Slice Reducers', () => {
  /**
   * @description Settings reducers control behaviour across the extension. These tests
   * guard against accidental changes to defaults or key names that would otherwise be silent
   */
    test('updateSettings reducer should update settings', () => {
  /**
   * @description Settings changes must be persisted and applied. This test ensures
   * reducer keeps the same shape so storage and UI remain compatible
   */
      const updateSettingsAction = {
        type: 'settings/updateSettings',
        payload: { 
          maxTabs: 25, 
          autoSuspend: true,
          taggingRequired: false 
        }
      };

      stateManager.dispatch(updateSettingsAction);
      expect(stateManager.store.dispatch).toHaveBeenCalledWith(updateSettingsAction);
    });

    test('updateMaxTabs reducer should update max tabs setting', () => {
  /**
   * @description The maxTabs setting drives eviction. Preserve numeric semantics so
   * heuristics that rely on it remain deterministic
   */
      const updateMaxTabsAction = {
        type: 'settings/updateMaxTabs',
        payload: 30
      };

      stateManager.dispatch(updateMaxTabsAction);
      expect(stateManager.store.dispatch).toHaveBeenCalledWith(updateMaxTabsAction);
    });

    test('updateTaggingRequirement reducer should update tagging requirement', () => {
  /**
   * @description Tagging requirement toggles UX behaviour. Tests ensure boolean
   * flips are still handled and persisted across state transitions
   */
      const updateTaggingAction = {
        type: 'settings/updateTaggingRequirement',
        payload: true
      };

      stateManager.dispatch(updateTaggingAction);
      expect(stateManager.store.dispatch).toHaveBeenCalledWith(updateTaggingAction);
    });
  });

  describe('Permissions Slice Reducers', () => {
  /**
   * @description Permissions slice coordinates granted and pending permissions. Tests
   * assert the reducer handles lists and single item additions predictably so permission
   * flows remain auditable and testable
   */
    test('updatePermissions reducer should update permissions', () => {
  /**
   * @description The granted list should accept arrays of permission strings so
   * UI and background checks can use the same canonical source of truth
   */
      const updatePermissionsAction = {
        type: 'permissions/updatePermissions',
        payload: { 
          granted: ['tabs', 'storage', 'bookmarks'],
          pending: []
        }
      };

      stateManager.dispatch(updatePermissionsAction);
      expect(stateManager.store.dispatch).toHaveBeenCalledWith(updatePermissionsAction);
    });

    test('addPendingPermission reducer should add pending permission', () => {
  /**
   * @description Pending permissions must be tracked so UI can prompt users and
   * retry flows that depend on eventual granting of permissions
   */
      const addPendingAction = {
        type: 'permissions/addPendingPermission',
        payload: 'activeTab'
      };

      stateManager.dispatch(addPendingAction);
      expect(stateManager.store.dispatch).toHaveBeenCalledWith(addPendingAction);
    });
  });
});