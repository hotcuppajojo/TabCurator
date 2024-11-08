// tests/playwright/setup.js

import { chromium } from '@playwright/test';
import path from 'path';
import os from 'os';
import fs from 'fs';

export async function getExtensionId(context) {
  const extensionPath = path.resolve(__dirname, '../../build/chrome');

  // Verify extension path exists
  if (!fs.existsSync(extensionPath)) {
    throw new Error(`Extension path does not exist: ${extensionPath}`);
  }

  // Launch a new browser context with the extension loaded
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-user-data-dir-'));
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
      '--no-sandbox',
      '--disable-web-security',
      '--disable-features=ExtensionsToolbarMenu',
    ],
    channel: 'chrome', // Ensure we're using Chrome
  });

  // Listen for console messages from the background service worker
  context.on('serviceworker', worker => {
    worker.on('console', msg => console.log(`SW LOG (${worker.url()}): ${msg.text()}`));
    worker.on('pageerror', err => console.error(`SW ERROR (${worker.url()}): ${err.message}`));
  });

  // Open a new page to initialize the extension
  const page = await context.newPage();
  await page.goto('chrome://extensions/');

  // Wait for the background service worker to be available
  const serviceWorker = await context.waitForEvent('serviceworker', { timeout: 180000 });
  if (!serviceWorker) {
    console.error("Service worker is not accessible.");
    await context.close();
    throw new Error("Service worker is not accessible. Ensure the extension is loading properly.");
  }

  // Retrieve the extension ID from the service worker URL
  const extensionId = serviceWorker.url().split('/')[2];
  console.log(`Extension ID: ${extensionId}`);

  return extensionId;
}