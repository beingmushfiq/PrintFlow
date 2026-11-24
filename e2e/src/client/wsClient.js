/**
 * PrintFlow Reverb / Pusher WebSocket Client & Simulator
 *
 * Implements:
 * - Reverb / Pusher v7 WebSocket wire protocol
 * - Presence channel subscriptions (presence-tenant.{tenantId}.agents)
 * - Order tracking private/public channels (order.{token})
 * - Heartbeat ping-pong mechanism (pusher:ping / pusher:pong)
 * - Event listener queue with promise-based waitForEvent() helpers
 * - Seamless offline mock mode for isolated unit/integration verification
 */

import { EventEmitter } from 'node:events';

export class WsClient extends EventEmitter {
  /**
   * @param {object} [options]
   * @param {string} [options.url] WebSocket server URL (e.g., ws://localhost:8080/app/printflow-key)
   * @param {string} [options.appKey='printflow-key'] Reverb app key
   * @param {string} [options.host='localhost']
   * @param {number} [options.port=8080]
   * @param {number} [options.heartbeatIntervalMs=30000] Heartbeat ping interval (30s)
   * @param {boolean} [options.mock=false] Run in simulated mock mode without network connection
   */
  constructor(options = {}) {
    super();
    this.appKey = options.appKey || process.env.REVERB_APP_KEY || 'printflow-key';
    this.host = options.host || process.env.REVERB_HOST || 'localhost';
    this.port = options.port || Number(process.env.REVERB_PORT || 8080);
    this.heartbeatIntervalMs = options.heartbeatIntervalMs || 30000;
    this.mock = options.mock || false;

    this.url = options.url || `ws://${this.host}:${this.port}/app/${this.appKey}?protocol=7&client=js&version=8.4.0&flash=false`;

    this.socket = null;
    this.socketId = null;
    this.connected = false;
    this.channels = new Set();
    this.heartbeatTimer = null;
    this.pendingEventListeners = new Map();
  }

