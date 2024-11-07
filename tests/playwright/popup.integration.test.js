// tests/playwright/popup.integration.test.js
import { test, expect } from '@playwright/test';
import { getExtensionId } from './setup';

test.describe("Popup script integration tests", () => {
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

  test("should load and display tabs in the popup", async ({ browser }) => {
    const context = await browser.newContext({ channel: 'chrome' });
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/popup.html`);

    const tabListItems = await page.$$('#tab-list div');
    expect(tabListItems.length).toBe(2);

    const tabs = await Promise.all(tabListItems.map(item => item.textContent()));
    expect(tabs).toEqual(["Tab 1", "Tab 2"]);

    await context.close();
  });

  test("should handle suspend button click in the popup", async ({ browser }) => {
    const context = await browser.newContext({ channel: 'chrome' });
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/popup.html`);

    await page.click('#suspend-inactive-tabs');

    const actionPerformed = await context.evaluate(() => globalThis.suspendActionPerformed || false);
    expect(actionPerformed).toBe(true);

    await context.close();
  });

  test("should handle errors gracefully", async ({ browser }) => {
    const context = await browser.newContext({ channel: 'chrome' });
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/popup.html`);

    await context.evaluate(() => {
      chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.action === "suspendInactiveTabs") throw new Error("Simulated error");
      });
    });

    await page.click('#suspend-inactive-tabs');
    const consoleMessages = await page.evaluate(() => window.consoleMessages || []);
    expect(consoleMessages).toContain("Error: Simulated error");

    await context.close();
  });
});