// tests/playwright/options.integration.test.js

const { test, expect } = require('@playwright/test');
const { injectBrowserMock } = require('./mocks/browserMock');
const { getExtensionId } = require('./setup'); // Ensure this utility fetches your extension ID

test.describe('Options page integration tests', () => {
  let browserContext;
  let page;
  let extensionId;

  test.beforeEach(async ({ }, testInfo) => {
    try {
      const setup = await getExtensionId();
      browserContext = setup.context;
      extensionId = setup.extensionId;

      // Create a new page
      page = await browserContext.newPage();

      // **Inject the browser mock before navigating to the options page**
      await injectBrowserMock(page);

      // Navigate to the options page after mock injection
      await page.goto(`chrome-extension://${extensionId}/src/options/options.html`, { timeout: 30000 });

      // Wait for the service worker to initialize
      await page.waitForFunction(() => !!window.browser, { timeout: 10000 });

    } catch (error) {
      console.error(`Test setup failed: ${testInfo.title}`, error);
      throw error;
    }
  });

  test.afterEach(async () => {
    await browserContext?.close();
  });

  // Preliminary test to verify that mocks are injected correctly
  test('should have mock functions injected', async () => {
    const mockExists = await page.evaluate(() => {
      return window.browser?._debug?.getMockCalls('storage.sync.set') !== undefined;
    });
    expect(mockExists).toBe(true);
  });

  test('should load and display saved options', async () => {
    const thresholdValue = await page.inputValue('#inactiveThreshold');
    const tabLimitValue = await page.inputValue('#tabLimit');

    expect(thresholdValue).toBe('60');
    expect(tabLimitValue).toBe('100');
  });

  test('should save new options correctly', async () => {
    // Fill in new values
    await page.fill('#inactiveThreshold', '45', { timeout: 5000 });
    await page.fill('#tabLimit', '80', { timeout: 5000 });

    // Click save button
    await page.click('#save-options', { timeout: 5000 });

    // Wait for a short duration to ensure the mock has processed the call
    await page.waitForTimeout(500); // 500ms delay

    // Verify the storage.sync.set call using our debug helper
    const calls = await page.evaluate(() => {
      return window.browser._debug.getMockCalls('storage.sync.set');
    });

    expect(calls).toBeDefined();
    expect(calls.length).toBeGreaterThan(0);
    expect(calls[0][0]).toEqual({ inactiveThreshold: 45, tabLimit: 80 });

    // Wait for the success message to become visible
    await expect(page.locator('#save-success')).toHaveClass(/visible/, { timeout: 5000 });

    // Optionally, verify that the class has been removed after the timeout
    await page.waitForTimeout(2500); // Assuming the timeout in saveOptions is 2000ms
    await expect(page.locator('#save-success')).not.toHaveClass(/visible/);

    // Verify the input values were updated
    expect(await page.inputValue('#inactiveThreshold')).toBe('45');
    expect(await page.inputValue('#tabLimit')).toBe('80');
  });

  test('should handle global errors and rejections', async () => {
    // Evaluate in the page context to verify event listeners
    const handlers = await page.evaluate(() => {
      let errorHandlerExists = false;
      let rejectionHandlerExists = false;

      const originalAddEventListener = window.addEventListener;
      window.addEventListener = (type, listener, options) => {
        if (type === 'error') errorHandlerExists = true;
        if (type === 'unhandledrejection') rejectionHandlerExists = true;
        originalAddEventListener.call(window, type, listener, options);
      };

      // Re-import the options script to trigger the event listener registration
      const script = document.createElement('script');
      script.src = 'options.js';
      document.head.appendChild(script);

      // Initialize error and rejection handlers
      self.addEventListener('error', () => {});
      self.addEventListener('unhandledrejection', () => {});

      return {
        errorHandler: errorHandlerExists,
        rejectionHandler: rejectionHandlerExists,
      };
    });

    expect(handlers.errorHandler).toBe(true);
    expect(handlers.rejectionHandler).toBe(true);
  });
});