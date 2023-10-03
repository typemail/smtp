import { Socket, connect } from 'net';
import { connect as tlsConnect } from 'tls';
import { resolveMx } from 'dns';
import { Wire } from 'streamwire';

import { SMTPMessage } from '../smtp/message.js';
import { EventEmitter } from 'events';
import { SMTPClientOptions, SMTPClientSecure } from './options.js';

const defaultSize = 1000000;

type EventName = 'ready' | 'error';

export declare interface SMTPClient {
  on(event: 'error', listener: () => void): this;

  /**
   * Adds a listener for the ready event.
   * @param event Event type. (ready)
   * @param listener Listener function.
   */
  on(event: 'ready', listener: () => void): this;

  off(event: 'error', listener: () => void): this;

  /**
   * Removes a listener for the ready event.
   * @param event Event type. (ready)
   * @param listener Listener function.
   */
  off(event: 'ready', listener: () => void): this;

  once(event: 'error', listener: () => void): this;
  once(event: 'ready', listener: () => void): this;

  removeAllListeners(event: EventName): this;
  addListener(event: EventName, listener: Function): this;
  removeListener(event: EventName, listener: Function): this;
  prependListener(event: EventName, listener: Function): this;
  prependOnceListener(event: EventName, listener: Function): this;
}

export class SMTPClient extends EventEmitter {
  private socket: Socket;
  private wire: Wire;
  private capabilities: string[] = [];
  private maxSize = defaultSize;
  private welcomed = false;

  constructor(options: SMTPClientOptions) {
    super();

    if (options.secure === SMTPClientSecure.TLS) {
      this.socket = tlsConnect({
        rejectUnauthorized: options.rejectUnauthorized,
      });
    } else {
      this.socket = connect({ host: options.hostname, port: options.port });
    }

    this.socket.on('connect', () => this.init());
    this.wire = new Wire(this.socket);
  }

  get connected() {
    return this.wire.readable && this.welcomed;
  }

  close(): void {
    this.wire.close();
  }

  connect(): Promise<void> {
    if (this.connected) {
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      const onReady = () => {
        resolve();
        this.removeListener('error', onError);
      };

      const onError = () => {
        reject();
        this.removeListener('ready', onReady);
      };

      this.once('ready', onReady);
      this.once('error', onError);
    });
  }

  private async smtpRead(): Promise<[number, string[]]> {
    const lines: string[] = [];
    while (true) {
      const line = await this.wire.readLine();
      const code = parseInt(line.split('-')[0].split(' ')[0]);
      if (!code || line.length < 4) {
        throw new Error('Invalid server response.');
      }
      const ended = line.charAt(3) !== '-';
      lines.push(line.substring(4));

      if (ended) {
        return [code, lines];
      }
    }
  }

  private async smtpSend(str: string, expectedCode = 250) {
    // TODO: use .wait()
    this.wire.writeLine(str.split('\r').join('').split('\n').join('\r\n'));
    const response = await this.smtpRead();
    if (response[0] !== expectedCode) {
      throw new Error(
        `Server returned an unexpected error code: ${response[0]} (${response[1]})`
      );
    }
    return response;
  }

  private async init() {
    this.welcomed = false;
    const welcome = await this.smtpRead();
    if (welcome[0] !== 220) {
      throw new Error(
        `Welcome message had an invalid error code: ${
          welcome[0]
        } (${welcome[1].join(' ')})`
      );
    }

    try {
      const ehlo = await this.smtpSend('EHLO');
      for (const line of ehlo[1]) {
        if (line.startsWith('SIZE ')) {
          this.maxSize = parseInt(line.replace('SIZE ', ''));
        } else {
          this.capabilities.push(line);
        }
      }
    } catch {
      await this.smtpSend('HELO');
    }

    this.welcomed = true;
    this.emit('ready');
  }

  async mail(message: SMTPMessage) {
    if (message.message.length > this.maxSize) {
      throw new Error('Size limit exceeded.');
    }

    await this.smtpSend(`MAIL FROM:<${message.sender}>`);
    for (const recipient of message.recipients) {
      await this.smtpSend(`RCPT TO:<${recipient}>`);
    }

    await this.smtpSend('DATA', 354);
    await this.smtpSend(message.message + '\n.');
  }
}

async function sendTo(options: SMTPClientOptions, message: SMTPMessage) {
  const client = new SMTPClient(options);
  await client.connect();
  await client.mail(message);
}

function mx(hostname: string): Promise<string> {
  return new Promise((resolve, reject) => {
    resolveMx(hostname, (err, addresses) => {
      if (err) {
        reject(err);
        return;
      }

      if (addresses.length === 0) {
        reject(new Error('Unable to retrieve MX records.'));
        return;
      }

      addresses.sort((a, b) => a.priority - b.priority);
      resolve(addresses[0].exchange);
    });
  });
}

export interface SendmailOptions {
  smtp?: SMTPClientOptions;
}

export async function sendmail(
  message: SMTPMessage,
  options?: SendmailOptions
) {
  if (!options?.smtp) {
    const recipientsByDomain: Record<string, string[]> = {};
    for (const recipient of message.recipients) {
      const split = recipient.split('@');
      const domain = split[1];

      if (recipientsByDomain[domain]) {
        recipientsByDomain[domain].push(recipient);
      } else {
        recipientsByDomain[domain] = [recipient];
      }
    }

    await Promise.all(
      Object.entries(recipientsByDomain).map(async ([domain, recipients]) => {
        try {
          domain = await mx(domain);
        } catch {}

        sendTo({ hostname: domain, port: 25 }, { ...message, recipients });
      })
    );
  } else {
    await sendTo(options.smtp, message);
  }
}
