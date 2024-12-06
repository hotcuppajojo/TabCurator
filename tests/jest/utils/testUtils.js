// tests/jest/utils/testUtils.js
/**
 * Common test utilities and mock data generators
 */
export const createMockTab = (id, options = {}) => ({
  id,
  title: options.title || `Tab ${id}`,
  url: options.url || `https://example${id}.com`,
  windowId: options.windowId || 1,
  active: options.active || false,
  discarded: options.discarded || false,
  ...options
});

export const createBulkTabs = (count, options = {}) => 
  Array.from({ length: count }, (_, i) => createMockTab(i + 1, options));

export const createTaggedTab = (id, tag, baseTitle = `Tab ${id}`) => 
  createMockTab(id, { title: `[${tag}] ${baseTitle}` });

export const createComplexTabs = () => [
  createMockTab(1, { title: 'Tab with [existing] tag' }),
  createMockTab(2, { title: 'Tab with special chars: !@#$' }),
  createMockTab(3, { title: 'Duplicate URL', url: 'https://duplicate.com' }),
  createMockTab(4, { title: 'Duplicate URL', url: 'https://duplicate.com' }),
  createMockTab(5, { title: 'Very'.repeat(100) }) // Long title
];