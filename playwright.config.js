// playwright.config.js
import { defineConfig } from '@playwright/test';
import path from 'path';

const extensionPath = path.resolve(__dirname, 'build/chrome');

export default defineConfig({
  testDir: './tests/playwright',
  use: {
    headless: false,  // Extensions require non-headless mode
    viewport: { width: 1280, height: 720 },
    waitForEventTimeout: 5000,  // Reduced from 10000ms to 5000ms
    actionTimeout: 3000,  // Reduced from 5000ms to 3000ms
    navigationTimeout: 5000,  // Reduced from 10000ms to 5000ms
    timeout: 30000, // Reduced global timeout to 30 seconds
    // Add explicit wait times for locators
    expect: {
      timeout: 1000  // Reduced from 2000ms to 1000ms
    },
    launchOptions: {
      channel: 'chrome', // Use the Chrome browser
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
        '--no-sandbox',
        '--disable-web-security',
        '--disable-features=ExtensionsToolbarMenu',
        '--disable-site-isolation-trials', // Added for service worker stability
        '--disable-web-security', // Allow eval in tests
        '--ignore-certificate-errors',
        '--allow-insecure-localhost',
      ],
      slowMo: 50, // Minimal slowdown for stability
      timeout: 120000, // Ensure adequate timeout for extension loading
    },
    javaScriptEnabled: true,
    trace: 'on-first-retry', // Enable trace for failed tests
    video: 'retain-on-failure', // Record video on failure
    // serviceWorkers: 'allow', // Remove or comment out this line
  },
  retries: 2, // Increase retries
  workers: 1, // Run tests serially for more stability
  reporter: [['list']],
  timeout: 120000, // Increase global timeout
  projects: [
    {
      name: 'chromium',
      use: {
        // ...existing project settings...
      },
      timeout: 120000, // Increased project-specific timeout
    },
    // ...other projects if any...
  ],
});

// Verify that only relevant configurations are present.
// Remove or comment out any unrelated timeout settings that might have been accidentally added.

// Example:
// // Remove or comment out unintended timeout settings
// // timeout: 5000, // Example reduction from a higher value to 5 seconds
