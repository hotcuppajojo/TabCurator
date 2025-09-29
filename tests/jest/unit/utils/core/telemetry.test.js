// Declare mockStorage and attach to global browser before importing telemetry module
const mockStorage = {
  get: jest.fn().mockResolvedValue({ telemetry_events: [] }),
  set: jest.fn().mockResolvedValue(),
  remove: jest.fn().mockResolvedValue()
};

// Ensure global.browser.storage.local is the mock used by telemetry module
global.browser = global.browser || {};
global.browser.storage = global.browser.storage || {};
global.browser.storage.local = mockStorage;

// Now require the telemetry module after the mock is in place
const {
  recordTelemetry,
  flushTelemetry,
  setTelemetryEnabled,
  isTelemetryEnabled,
  recordPerformance,
  TELEMETRY_EVENTS
} = require('../../../../utils/core/telemetry.js');

describe('telemetry utils', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockStorage.get.mockResolvedValue({ telemetry_events: [] });
    mockStorage.set.mockResolvedValue();
    mockStorage.remove.mockResolvedValue();
    setTelemetryEnabled(true);
  });

  test('recordTelemetry enqueues event and flush persists to storage', async () => {
    recordTelemetry(TELEMETRY_EVENTS.TAB_CREATED, { tabId: 1 });
    await flushTelemetry();

    expect(mockStorage.get).toHaveBeenCalledWith('telemetry_events');
    expect(mockStorage.set).toHaveBeenCalled();
    const setArg = mockStorage.set.mock.calls[0][0];
    expect(setArg).toHaveProperty('telemetry_events');
    expect(Array.isArray(setArg.telemetry_events)).toBe(true);
    expect(setArg.telemetry_events.length).toBeGreaterThanOrEqual(1);
    expect(setArg.telemetry_events[0]).toMatchObject({
      event: TELEMETRY_EVENTS.TAB_CREATED,
      data: { tabId: 1 }
    });
  });

  test('setTelemetryEnabled toggles telemetry collection', () => {
    setTelemetryEnabled(false);
    expect(isTelemetryEnabled()).toBe(false);
    setTelemetryEnabled(true);
    expect(isTelemetryEnabled()).toBe(true);
  });

  test('recordPerformance adds performance telemetry events', async () => {
    recordPerformance('test_operation', 123.45, { extra: 'data' });
    await flushTelemetry();

    expect(mockStorage.set).toHaveBeenCalled();
    const stored = mockStorage.set.mock.calls[0][0].telemetry_events;
    const perfEvent = stored.find(e => e.event === TELEMETRY_EVENTS.PERFORMANCE);
    expect(perfEvent).toBeDefined();
    expect(perfEvent.data).toMatchObject({ operation: 'test_operation', duration: 123.45, extra: 'data' });
  });
  
  test('flushTelemetry handles empty queue correctly', async () => {
    await flushTelemetry(); // no events enqueued
    expect(mockStorage.get).not.toHaveBeenCalled(); // nothing to persist
  });
  
  test('flushTelemetry handles storage errors', async () => {
    // Mock console.error to suppress and verify error logging
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    
    mockStorage.get.mockRejectedValueOnce(new Error('storage failure'));
    // enqueue and attempt to flush; error should be caught and not throw
    recordTelemetry(TELEMETRY_EVENTS.TAB_CREATED, { tabId: 2 });
    await expect(flushTelemetry()).resolves.toBeUndefined();
    
    // Verify console.error was called with expected message
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[Telemetry] Failed to persist events:',
      expect.any(Error)
    );
    
    // Clean up the spy
    consoleErrorSpy.mockRestore();
  });
});