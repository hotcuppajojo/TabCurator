// playwright.config.js
import { defineConfig } from '@playwright/test';
import path from 'path';

const extensionPath = path.resolve(__dirname, 'build/chrome');

export default defineConfig({
  testDir: './tests/playwright',
  use: {
    headless: false,  // Extensions require non-headless mode
    viewport: { width: 1280, height: 720 },
    waitForEventTimeout: 60000,  // Increased timeout
    actionTimeout: 60000,  // Increased timeout
    navigationTimeout: 60000,  // Increased timeout
    timeout: 120000, // Increased overall test timeout
    // Add explicit wait times for locators
    expect: {
      timeout: 10000
    },
    launchOptions: {
      channel: 'chrome', // Use the Chrome browser
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
        '--no-sandbox',
        '--disable-web-security',
        '--disable-features=ExtensionsToolbarMenu',
      ],
      slowMo: 100, // Slow down Playwright operations by 100ms
    },
    javaScriptEnabled: true,
  },
  retries: 1,
  workers: 1, // Run tests serially for more stability
  reporter: [['list']],
});
