// tests/playwright/setup.js

import { chromium } from '@playwright/test';
import path from 'path';
import os from 'os';
import fs from 'fs';
import fsPromises from 'fs/promises';

/**
 * Retrieves the extension ID by launching a persistent Chromium context with the extension loaded.
 * @returns {Promise<{ context: import('playwright').BrowserContext, extensionId: string, serviceWorker: import('playwright').Worker }>}
 */
export async function getExtensionId() {
  const extensionPath = path.resolve(__dirname, '../../build/chrome');

  // Verify extension path exists
  if (!fs.existsSync(extensionPath)) {
    throw new Error(`Extension path does not exist: ${extensionPath}`);
  }

  // Create a unique temporary user data directory
  const userDataDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'user-data-dir-'));

  // Output the extension path and user data directory to the console for debugging
  console.log(`Launching Chromium with extension at: ${extensionPath}`);
  console.log(`Using temporary user data directory: ${userDataDir}`);

  // Launch a persistent context with the extension loaded
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
      '--no-sandbox',
    ],
    channel: 'chrome',
    timeout: 60000, // Add explicit timeout
  });

  // Wait for service worker with retries
  let serviceWorker;
  for (let i = 0; i < 3; i++) {
    try {
      serviceWorker = await context.waitForEvent('serviceworker', {
        predicate: (worker) => worker.url().includes('background/background.js'),
        timeout: 30000,
      });
      break;
    } catch (error) {
      console.log(`Attempt ${i + 1} to get service worker failed:`, error.message);
      if (i === 2) throw error;
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  const extensionId = serviceWorker.url().split('/')[2];
  console.log(`Extension ID: ${extensionId}`);

  return { context, extensionId, serviceWorker };
}