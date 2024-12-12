// tests/playwright/setup.js

import { chromium } from '@playwright/test';
import path from 'path';
import os from 'os';
import fs from 'fs';
import fsPromises from 'fs/promises';

/**
 * Retrieves the extension ID and sets up the testing environment
 * @returns {Promise<{ context: import('playwright').BrowserContext, extensionId: string, serviceWorker: import('playwright').Worker }>}
 */
export async function getExtensionId() {
  let context;
  let extensionsPage;
  let extensionId;
  try {
    const pathToExtension = path.resolve(__dirname, '../../build/chrome');
    const userDataDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'user-data-dir-'));

    console.log(`Launching Chromium with extension at: ${pathToExtension}`);
    console.log(`Using temporary user data directory: ${userDataDir}`);

    context = await chromium.launchPersistentContext(userDataDir, {
      headless: false,
      args: [
        `--disable-extensions-except=${pathToExtension}`,
        `--load-extension=${pathToExtension}`,
        '--no-sandbox',
        '--disable-site-isolation-trials',
        '--disable-features=ExtensionsToolbarMenu'
      ]
    });

    // Navigate to extensions page and wait for it to load
    extensionsPage = await context.newPage();
    await extensionsPage.goto('chrome://extensions/');
    await extensionsPage.waitForLoadState('domcontentloaded');
    await extensionsPage.waitForTimeout(1000); // Wait for shadow DOM to be ready

    // Try CDP method first
    const client = await extensionsPage.context().newCDPSession(extensionsPage);
    const targets = await client.send('Target.getTargets');
    const extensionTarget = targets.targetInfos.find(t => 
      t.type === 'background_page' && t.url.startsWith('chrome-extension://')
    );
    extensionId = extensionTarget?.url.split('/')[2];

    if (!extensionId) {
      // Fall back to extensions page method
      extensionId = await extensionsPage.evaluate(async () => {
        // Method 1: Try shadow DOM
        const tryViaShadowDom = () => {
          const manager = document.querySelector('extensions-manager');
          const itemList = manager?.shadowRoot?.querySelector('extensions-item-list');
          const items = itemList?.shadowRoot?.querySelectorAll('extensions-item') || [];
          for (const item of items) {
            const id = item.shadowRoot?.querySelector('#id')?.textContent;
            if (id) return id;
          }
          return null;
        };

        // Method 2: Try extensions API
        const tryViaExtensionsApi = () => {
          return new Promise(resolve => {
            if (chrome.management) {
              chrome.management.getAll(extensions => {
                const found = extensions.find(ext => ext.name === 'TabCurator');
                resolve(found?.id);
              });
            } else {
              resolve(null);
            }
          });
        };

        // Method 3: Look for extension URL in iframes
        const tryViaIframes = () => {
          const iframes = document.querySelectorAll('iframe');
          for (const iframe of iframes) {
            const match = iframe.src.match(/chrome-extension:\/\/([^/]+)/);
            if (match) return match[1];
          }
          return null;
        };

        // Try all methods
        const id = tryViaShadowDom() || await tryViaExtensionsApi() || tryViaIframes();
        console.log('Found extension ID:', id);
        return id;
      });

      if (!extensionId) {
        const debug = await extensionsPage.evaluate(() => ({
          html: document.documentElement.innerHTML,
          shadowRoots: !!document.querySelector('extensions-manager')?.shadowRoot
        }));
        console.error('Extension ID detection failed. Debug info:', debug);
        throw new Error('Failed to find extension ID');
      }

      console.log('Successfully found extension ID:', extensionId);
    }

    // Setup extension resource routing
    await context.route('chrome-extension://*/*.{html,js,css}', async (route) => {
      const url = route.request().url();
      const filePath = url.replace(`chrome-extension://${extensionId}/`, '');
      try {
        const fullPath = path.join(pathToExtension, filePath);
        await route.fulfill({ path: fullPath });
      } catch (err) {
        console.error(`Failed to load extension resource: ${filePath}`, err);
        route.continue();
      }
    });

    // More robust service worker activation
    async function activateServiceWorker(extensionId) {
      const page = await context.newPage();
      try {
        console.log('Activating service worker...');
        await page.goto(`chrome-extension://${extensionId}/popup/popup.html`, {
          waitUntil: 'domcontentloaded',
          timeout: 10000
        });

        // Wait for potential worker registration
        await page.waitForTimeout(2000);

        let worker = await context.serviceWorkers().find(
          w => w.url().includes('background/background.js')
        );

        if (!worker) {
          console.warn('Service Worker not found initially. Attempting to activate via background page...');
          // Try activating via background page
          await page.goto(`chrome-extension://${extensionId}/_generated_background_page.html`);
          await page.waitForTimeout(2000);
          worker = await context.serviceWorkers().find(
            w => w.url().includes('background/background.js')
          );
        }

        if (worker) {
          console.log('Service Worker activated:', worker.url());
        } else {
          console.warn('Service Worker could not be activated.');
        }

        return worker;
      } catch (error) {
        console.error('Error activating service worker:', error);
        return null;
      } finally {
        await page.close().catch(console.warn);
      }
    }

    // Wait for service worker and ensure it's ready
    let serviceWorker;
    for (let i = 0; i < 3; i++) {
      serviceWorker = await activateServiceWorker(extensionId);
      if (serviceWorker) break;
      console.log(`Retrying service worker activation (${i + 1}/3)...`);
      await new Promise(r => setTimeout(r, 1000));
    }

    if (!serviceWorker) {
      console.warn('Service Worker is not available. Proceeding without it.');
    }

    // Clean up extensions page
    await extensionsPage.close();

    return { context, extensionId, serviceWorker };
  } catch (error) {
    if (extensionsPage) await extensionsPage.close().catch(() => {});
    if (context) await context.close().catch(() => {});
    console.error('Error in getExtensionId:', error);
    throw error;
  }
}

// Ensure no unintended lines are present.
// The setup should solely contain initialization logic relevant to Playwright tests.

// Example of ensuring no accidental insertions:
// Remove lines like:
// await page.waitForFunction(() => !!window.popupInstance, { timeout: 5000 });
// timeout: 5000, // Example reduction from a higher value to 5 seconds

const injectBrowserMock = async (page) => {
  // ...existing mock injection code...
  
  // Remove or comment out any serviceWorkers mocks
  // window.browser.serviceWorkers = {
  //   register: createMockFn(),
  //   // ...other serviceWorker mocks...
  // };
  
  // Ensure chrome alias
  window.chrome = window.browser;
  
  // Add test helpers
  window.testHelpers = {
    // ...existing test helpers...
  };
  
  // Debug helper
  window.browser._debug = {
    getMockCalls: (path) => {
      // ...existing debug helpers...
    }
  };
  
  console.log('Browser mock injected successfully.');
};