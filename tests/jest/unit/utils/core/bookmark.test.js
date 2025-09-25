// tests/jest/unit/utils/core/bookmark.test.js
// @jest-environment jsdom

jest.mock('webextension-polyfill', () => {
  const search = jest.fn();
  const create = jest.fn();
  // NOTE: remove might end up missing in some ESM flows, we’ll guard in beforeEach
  const remove = jest.fn();
  return { __esModule: true, default: { bookmarks: { search, create, remove } } };
});

import * as api from '../../../../../utils/core/bookmark.js';
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
const mockBookmarkCreate = jest.fn().mockImplementation(async (bookmark) => {
  return { ...bookmark, id: 'folder-123' };
});

const mockBookmarkSearch = jest.fn().mockImplementation(async (query) => {
  if (query.title === 'TabCurator') {
    return [{ id: 'folder-123', title: 'TabCurator' }];
  }
  if (query.url === 'http://example.com') {
    return [{ id: 'bookmark-123', url: 'http://example.com', title: 'Example', parentId: 'folder-123' }];
  }
  return [];
});

const mockBookmarkRemove = jest.fn().mockImplementation(async () => {
  return;
});

describe('bookmark utils', () => {
  // Store original methods to restore after tests
  let originalIsAvailable;
  let originalBookmarksApi;
  
  beforeEach(() => {
    // Save the original implementations
    originalIsAvailable = api.isBookmarksApiAvailable;
    
    // Setup browser.bookmarks mock
    originalBookmarksApi = browser.bookmarks;
    browser.bookmarks = {
      create: mockBookmarkCreate,
      search: mockBookmarkSearch,
      remove: mockBookmarkRemove
    };
    
    // Reset mock functions
    mockBookmarkCreate.mockClear();
    mockBookmarkSearch.mockClear();
    mockBookmarkRemove.mockClear();
  });

  afterEach(() => {
    // Restore original implementations
    browser.bookmarks = originalBookmarksApi;
  });

  test('isBookmarksApiAvailable returns a boolean', () => {
    const result = isBookmarksApiAvailable();
    expect(typeof result).toBe('boolean');
  });

  test('getOrCreateBookmarkFolder finds existing', async () => {
    mockBookmarkSearch.mockResolvedValueOnce([{ id: 'folder-123' }]);
    const result = await getOrCreateBookmarkFolder();
    expect(result).toBe('folder-123');
    expect(mockBookmarkSearch).toHaveBeenCalled();
    expect(mockBookmarkCreate).not.toHaveBeenCalled();
  });

  test('getOrCreateBookmarkFolder creates new if none', async () => {
    mockBookmarkSearch.mockResolvedValueOnce([]);
    const result = await getOrCreateBookmarkFolder();
    expect(result).toBe('folder-123');
    expect(mockBookmarkCreate).toHaveBeenCalledWith({ title: 'TabCurator' });
  });

  test('addBookmark and removeBookmark', async () => {
    const bookmark = { title: 'Test', url: 'http://example.com' };
    mockBookmarkSearch.mockResolvedValueOnce([{ id: 'folder-123' }]);
    const result = await addBookmark(bookmark);
    expect(result).toEqual({ ...bookmark, id: 'folder-123', parentId: 'folder-123' });

    await removeBookmark('bookmark-123');
    expect(mockBookmarkRemove).toHaveBeenCalledWith('bookmark-123');
  });

  test('initializeBookmarkFolder sets default folder ID', async () => {
    mockBookmarkSearch.mockResolvedValueOnce([{ id: 'folder-123' }]);
    await initializeBookmarkFolder();
    expect(getDefaultFolderId()).toBe('folder-123');
  });

  describe('bookmark API unavailable scenarios', () => {
    // Store original methods for later restoration
    let originalCreate;
    
    beforeEach(() => {
      // Save original implementations
      originalCreate = browser.bookmarks.create;
      
      // Override the availability check to return false
      Object.defineProperty(browser.bookmarks, 'create', { value: undefined });
    });
    
    afterEach(() => {
      // Restore browser.bookmarks.create
      Object.defineProperty(browser.bookmarks, 'create', {
        value: originalCreate
      });
    });

    test('getOrCreateBookmarkFolder handles unavailable API', async () => {
      const spy = jest.spyOn(console, 'warn').mockImplementation();
      const result = await getOrCreateBookmarkFolder();
      
      expect(result).toBeNull();
      expect(spy).toHaveBeenCalledWith('Bookmarks API not available in this browser.');
      spy.mockRestore();
    });

    test('addBookmark handles unavailable API', async () => {
      const spy = jest.spyOn(console, 'warn').mockImplementation();
      const result = await addBookmark({ title: 'Test', url: 'http://example.com' });
      
      expect(result).toBeNull();
      expect(spy).toHaveBeenCalledWith('Bookmarks API not available in this browser.');
      spy.mockRestore();
    });

    test('removeBookmark handles unavailable API', async () => {
      const spy = jest.spyOn(console, 'warn').mockImplementation();
      await removeBookmark('testId');
      
      expect(spy).toHaveBeenCalledWith('Bookmarks API not available in this browser.');
      spy.mockRestore();
    });

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