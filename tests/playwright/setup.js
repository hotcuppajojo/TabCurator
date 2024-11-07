// tests/playwright/setup.js

import { chromium } from '@playwright/test';
import path from 'path';
import os from 'os';
import fs from 'fs';

export async function getExtensionId() {
  const pathToExtension = path.resolve(__dirname, '../../build/chrome');

  // Launch a new browser context with the extension loaded
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-user-data-dir-'));
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    args: [
      `--disable-extensions-except=${pathToExtension}`,
      `--load-extension=${pathToExtension}`,
      '--no-sandbox',
      '--disable-web-security',
      '--disable-features=ExtensionsToolbarMenu',
    ],
    channel: 'chrome', // Ensure we're using Chrome
  });

  // Add logging to capture console messages and errors
  context.on('page', page => {
    page.on('console', msg => console.log(`PAGE LOG (${page.url()}): ${msg.text()}`));
    page.on('pageerror', error => console.error(`PAGE ERROR (${page.url()}): ${error}`));
  });
  // Add logging to capture service worker messages and errors
  context.on('serviceworker', worker => {
    worker.on('console', msg => console.log(`SW LOG (${worker.url()}): ${msg.text()}`));
    worker.on('pageerror', error => console.error(`SW ERROR (${worker.url()}): ${error}`));
  });
  // Open a new page to trigger the extension and wait for the service worker
  const [serviceWorker] = await Promise.all([
    context.waitForEvent('serviceworker'),
    context.newPage(),
  ]);
  // Check if the service worker is accessible
  if (!serviceWorker) {
    console.error("Service worker is not accessible.");
    await context.close();
    throw new Error("Service worker is not accessible. Ensure the extension is loading properly.");
  }

  // Wait for the background page to load and retrieve the extension ID
  const [backgroundPage] = context.backgroundPages();
  if (!backgroundPage) {
    throw new Error('Background page not found. Extension may not have loaded properly.');
  }

  const extensionId = backgroundPage.url().split('/')[2];
  console.log(`Extension ID: ${extensionId}`);

  // Close the context after retrieving the extension ID
  await context.close();

  return extensionId;
}