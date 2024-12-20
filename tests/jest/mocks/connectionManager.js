// tests/jest/mocks/connectionManager.js

export const connection = {
  initialize: jest.fn().mockResolvedValue(undefined),
  handleMessage: jest.fn(),
  handlePort: jest.fn(),
  cleanupConnections: jest.fn().mockResolvedValue(undefined),
  getConnectionMetrics: jest.fn().mockReturnValue({
    successful: 0,
    failed: 0,
    activeConnections: 0
  })
};