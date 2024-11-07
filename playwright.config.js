// playwright.config.js
import { defineConfig } from '@playwright/test';
import path from 'path';

const extensionPath = path.resolve(__dirname, 'build/chrome');

export default defineConfig({
  testDir: './tests/playwright',
  use: {
    headless: false,  // Extensions require non-headless mode
    viewport: { width: 1280, height: 720 },
    timeout: 60000, // 60 seconds
    launchOptions: {
      channel: 'chrome', // Use the Chrome browser
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
        '--no-sandbox',
        '--disable-web-security',
        '--disable-features=ExtensionsToolbarMenu',
      ],
    },
  },
  reporter: [['list']],
});
