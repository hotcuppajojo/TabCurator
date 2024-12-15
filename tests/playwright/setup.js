// tests/playwright/setup.js

import { expect } from '@playwright/test';
import { chromium } from 'playwright'; // Import BrowserType directly
import path from 'path';
import fs from 'fs';
import fsPromises from 'fs/promises';
import os from 'os';

/**
 * Sets up a persistent browser context with the extension loaded.
 * @returns {Promise<{ context: import('playwright').BrowserContext, page: import('playwright').Page }>}
 */
export async function setupBrowserContext() {
  const extensionPath = path.resolve(__dirname, '../../build/chrome');

  if (!fs.existsSync(extensionPath) || !fs.existsSync(path.join(extensionPath, 'manifest.json'))) {
    throw new Error('Extension not found or manifest missing');
  }

  // Create a unique user data directory for the persistent context
  const userDataDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'pchrome-'));

  // Launch a persistent context using Chromium
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
      '--disable-extensions-file-access-check',
      '--disable-web-security'
    ]
  });

  // Give the extension some time to load
  await new Promise(r => setTimeout(r, 1000));

  const pages = context.pages();
  const page = pages.length > 0 ? pages[0] : await context.newPage();

  page.on('console', msg => console.log('Page log:', msg.text()));
  page.on('pageerror', err => console.error('Page error:', err));

  const extensionId = 'nfojpoonjbnmklchadfhaihdcgfgkdbo'; // Ensure this matches your actual extension ID

  // Check a test page to confirm the extension is accessible
  const testUrl = `chrome-extension://${extensionId}/test/test.html`;
  console.log('Attempting to load test page:', testUrl);

  const response = await page.goto(testUrl, { waitUntil: 'domcontentloaded', timeout: 10000 });
  if (!response || !response.ok()) {
    throw new Error(`Failed to load test page: ${response ? response.status() : 'no response'}`);
  }

  const heading = await page.textContent('h1');
  expect(heading).toBe('Extension Test Page');
  console.log('Test page loaded successfully, extension is accessible.');

  // Now navigate to the popup
  const popupUrl = `chrome-extension://${extensionId}/popup/popup.html`;
  console.log('Navigating to popup:', popupUrl);
  const popupResponse = await page.goto(popupUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

  if (!popupResponse || !popupResponse.ok()) {
    throw new Error(`Failed to load popup page: ${popupResponse ? popupResponse.status() : 'no response'}`);
  }

  console.log('Popup page loaded successfully.');

  return { context, page };
}