  /**
   * Connects to Reverb WebSocket server or initializes mock connection.
   * @returns {Promise<string>} Resolves with socket_id upon connection established
   */
  async connect() {
    if (this.mock) {
      this.connected = true;
      this.socketId = `mock-socket-${Date.now()}`;
      this.startHeartbeat();
      this.emit('connected', { socketId: this.socketId });
      return this.socketId;
    }

    return new Promise((resolve, reject) => {
      const WebSocketClass = globalThis.WebSocket;
      if (!WebSocketClass) {
        return reject(new Error('globalThis.WebSocket is not supported in this runtime environment'));
      }

      try {
        this.socket = new WebSocketClass(this.url);
      } catch (err) {
        return reject(err);
      }

      const connectionTimeout = setTimeout(() => {
        if (!this.connected) {
          this.disconnect();
          reject(new Error(`WebSocket connection timeout to ${this.url}`));
        }
      }, 5000);

      this.socket.onopen = () => {
        // Socket open, wait for pusher:connection_established
      };

      this.socket.onerror = (err) => {
        clearTimeout(connectionTimeout);
        this.emit('error', err);
        if (!this.connected) {
          reject(err);
        }
      };

      this.socket.onclose = (event) => {
        clearTimeout(connectionTimeout);
        this.handleClose(event);
      };

      this.socket.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          this.handleMessage(payload, resolve, connectionTimeout);
        } catch (err) {
          this.emit('error', err);
        }
      };
    });
  }

  /**
   * Handles incoming WebSocket messages.
   */
  handleMessage(payload, resolveConnect = null, connectionTimeout = null) {
    const { event, channel, data } = payload;
    let parsedData = data;
    if (typeof data === 'string') {
      try {
        parsedData = JSON.parse(data);
      } catch (e) {
        parsedData = data;
      }
    }

    if (event === 'pusher:connection_established') {
      if (connectionTimeout) clearTimeout(connectionTimeout);
      this.connected = true;
      this.socketId = parsedData?.socket_id || 'reverb-socket-id';
      this.startHeartbeat();
      this.emit('connected', { socketId: this.socketId });
      if (resolveConnect) resolveConnect(this.socketId);
      return;
    }

    if (event === 'pusher:pong') {
      this.emit('pong', parsedData);
      return;
    }

    if (event === 'pusher_internal:subscription_succeeded') {
      this.emit('subscribed', { channel, data: parsedData });
      return;
    }

    // Standard application event
    this.emit(event, { channel, data: parsedData });
    if (channel) {
      this.emit(`${channel}:${event}`, parsedData);
    }

    // Check pending event promises
    const listeners = this.pendingEventListeners.get(event) || [];
    for (let i = listeners.length - 1; i >= 0; i--) {
      const { resolve, filter } = listeners[i];
      if (!filter || filter(parsedData, channel)) {
        resolve({ channel, data: parsedData });
        listeners.splice(i, 1);
      }
    }
  }

  /**
   * Subscribes to a channel (public, private, or presence).
   * @param {string} channel
   * @param {string} [auth] Optional auth token for private/presence channels
   * @param {string} [channelData] Presence channel data
   */
  subscribe(channel, auth = null, channelData = null) {
    this.channels.add(channel);

    const message = {
      event: 'pusher:subscribe',
      data: {
        channel,
        ...(auth ? { auth } : {}),
        ...(channelData ? { channel_data: channelData } : {}),
      },
    };

    this.send(message);

    if (this.mock) {
      // In mock mode, immediately simulate subscription success
      setImmediate(() => {
        this.handleMessage({
          event: 'pusher_internal:subscription_succeeded',
          channel,
          data: {},
        });
      });
    }

    return this;
  }

  /**
   * Sends heartbeat ping (pusher:ping).
   */
  ping() {
    this.send({ event: 'pusher:ping', data: {} });
    if (this.mock) {
      setImmediate(() => {
        this.emit('pong', {});
      });
    }
  }

  /**
   * Starts periodic heartbeat timer.
   */
  startHeartbeat() {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (this.connected) {
        this.ping();
      }
    }, this.heartbeatIntervalMs);
  }

  /**
   * Stops heartbeat timer.
   */
  stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  /**
   * Raw JSON message sending.
   * @param {object} message
   */
  send(message) {
    if (this.mock) {
      this.emit('sent', message);
      return;
    }

    if (this.socket && this.socket.readyState === 1) { // 1 = OPEN
      this.socket.send(JSON.stringify(message));
    }
  }

  /**
   * Waits for a specific event to be received within timeout.
   * @param {string} eventName
   * @param {number} [timeoutMs=5000]
   * @param {function} [filter] Optional filter function (data, channel) => boolean
   * @returns {Promise<object>} Resolves with { channel, data }
   */
  async waitForEvent(eventName, timeoutMs = 5000, filter = null) {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        // Cleanup listener on timeout
        const listeners = this.pendingEventListeners.get(eventName) || [];
        const index = listeners.findIndex((l) => l.resolve === resolve);
        if (index !== -1) listeners.splice(index, 1);

        reject(new Error(`Timed out waiting for WebSocket event "${eventName}" after ${timeoutMs}ms`));
      }, timeoutMs);

      const wrappedResolve = (result) => {
        clearTimeout(timeoutId);
        resolve(result);
      };

      if (!this.pendingEventListeners.has(eventName)) {
        this.pendingEventListeners.set(eventName, []);
      }
      this.pendingEventListeners.get(eventName).push({ resolve: wrappedResolve, filter });
    });
  }

  /**
   * Simulates an incoming server event (useful for test assertions in mock mode).
   * @param {string} event
   * @param {string} channel
   * @param {object} data
   */
  simulateServerEvent(event, channel, data) {
    this.handleMessage({ event, channel, data });
  }

  /**
   * Handles socket close.
   */
  handleClose(event) {
    this.connected = false;
    this.stopHeartbeat();
    this.emit('closed', event);
  }

  /**
   * Disconnects and cleans up timers and connections.
   */
  disconnect() {
    this.stopHeartbeat();
    this.connected = false;
    if (this.socket) {
      try {
        this.socket.close();
      } catch (e) {
        // Ignore
      }
      this.socket = null;
    }
    this.emit('disconnected');
  }
}
