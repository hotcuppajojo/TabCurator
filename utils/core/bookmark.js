// utils/core/bookmark.js
/**
 * @fileoverview Bookmark management utilities for TabCurator.
 * Handles creation, search, and management of the TabCurator bookmark folder and bookmarks.
 * Works across all modern browsers supporting the WebExtension API.
 * 
 * @module utils/core/bookmark
 */

import browser from 'webextension-polyfill';

/**
 * Bookmark configuration constants.
 * @readonly
 * @type {Object}
 */
export const BOOKMARK_CONFIG = Object.freeze({
  FOLDER_NAME: 'TabCurator'
});

// Separate mutable variable to store folder ID
let _defaultFolderId = null;

/**
 * Get the default folder ID.
 * @returns {string|null} The folder ID
 */
export function getDefaultFolderId() {
  return _defaultFolderId;
}

/**
 * Set the default folder ID.
 * @param {string} id - The folder ID to set
 */
export function setDefaultFolderId(id) {
  _defaultFolderId = id;
}

/**
 * Checks if the bookmarks API is available in the current browser.
 * @returns {boolean}
 */
export function isBookmarksApiAvailable() {
  return !!(browser && browser.bookmarks && typeof browser.bookmarks.create === 'function');
}

/**
 * Finds or creates the TabCurator bookmark folder.
 * @returns {Promise<string|null>} The folder ID, or null if not available.
 */
export async function getOrCreateBookmarkFolder() {
  if (!isBookmarksApiAvailable()) {
    console.warn('Bookmarks API not available in this browser.');
    return null;
  }
  const folders = await browser.bookmarks.search({ title: BOOKMARK_CONFIG.FOLDER_NAME });
  if (folders && folders.length > 0) {
    return folders[0].id ?? null;
  }
  // Create folder if not found
  const folder = await browser.bookmarks.create({ title: BOOKMARK_CONFIG.FOLDER_NAME });
  // Use optional chaining + nullish coalescing
  return folder?.id ?? null;
}

/**
 * Adds a bookmark under the TabCurator folder.
 * @param {Object} options - { title: string, url: string }
 * @returns {Promise<Object|null>} The created bookmark, or null if not available.
 */
export async function addBookmark(options) {
  if (!isBookmarksApiAvailable()) {
    console.warn('Bookmarks API not available in this browser.');
    return null;
  }
  const folderId = await getOrCreateBookmarkFolder();
  if (!folderId) return null;
  const created = await browser.bookmarks.create({
    parentId: folderId,
    title: options.title,
    url: options.url
  });
  return created ?? null;
}

/**
 * Removes a bookmark by ID.
 * @param {string} bookmarkId
 * @returns {Promise<void>}
 */
export async function removeBookmark(bookmarkId) {
  if (!isBookmarksApiAvailable()) {
    console.warn('Bookmarks API not available in this browser.');
    return;
  }
  await browser.bookmarks.remove(bookmarkId);
}

/**
 * Searches for bookmarks by query.
 * @param {Object} query - { title?: string, url?: string }
 * @returns {Promise<Array>} Array of bookmark nodes.
 */
export async function searchBookmarks(query) {
  if (!isBookmarksApiAvailable()) {
    console.warn('Bookmarks API not available in this browser.');
    return [];
  }
  const results = await browser.bookmarks.search(query);
  return results ?? [];
}

/**
 * Initializes the TabCurator bookmark folder and sets DEFAULT_FOLDER_ID.
 * @returns {Promise<string|null>} The folder ID, or null if not available.
 */
export async function initializeBookmarkFolder() {
  const folderId = await getOrCreateBookmarkFolder();
  setDefaultFolderId(folderId);
  return folderId;
}