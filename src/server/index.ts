import { createServer, Server, Socket } from 'net';
import { createServer as createTLSServer } from 'tls';
import { EventEmitter } from 'events';

import { SMTPServerConnectionEventListener } from './events.js';
import { SMTPServerOptions, SMTPServerSecureMode } from './options.js';
import { SMTPServerConnection } from './connection.js';
import { SERVER_SHUTTING_DOWN } from '../smtp/replies.js';

type EventName = 'connection' | 'close' | 'error' | 'listening';

export declare interface SMTPServer {
  /**
   * Adds a listener for a connection event.
   * @param event Event type. (connection)
   * @param listener Listener function.
   */
  on(event: 'connection', listener: SMTPServerConnectionEventListener): this;

  /**
   * Adds a listener for the error event.
   * @param event Event type. (error)
   * @param listener Listener function.
   */
  on(event: 'error', listener: () => void): this;

  /**
   * Adds a listener for the close event.
   * @param event Event type. (close)
   * @param listener Listener function.
   */
  on(event: 'close', listener: () => void): this;

  /**
   * Adds a listener for the listening event.
   * @param event Event type. (listening)
   * @param listener Listener function.
   */
  on(event: 'listening', listener: () => void): this;

  /**
   * Removes a listener for the listening event.
   * @param event Event type. (listening)
   * @param listener Listener function.
   */
  off(event: 'listening', listener: () => void): this;

  /**
   * Removes a listener for a connection event.
   * @param event Event type. (connection)
   * @param listener Listener function.
   */
  off(event: 'connection', listener: SMTPServerConnectionEventListener): this;

  /**
   * Removes a listener for the error event.
   * @param event Event type. (error)
   * @param listener Listener function.
   */
  off(event: 'error', listener: () => void): this;

  /**
   * Removes a listener for the close event.
   * @param event Event type. (close)
   * @param listener Listener function.
   */
  off(event: 'close', listener: () => void): this;

  once(event: 'listening', listener: () => void): this;
  once(event: 'connection', listener: SMTPServerConnectionEventListener): this;
  once(event: 'error', listener: () => void): this;
  once(event: 'close', listener: () => void): this;

  removeAllListeners(event: EventName): this;
  addListener(event: EventName, listener: Function): this;
  removeListener(event: EventName, listener: Function): this;
  prependListener(event: EventName, listener: Function): this;
  prependOnceListener(event: EventName, listener: Function): this;
}

export class SMTPServer extends EventEmitter {
  private server?: Server;
  private interval?: any;

  private connections: Set<SMTPServerConnection> = new Set();

  private options: SMTPServerOptions = {
    hostname: 'localhost',
    size: 10000000,
    authMethods: [],
  };

  get address() {
    return this.server?.address();
  }

  constructor(options?: SMTPServerOptions) {
    super();

    this.options = {
      ...this.options,
      ...options,
    };

    if (!this.options.authenticate) {
      this.options.authMethods = undefined;
    }

    this.interval = setInterval(() => this.pruneConnections(), 1000);
    if (this.options.secureMode === SMTPServerSecureMode.TLS) {
      if (!this.options.secureContext) {
        throw new Error(
          'secureContext is required for SMTPServerSecureMode.TLS'
        );
      }

      this.server = createTLSServer(
        {
          secureContext: this.options.secureContext,
        },
        socket => this.connection(socket)
      );
    } else {
      if (
        this.options.secureMode === SMTPServerSecureMode.STARTTLS &&
        !this.options.secureContext
      ) {
        throw new Error(
          'secureContext is required for SMTPServerSecureMode.STARTTLS'
        );
      }

      this.server = createServer(socket => this.connection(socket));
    }

    this.server.on('error', error => this.emit('error', error));
  }

  listen(
    port?: number,
    host?: string,
    backlog?: number,
    callback?: () => void
  ) {
    if (!this.server) {
      throw new Error('Unable to start listening.');
    }

    if (callback) {
      this.once('listening', callback);
    }
    this.server.once('listening', () => this.emit('listening'));
    this.server.listen(port, host, backlog);
  }

  close() {
    clearInterval(this.interval);

    this.connections.forEach(connection => {
      if (connection.connected) {
        connection.reply(...SERVER_SHUTTING_DOWN);
        connection.close();
      }
    });

    if (this.server) {
      this.server.close(() => this.server?.unref());
    }

    this.emit('close');
  }

  private connection(socket: Socket) {
    const connection = new SMTPServerConnection(socket, this.options);
    this.connections.add(connection);
    this.emit('connection', connection);
  }

  private pruneConnections() {
    this.connections.forEach(connection => {
      if (!connection.connected) {
        this.connections.delete(connection);
      }
    });
  }
}
