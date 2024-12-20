import { jest } from '@jest/globals';
import { 
  createTab, 
  updateTab, 
  discardTab,
  validateTab,
  processTabBatch
} from '../../../utils/tabManager';

describe('Tab Manager Unit Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('validateTab', () => {
    test('should validate correct tab object', () => {
      const validTab = { id: 1, url: 'https://example.com' };
      expect(() => validateTab(validTab)).not.toThrow();
    });

    test('should throw on invalid tab object', () => {
      const invalidTab = { url: 'https://example.com' };
      expect(() => validateTab(invalidTab)).toThrow('Invalid tab ID');
    });
  });

  describe('processTabBatch', () => {
    test('should process tab batches correctly', async () => {
      const tabs = [{ id: 1 }, { id: 2 }, { id: 3 }];
      const batchSize = 2;
      const generator = processTabBatch(tabs, batchSize);
      
      const results = [];
      for await (const batch of generator) {
        results.push(batch);
      }
      
      expect(results).toHaveLength(2);
      expect(results[0]).toHaveLength(2);
      expect(results[1]).toHaveLength(1);
    });
  });

  // ... add more test cases for other functions
});
