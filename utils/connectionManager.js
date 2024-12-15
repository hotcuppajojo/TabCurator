// utils/connectionManager.js

import browser from 'webextension-polyfill';
import { MESSAGE_TYPES } from './types.js';

class ConnectionManager {
  constructor() {
    this.connections = new Map();
    this.messageQueue = [];
    this.isProcessingQueue = false;
  }

  async connect() {
    const connectionId = crypto.randomUUID();
    const port = browser.runtime.connect({ name: 'tabActivity' });

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Connection timeout')), 5000);

      port.onMessage.addListener((msg) => {
        if (msg.type === MESSAGE_TYPES.CONNECTION_ACK) {
          clearTimeout(timeout);
          this.connections.set(connectionId, { port, timestamp: Date.now() });
          resolve(connectionId);
        }
      });

      port.onDisconnect.addListener(() => {
        this.connections.delete(connectionId);
        reject(new Error('Connection lost'));
      });
    });
  }

  async sendMessage(connectionId, message) {
    const connection = this.connections.get(connectionId);
    if (!connection) throw new Error('No active connection');

    return new Promise((resolve, reject) => {
      const requestId = Date.now().toString();
      const timeout = setTimeout(() => reject(new Error('Message timeout')), 5000);

      const handler = (response) => {
        if (response.requestId === requestId) {
          clearTimeout(timeout);
          connection.port.onMessage.removeListener(handler);
          resolve(response.payload);
        }
      };

      connection.port.onMessage.addListener(handler);
      connection.port.postMessage({ ...message, requestId });
    });
  }

  disconnect(connectionId) {
    const connection = this.connections.get(connectionId);
    if (connection) {
      connection.port.disconnect();
      this.connections.delete(connectionId);
    }
  }
}

export const connection = new ConnectionManager();
