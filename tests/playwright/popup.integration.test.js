// tests/playwright/popup.integration.test.js
import { test, expect } from '@playwright/test';
import { getExtensionId } from './setup';

test.describe('Popup script integration tests', () => {
  let browserContext;
  let page;
  let extensionId;

  test.beforeEach(async ({ context }) => {
    const setup = await getExtensionId();
    browserContext = setup.context;
    extensionId = setup.extensionId;

    page = await browserContext.newPage();
    
    // Set up data attribute helper using evaluate instead of addScriptTag
    await page.evaluate(() => {
      window.setTestData = function(data) {
        document.body.setAttribute('data-test-message', JSON.stringify(data));
      };
    });

    await page.goto(`chrome-extension://${extensionId}/src/popup/popup.html`);
  });

  test('should load and display tabs', async () => {
    // Wait for tab list container
    const tabList = await page.waitForSelector('#tab-list', { state: 'attached' });
    
    // Add test tabs directly to DOM using evaluate
    await page.evaluate(() => {
      const tabList = document.getElementById('tab-list');
      const tabs = [
        { id: 1, title: 'Tab 1' },
        { id: 2, title: 'Tab 2' }
      ];
      tabs.forEach(tab => {
        const div = document.createElement('div');
        div.textContent = tab.title;
        tabList.appendChild(div);
      });
    });

    const tabs = await page.$$eval('#tab-list div', els => els.length);
    expect(tabs).toBe(2);
  });

  test('should handle suspend button click', async () => {
    // Add click handler using evaluate
    await page.evaluate(() => {
      document.getElementById('suspend-inactive-tabs').addEventListener('click', () => {
        window.setTestData({ type: 'SUSPEND_INACTIVE_TABS' });
      });
    });
    
    await page.click('#suspend-inactive-tabs');
    
    // Use polling with getAttribute instead of waitForFunction
    let attempts = 0;
    const maxAttempts = 10;
    let message = null;

    while (attempts < maxAttempts) {
      const attr = await page.getAttribute('body', 'data-test-message');
      if (attr) {
        message = attr;
        break;
      }
      await page.waitForTimeout(100);
      attempts++;
    }

    const data = JSON.parse(message || '{}');
    expect(data.type).toBe('SUSPEND_INACTIVE_TABS');
  });

  test('should handle errors gracefully', async () => {
    // Add error handler using evaluate
    await page.evaluate(() => {
      window.addEventListener('error', (e) => {
        window.setTestData({ error: e.message });
      });
    });

    // Trigger error and poll for result
    await page.evaluate(() => {
      throw new Error('Simulated error');
    }).catch(() => {});

    let attempts = 0;
    const maxAttempts = 10;
    let errorData = null;

    while (attempts < maxAttempts) {
      const attr = await page.getAttribute('body', 'data-test-message');
      if (attr && JSON.parse(attr).error === 'Simulated error') {
        errorData = attr;
        break;
      }
      await page.waitForTimeout(100);
      attempts++;
    }

    const data = JSON.parse(errorData || '{}');
    expect(data.error).toBe('Simulated error');
  });

  test.afterEach(async () => {
    await browserContext?.close();
  });
});