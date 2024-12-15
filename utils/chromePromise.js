// utils/chromePromise.js

import browser from 'webextension-polyfill'; // Updated import without alias
import { CONFIG } from './messagingUtils.js';

export const chromePromise = {
  storage: {
    sync: {
      get: async (keys) => {
        try {
          const result = await browser.storage.sync.get(keys);
          return result || {};
        } catch (error) {
          if (error.message.includes('MAX_WRITE_OPERATIONS_PER_MINUTE')) {
            // Use CONFIG for retry delay
            await new Promise(resolve => setTimeout(resolve, CONFIG.RETRY.DELAY));
            return chromePromise.storage.sync.get(keys);
          }
          throw error;
        }
      },
      set: async (items) => {
        try {
          await browser.storage.sync.set(items);
        } catch (error) {
          console.error('Storage set error:', error);
          throw error;
        }
      }
    },
    local: {
      get: async (keys) => browser.storage.local.get(keys),
      set: async (items) => browser.storage.local.set(items)
    }
  }
};