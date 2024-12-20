import { test, expect } from '@playwright/test';
import { setupBrowserContext } from '../setup';

test.describe('Tab Operations E2E Tests', () => {
  let context;
  let page;

  test.beforeEach(async () => {
    ({ context, page } = await setupBrowserContext());
  });

  test.afterEach(async () => {
    await context.close();
  });

  test('should create and manage tabs', async () => {
    // Open new tab
    await page.click('[data-testid="new-tab-button"]');
    
    // Verify tab was created
    const tabs = await context.pages();
    expect(tabs).toHaveLength(2);

    // Tag the tab
    await page.click('[data-testid="tag-tab-button"]');
    await page.fill('[data-testid="tag-input"]', 'TestTag');
    await page.click('[data-testid="save-tag-button"]');

    // Verify tag was applied
    const tabTitle = await page.title();
    expect(tabTitle).toContain('[TestTag]');
  });

  // ... add more E2E test cases
});
