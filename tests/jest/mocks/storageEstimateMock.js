export const createStorageEstimateMock = () => ({
  quota: 100 * 1024 * 1024, // 100MB
  usage: 10 * 1024 * 1024,  // 10MB
  usageDetails: {
    'persistent': 8 * 1024 * 1024,
    'temporary': 2 * 1024 * 1024
  }
});

export const createNavigatorMock = () => ({
  storage: {
    estimate: jest.fn().mockResolvedValue(createStorageEstimateMock())
  }
});
