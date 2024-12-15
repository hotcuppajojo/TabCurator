import { setupTest, cleanupTest } from './testSetup.js';

beforeEach(async () => {
  await setupTest();
});

afterEach(async () => {
  await cleanupTest();
});

// Perform cleanup after each test suite
afterAll(async () => {
  await cleanupTest();
});