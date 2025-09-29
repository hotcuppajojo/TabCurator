// tests/jest/utils/core/bookmark.test.js

/**
 * @file Unit tests for bookmark utility helpers
 * @description These tests emphasise the reasoning behind defensive bookmark handling:
 * - graceful degradation when the Bookmarks API is absent or partially implemented (common in
 *   alternate browsers / ESM shims),
 * - deterministic folder resolution for consistent storage of extension bookmarks, and
 * - mapping between created bookmark metadata and the IDs the rest of the extension relies on
 *
 * Tests deliberately exercise real promise flows via small mocks (rather than fully stubbing
 * behavior away) so future refactors that break the contract fail early and clearly
 */

/**
 * @description Provide the minimal `webextension-polyfill` surface the module expects. The goal
 * is to emulate the parts of the browser bookmarks API we interact with while letting individual
 * tests patch or remove methods to simulate degraded environments without reloading modules
 */
jest.mock('webextension-polyfill', () => {
  const search = jest.fn();
  const create = jest.fn();
  // NOTE: remove might end up missing in some ESM flows, we’ll guard in beforeEach
  const remove = jest.fn();
  return { __esModule: true, default: { bookmarks: { search, create, remove } } };
});

import * as api from '../../../../utils/core/bookmark.js';
import browser from 'webextension-polyfill';

const {
  isBookmarksApiAvailable,
  getOrCreateBookmarkFolder,
  addBookmark,
  removeBookmark,
  searchBookmarks,
  initializeBookmarkFolder,
  setDefaultFolderId,
  getDefaultFolderId
} = api;

// Create bookmark API mocks
/**
 * @description A focused mock for folder/bookmark creation. We return a predictable id so tests
 * can assert that consumer code correctly wires created metadata (parentId/id propagation).
 * Keeping the implementation async mirrors the real API and prevents false positives from
 * synchronous behavior differences
 */
const mockBookmarkCreate = jest.fn().mockImplementation(async (bookmark) => {
  return { ...bookmark, id: 'folder-123' };
});

/**
 * @description Search semantics are important: we need the helper to resolve existing folder
 * discovery, find bookmarks by URL, and return an empty array when nothing matches. Tests rely on
 * these three distinct outcomes to exercise create-vs-find branches
 */
const mockBookmarkSearch = jest.fn().mockImplementation(async (query) => {
  if (query.title === 'TabCurator') {
    return [{ id: 'folder-123', title: 'TabCurator' }];
  }
  if (query.url === 'http://example.com') {
    return [{ id: 'bookmark-123', url: 'http://example.com', title: 'Example', parentId: 'folder-123' }];
  }
  return [];
});

/**
 * @description Simple remove mock. Returning a resolved promise keeps the removal branch fast and
 * mirrors the real method's void/undefined resolution pattern
 */
const mockBookmarkRemove = jest.fn().mockImplementation(async () => {
  return;
});

/**
 * @description Group: bookmark utils
 *
 * Why this suite exists: bookmarks are not a core browser capability in all environments the
 * extension runs in. The helpers here are a thin compatibility layer—tests assert the
 * compatibility contract (null-return on unavailable API, deterministic fallback creation,
 * and correct id propagation) rather than implementation details
 */
