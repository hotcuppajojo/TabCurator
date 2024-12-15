// playwright.config.js
import { defineConfig } from '@playwright/test';
import path from 'path';

const extensionPath = path.join(__dirname, 'build/chrome');

export default defineConfig({
  testDir: './tests/playwright',
  use: {
    headless: false,
    channel: 'chrome',
    viewport: { width: 1280, height: 720 },
    launchOptions: {
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
        '--disable-extensions-file-access-check',
        '--disable-web-security',
        '--use-fake-ui-for-media-stream', // Example of additional argument
      ]
    },
    trace: 'on-first-retry', // Enable tracing for debugging
  },
  timeout: 30000,
  workers: 1,
  reporter: [['list']]
});