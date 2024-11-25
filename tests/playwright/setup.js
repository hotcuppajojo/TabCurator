// tests/playwright/setup.js

import { chromium } from '@playwright/test';
import path from 'path';
import os from 'os';
import fs from 'fs';

export async function getExtensionId() {
  const extensionPath = path.resolve(__dirname, '../../build/chrome');

  // Verify extension path exists
  if (!fs.existsSync(extensionPath)) {
    throw new Error(`Extension path does not exist: ${extensionPath}`);
  }

  const context = await chromium.launchPersistentContext('', {
    headless: false,
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
    ],
    channel: 'chrome',
    timeout: 30000, // Add explicit timeout
  });

  try {
    const serviceWorker = await context.waitForEvent('serviceworker', {
      predicate: (worker) => worker.url().includes('background/background.js'),
      timeout: 30000,
    });

    if (!serviceWorker) {
      throw new Error('Service worker not found');
    }

    const extensionId = serviceWorker.url().split('/')[2];
    console.log(`Extension ID: ${extensionId}`);

    return { context, extensionId, serviceWorker };
  } catch (error) {
    await context.close();
    throw error;
  }
}