describe('bookmark utils', () => {
  // Store original methods to restore after tests
  let originalIsAvailable;
  let originalBookmarksApi;
  
  beforeEach(() => {
    // Save the original implementations so tests can mutate the global safely. We restore in
    // afterEach to avoid cross-test contamination; this pattern lets individual tests simulate
    // partial API presence by mutating `browser.bookmarks` directly
    originalIsAvailable = api.isBookmarksApiAvailable;
    
    // Setup browser.bookmarks mock surface
    originalBookmarksApi = browser.bookmarks;
    browser.bookmarks = {
      create: mockBookmarkCreate,
      search: mockBookmarkSearch,
      remove: mockBookmarkRemove
    };
    
    // Reset mock call-history between tests so assertions remain deterministic
    mockBookmarkCreate.mockClear();
    mockBookmarkSearch.mockClear();
    mockBookmarkRemove.mockClear();
  });

  afterEach(() => {
    // Restore original implementations
    browser.bookmarks = originalBookmarksApi;
  });

  /**
   * @description We assert the availability predicate returns a boolean because callers rely on
   * a clear true/false contract to decide whether to attempt bookmark operations or fall back
   */
  test('isBookmarksApiAvailable returns a boolean', () => {
    const result = isBookmarksApiAvailable();
    expect(typeof result).toBe('boolean');
  });

  /**
   * @description Verifies the fast-path: if the canonical folder already exists we should use it.
   * This prevents creating duplicate folders and keeps bookmarks grouped predictably
   */
  test('getOrCreateBookmarkFolder finds existing', async () => {
    mockBookmarkSearch.mockResolvedValueOnce([{ id: 'folder-123' }]);
    const result = await getOrCreateBookmarkFolder();
    expect(result).toBe('folder-123');
    expect(mockBookmarkSearch).toHaveBeenCalled();
    expect(mockBookmarkCreate).not.toHaveBeenCalled();
  });

  /**
   * @description Confirms the fallback: when no folder exists we must create one. This test
   * ensures consumers depend on a stable folder name and that creation payloads remain correct
   */
  test('getOrCreateBookmarkFolder creates new if none', async () => {
    mockBookmarkSearch.mockResolvedValueOnce([]);
    const result = await getOrCreateBookmarkFolder();
    expect(result).toBe('folder-123');
    expect(mockBookmarkCreate).toHaveBeenCalledWith({ title: 'TabCurator' });
  });

  /**
   * @description Validates the two-way behavior: adding a bookmark must return stable metadata
   * (id/parentId propagation) and removal should call the underlying API with the expected id.
   * This protects downstream code that assumes a created bookmark contains a usable id
   */
  test('addBookmark and removeBookmark', async () => {
    const bookmark = { title: 'Test', url: 'http://example.com' };
    mockBookmarkSearch.mockResolvedValueOnce([{ id: 'folder-123' }]);
    const result = await addBookmark(bookmark);
    expect(result).toEqual({ ...bookmark, id: 'folder-123', parentId: 'folder-123' });

    await removeBookmark('bookmark-123');
    expect(mockBookmarkRemove).toHaveBeenCalledWith('bookmark-123');
  });

  /**
   * @description The extension relies on a default folder id being cached for performance and
   * determinism across reloads; this test asserts the initialization path sets that id correctly
   */
  test('initializeBookmarkFolder sets default folder ID', async () => {
    mockBookmarkSearch.mockResolvedValueOnce([{ id: 'folder-123' }]);
    await initializeBookmarkFolder();
    expect(getDefaultFolderId()).toBe('folder-123');
  });

  /**
   * @description These scenarios simulate partial or complete absence of the Bookmarks API.
   * It's common for browser shims or constrained contexts to remove properties (e.g. ESM
   * reexports). Tests ensure helpers degrade gracefully (null returns, warnings) rather than
   * throwing, which keeps the extension stable on unsupported platforms
   */
  describe('bookmark API unavailable scenarios', () => {
    // Store original methods for later restoration
    let originalCreate;
    
    beforeEach(() => {
      // Save original implementations
      originalCreate = browser.bookmarks.create;
      
      // Simulate a browser surface where create is missing (some shims expose undefined)
      Object.defineProperty(browser.bookmarks, 'create', { value: undefined });
    });
    
    afterEach(() => {
      // Restore browser.bookmarks.create
      Object.defineProperty(browser.bookmarks, 'create', {
        value: originalCreate
      });
    });

    /**
     * @description When the API is missing we expect a null-safe return and a single warning so
     * callers can fall back without noisy exceptions. This maintains a predictable upgrade path
     * for browsers that later add bookmarks support
     */
    test('getOrCreateBookmarkFolder handles unavailable API', async () => {
      const spy = jest.spyOn(console, 'warn').mockImplementation();
      const result = await getOrCreateBookmarkFolder();
      
      expect(result).toBeNull();
      expect(spy).toHaveBeenCalledWith('Bookmarks API not available in this browser.');
      spy.mockRestore();
    });

    /**
     * @description Adding should be a no-op when the API is absent and should log a single
     * warning. Tests assert both to avoid silent failures where UI assumes the bookmark exists
     */
    test('addBookmark handles unavailable API', async () => {
      const spy = jest.spyOn(console, 'warn').mockImplementation();
      const result = await addBookmark({ title: 'Test', url: 'http://example.com' });
      
      expect(result).toBeNull();
      expect(spy).toHaveBeenCalledWith('Bookmarks API not available in this browser.');
      spy.mockRestore();
    });

    /**
     * @description Removal should similarly be a no-op with a warning; callers expect idempotent
     * behavior when the platform doesn't support bookmarks
     */
    test('removeBookmark handles unavailable API', async () => {
      const spy = jest.spyOn(console, 'warn').mockImplementation();
      await removeBookmark('testId');
      
      expect(spy).toHaveBeenCalledWith('Bookmarks API not available in this browser.');
      spy.mockRestore();
    });

    /**
     * @description Search falls back to an empty array so callers iterate safely without null
     * checks. Tests assert the fallback to preserve consumer simplicity
     */
    test('searchBookmarks handles unavailable API', async () => {
      const spy = jest.spyOn(console, 'warn').mockImplementation();
      const results = await searchBookmarks({ url: 'http://example.com' });
      
      expect(results).toEqual([]);
      expect(spy).toHaveBeenCalledWith('Bookmarks API not available in this browser.');
      spy.mockRestore();
    });
  });
  
  test('addBookmark handles null folder ID', async () => {
    browser.bookmarks.search.mockResolvedValueOnce([]); // forces create branch
    browser.bookmarks.create.mockResolvedValueOnce(null); // simulate folder creation failure

    const result = await api.addBookmark({ title: 'Test', url: 'http://example.com' });

    expect(browser.bookmarks.search).toHaveBeenCalled();
    expect(browser.bookmarks.create).toHaveBeenCalled();
    expect(result).toBeNull();
  });
});