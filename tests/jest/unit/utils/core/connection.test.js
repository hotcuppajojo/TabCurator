import {
  connectToBackground,
  sendMessageToBackground,
  listenForMessages,
  broadcastMessage,
  validateMessage
} from '../../../../utils/core/connection.js';

describe('connection module', () => {
  beforeAll(() => {
    global.chrome = {
      runtime: {
        connect: jest.fn().mockReturnValue('PORT'),
        sendMessage: jest.fn().mockResolvedValue('RESPONSE'),
        onMessage: {
          addListener: jest.fn(fn => global.chrome.runtime_onMessage.listeners.push(fn)),
          removeListener: jest.fn()
        }
      },
      runtime_onMessage: { listeners: [] }
    };
  });

  test('connectToBackground uses chrome.runtime.connect', () => {
    expect(connectToBackground()).toBe('PORT');
    expect(chrome.runtime.connect).toHaveBeenCalledWith({ name: 'tabActivity' });
  });

  test('sendMessageToBackground resolves correctly', async () => {
    await expect(sendMessageToBackground('act', { foo: 'bar' })).resolves.toBe('RESPONSE');
  });

  test('listenForMessages should register listener and invoke callback', () => {
    const cb = jest.fn();
    listenForMessages(cb);
    // simulate incoming message
    global.chrome.runtime_onMessage.listeners.forEach(fn => fn({type:'X'}, 'sender','resp'));
    expect(cb).toHaveBeenCalledWith({type:'X'}, 'sender', 'resp');
  });

  test('broadcastMessage is callable', async () => {
    await expect(broadcastMessage({test:1})).resolves.toBeUndefined();
  });

  test('validateMessage must be boolean', () => {
    expect(validateMessage(null)).toBe(false);
    expect(validateMessage({})).toBe(false);
    expect(validateMessage({ type: 'X' })).toBe(true);
  });
});

// Test error handling in sendMessageToBackground

describe('connection module - error handling', () => {
  test('sendMessageToBackground handles runtime errors', async () => {
    // Mock console.error to suppress and verify error logging
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    
    // Setup Chrome runtime to throw an error with the expected message
    global.chrome = {
      runtime: {
        sendMessage: jest.fn().mockImplementation(() => {
          throw new Error('Failed to send message to background');
        })
      }
    };
    
    // Test error handling
    await expect(sendMessageToBackground('TEST_ACTION', { data: 123 }))
      .rejects
      .toThrow('Failed to send message to background');
    
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
      action: 'TEST_ACTION', 
      payload: { data: 123 }
    });
    
    // Verify console.error was called with expected message
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Failed to send message to background: Failed to send message to background'
    );
    
    // Clean up the spy
    consoleErrorSpy.mockRestore();
  });
  
  test('broadcastMessage resolves gracefully when no implementation', async () => {
    // Spy on console.error to ensure no unexpected logs
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    
    // broadcastMessage as defined returns undefined, so promise resolves
    await expect(broadcastMessage({ type: 'TEST' })).resolves.toBeUndefined();
    
    consoleErrorSpy.mockRestore();
  });
});