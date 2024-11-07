// tests/playwright/options.integration.test.js
import { test, expect, chromium } from '@playwright/test';
import { getExtensionId } from './setup';

test.describe("Options page integration tests", () => {
  let extensionId;

  test.beforeAll(async () => {
    extensionId = await getExtensionId();
  });

  test.beforeEach(async ({ context }) => {
    context.on('page', (page) => {
      page.on('console', (msg) => console.log(`PAGE LOG: ${msg.text()}`));
      page.on('pageerror', (err) => console.error(`PAGE ERROR: ${err.message}`));
    });
  });

  test("should load and display saved threshold value", async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.goto(`chrome-extension://${extensionId}/options.html`);

    const input = await page.$('#inactiveThreshold');
    const value = await input.inputValue();
    expect(parseInt(value)).toBeGreaterThan(0);

    await context.close();
  });

  test("should save new threshold value when Save button is clicked", async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/options.html`);

    await page.fill('#inactiveThreshold', '30');
    await page.click('#save-options');

    const savedValue = await page.$eval('#inactiveThreshold', el => el.value);
    expect(savedValue).toBe('30');

    await context.close();
  });

  test("should handle errors gracefully", async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/options.html`);

    await page.evaluate(() => {
      chrome.storage.sync.set = () => { throw new Error("Simulated error"); };
    });

    await page.click('#save-options');
    const consoleMessages = await page.evaluate(() => window.consoleMessages || []);
    expect(consoleMessages).toContain("Error: Simulated error");

    await context.close();
  });
});