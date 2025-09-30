// test-service-worker-fix.js
// Simple test to verify service worker context detection

// Test the service worker detection logic
function testServiceWorkerDetection() {
  // Simulate service worker environment
  const originalImportScripts = globalThis.importScripts;
  const originalSelf = globalThis.self;
  const originalWindow = globalThis.window;
  
  console.log('=== Testing Service Worker Detection Logic ===');
  
  // Test 1: Normal browser environment (should NOT be detected as service worker)
  globalThis.window = {}; // Simulate browser window
  delete globalThis.importScripts;
  
  const isServiceWorker1 = typeof importScripts === 'function' || 
                          (typeof self !== 'undefined' && self.constructor.name === 'ServiceWorkerGlobalScope') ||
                          (typeof globalThis !== 'undefined' && globalThis.chrome && !globalThis.window);
  
  console.log('Test 1 - Browser environment:', isServiceWorker1 ? 'DETECTED as service worker (WRONG)' : 'NOT detected as service worker (CORRECT)');
  
  // Test 2: Service worker environment (should be detected)
  delete globalThis.window; // Remove window
  globalThis.chrome = { runtime: {} }; // Simulate Chrome APIs
  
  const isServiceWorker2 = typeof importScripts === 'function' || 
                          (typeof self !== 'undefined' && self.constructor.name === 'ServiceWorkerGlobalScope') ||
                          (typeof globalThis !== 'undefined' && globalThis.chrome && !globalThis.window);
  
  console.log('Test 2 - Service worker environment:', isServiceWorker2 ? 'DETECTED as service worker (CORRECT)' : 'NOT detected as service worker (WRONG)');
  
  // Test 3: Service worker with importScripts
  globalThis.importScripts = function() {};
  
  const isServiceWorker3 = typeof importScripts === 'function' || 
                          (typeof self !== 'undefined' && self.constructor.name === 'ServiceWorkerGlobalScope') ||
                          (typeof globalThis !== 'undefined' && globalThis.chrome && !globalThis.window);
  
  console.log('Test 3 - Service worker with importScripts:', isServiceWorker3 ? 'DETECTED as service worker (CORRECT)' : 'NOT detected as service worker (WRONG)');
  
  // Restore original values
  if (originalImportScripts) {
    globalThis.importScripts = originalImportScripts;
  } else {
    delete globalThis.importScripts;
  }
  
  if (originalSelf) {
    globalThis.self = originalSelf;
  }
  
  if (originalWindow) {
    globalThis.window = originalWindow;
  }
  
  console.log('=== Test Complete ===');
}

// Run the test
testServiceWorkerDetection();

console.log('\n=== Expected Behavior ===');
console.log('- In popup/options pages: sync messages should be sent');
console.log('- In service worker: sync messages should be skipped to prevent loops');
console.log('- Global references should use globalThis instead of global');
console.log('- Connection errors should be eliminated');