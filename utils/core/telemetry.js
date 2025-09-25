// utils/core/telemetry.js
/**
 * @fileoverview Telemetry utilities for performance and event monitoring.
 * Handles event batching, throttling, and opt-in/out.
 * 
 * @module utils/core/telemetry
 */

import { CONFIG } from './config.js';

const TELEMETRY_EVENTS = Object.freeze({
  TAB_CREATED: 'TAB_CREATED',
  TAB_REMOVED: 'TAB_REMOVED',
  TAB_SUSPENDED: 'TAB_SUSPENDED',
  SESSION_SAVED: 'SESSION_SAVED',
  SESSION_RESTORED: 'SESSION_RESTORED',
  RULE_APPLIED: 'RULE_APPLIED',
  ERROR: 'ERROR',
  PERFORMANCE: 'PERFORMANCE'
});

let enabled = true; // We'll enable this in user settings later
let eventQueue = [];
let flushTimeout = null;

/**
 * Records a telemetry event.
 * @param {string} event - The event type.
 * @param {Object} [data={}] - Additional event data.
 */
export function recordTelemetry(event, data = {}) {
  if (!enabled) return;
  eventQueue.push({
    event,
    data,
    timestamp: Date.now()
  });
  scheduleFlush();
}

/**
 * Schedules a flush of the telemetry event queue.
 */
function scheduleFlush() {
  if (flushTimeout) return;
  flushTimeout = setTimeout(flushTelemetry, CONFIG.TELEMETRY.FLUSH_INTERVAL || 30000);
}

/**
 * Flushes the telemetry event queue.
 * Saves events to browser.storage.local under 'telemetry_events'.
 */
export async function flushTelemetry() {
  if (!eventQueue.length) {
    flushTimeout = null;
    return;
  }
  try {
    // Retrieve existing events
    const stored = await browser.storage.local.get('telemetry_events');
    const existing = Array.isArray(stored.telemetry_events) ? stored.telemetry_events : [];
    // Append new events
    const updated = [...existing, ...eventQueue];
    await browser.storage.local.set({ telemetry_events: updated });
  } catch (error) {
    console.error('[Telemetry] Failed to persist events:', error);
  }
  eventQueue = [];
  flushTimeout = null;
}

/**
 * Enables or disables telemetry collection.
 * @param {boolean} value
 */
export function setTelemetryEnabled(value) {
  enabled = !!value;
}

/**
 * Returns whether telemetry is enabled.
 * @returns {boolean}
 */
export function isTelemetryEnabled() {
  return enabled;
}

/**
 * Utility for recording performance metrics.
 * @param {string} operation - The operation name.
 * @param {number} duration - Duration in ms.
 * @param {Object} [meta={}] - Additional metadata.
 */
export function recordPerformance(operation, duration, meta = {}) {
  recordTelemetry(TELEMETRY_EVENTS.PERFORMANCE, {
    operation,
    duration,
    ...meta
  });
}

export { TELEMETRY_EVENTS };