import { Socket } from 'net';
import { EventEmitter } from 'events';
import { TLSSocket } from 'tls';
import { Wire } from 'streamwire';
import { upgradeSocket } from '@typemail/starttls';

import { SMTPServerOptions, SMTPServerSecureMode } from './options.js';
import { SMTPMessage } from '../smtp/message.js';
import { SMTPCommand } from '../smtp/commands.js';
import * as SMTPReply from '../smtp/replies.js';
import {
  SMTPServerConnectionRejectedMessageEventListener,
  SMTPServerConnectionMessageEventListener,
  SMTPServerConnectionErrorEventListener,
} from './events.js';

const ending = '\r\n';
const defaultSize = 1000000;

const base64Decode = (input?: string): string => {
  if (!input) {
    return '';
  }

  return Buffer.from(input, 'base64').toString('utf-8');
};
const base64Encode = (input?: string): string => {
  if (!input) {
    return '';
  }

  return Buffer.from(input, 'utf-8').toString('base64');
};

type EventName = 'rejectedMessage' | 'message' | 'error' | 'close';

const enum ArgumentParserState {
  NAME,
  VALUE_UNTIL_SPACE,
  VALUE_UNTIL_GREATER_THAN,
  SEPARATOR,
}

function parseCommandArguments(argStr: string): Record<string, string> {
  const args: Record<string, string> = {};

  let name = '';
  let value = '';

  let state = ArgumentParserState.NAME;

  for (let i = 0; i < argStr.length; i++) {
    const code = argStr.charCodeAt(i);

    switch (state) {
      case ArgumentParserState.NAME:
        if (code >= 0x41 && code <= 0x5a) {
          // A-Z
          name += argStr.charAt(i);
        } else if (code >= 0x61 && code <= 0x7a) {
          // a-z
          name += argStr.charAt(i).toUpperCase();
        } else if (code === 0x3d) {
          // =
          state = ArgumentParserState.VALUE_UNTIL_SPACE;
        } else if (code === 0x3a) {
          // :
          state = ArgumentParserState.SEPARATOR;
        } else if (code === 0x20) {
          // space
          continue;
        } else {
          return {};
        }
        break;
      case ArgumentParserState.SEPARATOR:
        if (code === 0x3c) {
          // <
          state = ArgumentParserState.VALUE_UNTIL_GREATER_THAN;
        } else if (code === 0x20) {
          // space
          continue;
        } else {
          return {};
        }
        break;
      case ArgumentParserState.VALUE_UNTIL_SPACE:
        if (code === 0x20) {
          // space
          args[name] = value;
          name = '';
          value = '';
          state = ArgumentParserState.NAME;
        } else {
          value += argStr.charAt(i);
        }
        break;
      case ArgumentParserState.VALUE_UNTIL_GREATER_THAN:
        if (code === 0x3e) {
          // >
          args[name] = value;
          name = '';
          value = '';
          state = ArgumentParserState.NAME;
        } else {
          value += argStr.charAt(i);
        }
        break;
    }
  }

  if (name && value) {
    args[name] = value;
  }

  return args;
}

export declare interface SMTPServerConnection {
  /**
   * Adds a listener for a rejected message event.
   * @param event Event type. (rejectedMessage)
   * @param listener Listener function.
   */
  on(
    event: 'rejectedMessage',
    listener: SMTPServerConnectionRejectedMessageEventListener
  ): this;

  /**
   * Adds a listener for a message event.
   * @param event Event type. (message)
   * @param listener Listener function.
   */
  on(
    event: 'message',
    listener: SMTPServerConnectionMessageEventListener
  ): this;

  /**
   * Adds a listener for an error event.
   * @param event Event type. (error)
   * @param listener Listener function.
   */
  on(event: 'error', listener: SMTPServerConnectionErrorEventListener): this;

  /**
   * Adds a listener for a close event.
   * @param event Event type. (close)
   * @param listener Listener function.
   */
  on(event: 'close', listener: () => void): this;

  /**
   * Removes a listener for a rejected message event.
   * @param event Event type. (rejected)
   * @param listener Listener function.
   */
  off(
    event: 'rejectedMessage',
    listener: SMTPServerConnectionRejectedMessageEventListener
  ): this;

  /**
   * Removes a listener for a message event.
   * @param event Event type. (message)
   * @param listener Listener function.
   */
  off(
    event: 'message',
    listener: SMTPServerConnectionMessageEventListener
  ): this;

  /**
   * Removes a listener for an error event.
   * @param event Event type. (error)
   * @param listener Listener function.
   */
  off(event: 'error', listener: SMTPServerConnectionErrorEventListener): this;

  /**
   * Removes a listener for a close event.
   * @param event Event type. (close)
   * @param listener Listener function.
   */
  off(event: 'close', listener: () => void): this;

  once(
    event: 'rejectedMessage',
    listener: SMTPServerConnectionRejectedMessageEventListener
  ): this;
  once(
    event: 'message',
    listener: SMTPServerConnectionMessageEventListener
  ): this;
  once(event: 'error', listener: SMTPServerConnectionErrorEventListener): this;
  once(event: 'close', listener: () => void): this;

  removeAllListeners(event: EventName): this;
  addListener(event: EventName, listener: Function): this;
  removeListener(event: EventName, listener: Function): this;
  prependListener(event: EventName, listener: Function): this;
  prependOnceListener(event: EventName, listener: Function): this;
}

export class SMTPServerConnection extends EventEmitter {
  private greeted = false;
  private recipients: string[] = [];
  private sender?: string;
  private wire: Wire;
  private maxSize = defaultSize;

  /**
   * Connection state, can be used to store authentication data.
   */
  public state: any;

  public isAuthenticated = false;

  get remoteAddress() {
    return this.socket.remoteAddress;
  }

  constructor(private socket: Socket, private options: SMTPServerOptions) {
    super();

    if (this.options.size) {
      this.maxSize = this.options.size;
    }
    this.wire = new Wire(socket);

    // Welcome message.
    this.reply(220, this.options.hostname + ' ESMTP @typemail/smtp');

    this.wire.on('error', err => this.emit('error', err));
    this.wire.on('close', () => this.handleClose());

    this.wire.on('readable', async () => {
      try {
        const line = await this.wire.readLine();
        if (this.options.logging) {
          console.log('[SMTP IN]', line);
        }
        const command = line.split(' ', 1)[0];
        await this.handleCommand(
          command.toUpperCase(),
          line.substring(command.length + 1)
        );
      } catch {}
    });
  }

  get connected() {
    return this.wire.readable;
  }

  get secure() {
    return this.socket instanceof TLSSocket && this.socket.encrypted;
  }

  close() {
    this.wire.close();
  }

  reply(code: number, message?: string) {
    if (this.options.logging) {
      console.log('[SMTP OUT]', code, message);
    }

    try {
      if (!message) {
        this.wire.writeLine(`${code}`);
        return;
      }

      if (message.includes('\n')) {
        const lines = message.split('\n');
        for (let i = 0; i < lines.length; i++) {
          if (i === lines.length - 1) {
            this.wire.writeLine(`${code} ${lines[i]}`);
          } else {
            this.wire.writeLine(`${code}-${lines[i]}`);
          }
        }
      } else {
        this.wire.writeLine(`${code} ${message}`);
      }
    } catch {}

    try {
      // 5xx errors result in an ended connection.
      if (code >= 500) {
        this.close();
      }
    } catch {}
  }

  async challenge(
    message?: string,
    plaintextMessage = false,
    plaintextReply = false
  ): Promise<string> {
    try {
      this.reply(334, plaintextMessage ? message : base64Encode(message));
      const reply = await this.wire.readLine();
      return plaintextReply ? reply : base64Decode(reply);
    } catch {
      return '';
    }
  }

  private get authMethods() {
    if (!this.options.authMethods) {
      return [];
    }

    return this.options.authMethods;
  }

  private get extensions() {
    const extensions = ['SMTPUTF8', 'PIPELINING', '8BITMIME'];

    if (!this.secure && this.options.secureContext) {
      extensions.push('STARTTLS');
    }

    if (this.authMethods.length) {
      extensions.push('AUTH ' + this.authMethods.join(' '));
    }

    extensions.push('SIZE ' + this.maxSize);

    return extensions;
  }

  private get greeting() {
    return this.options.hostname + ', greeting accepted.';
  }

  private get extendedGreeting() {
    return this.greeting + '\n' + this.extensions.join('\n');
  }

  private handleClose() {
    this.emit('close');
  }

  private async starttls() {
    if (!this.options.secureContext || this.secure) {
      return;
    }

    this.greeted = false;

    this.socket = await upgradeSocket(this.socket, {
      secureContext: this.options.secureContext,
      rejectUnauthorized: false,
    });
    this.wire.setStream(this.socket);
  }

  private async handleAuthentication(args: string[]) {
    if (!this.authMethods.length || !this.options.authenticate) {
      return;
    }

    const method = args.shift();

    let username = '';
    let password = '';
    let identity = '';
    switch (method) {
      case 'PLAIN':
        {
          const data = (
            base64Decode(args[0]) || (await this.challenge())
          ).split('\0');
          if (data.length === 3) {
            identity = data[0];
            data.shift();
          }

          username = data[0];
          password = data[1];
        }
        break;
      case 'LOGIN':
        username = await this.challenge('Username:');
        password = await this.challenge('Password:');
        break;
    }

    this.isAuthenticated = false;
    if (username && password) {
      const result = await this.options.authenticate(this, method, {
        username,
        password,
        identity,
      });

      this.isAuthenticated = result;
    } else {
      const result = await this.options.authenticate(this, method, args);

      this.isAuthenticated = result;
    }

    if (this.isAuthenticated) {
      this.reply(...SMTPReply.AUTHENTICATION_SUCCESSFUL);
    } else {
      this.reply(...SMTPReply.BAD_USERNAME_OR_PASSWORD);
    }
  }

  private async handleCommand(command: string, argStr: string) {
    switch (command) {
      case SMTPCommand.QUIT:
        // QUIT
        this.reply(...SMTPReply.BYE);
        this.close();
        return;
      case SMTPCommand.NOOP:
        this.reply(...SMTPReply.OK);
        return;
    }

    if (!this.greeted) {
      switch (command) {
        case SMTPCommand.HELO:
          // HELO hostname
          this.reply(250, this.greeting);

          this.greeted = true;
          break;
        case SMTPCommand.EHLO:
          // EHLO hostname
          this.reply(250, this.extendedGreeting);
          this.greeted = true;
          break;
        default:
          this.reply(...SMTPReply.BAD_SEQUENCE);
      }

      return;
    }

    switch (command) {
      case SMTPCommand.HELO:
      case SMTPCommand.EHLO:
        this.reply(...SMTPReply.BAD_SEQUENCE);
        break;
      case SMTPCommand.STARTTLS:
        if (
          !this.options.secureContext ||
          this.options.secureMode !== SMTPServerSecureMode.STARTTLS
        ) {
          this.reply(...SMTPReply.NOT_IMPLEMENTED);
          break;
        }

        if (this.secure) {
          this.reply(...SMTPReply.BAD_SEQUENCE);
          break;
        }

        this.reply(...SMTPReply.TLS_GO_AHEAD);
        this.starttls();
        break;
      case SMTPCommand.MAIL:
        // MAIL FROM:<user@example.com>
        {
          const args = parseCommandArguments(argStr);
          const sender = args['FROM'];

          if (!sender) {
            this.reply(...SMTPReply.SYNTAX_ERROR_ARGUMENT);
            break;
          }

          let size = 0;
          if (args['SIZE']) {
            size = parseInt(args['SIZE']);
          }

          if (size && size > this.maxSize) {
            this.reply(...SMTPReply.MAXIMUM_SIZE_EXCEEDED);
            this.emit('rejectedMessage', sender, this.recipients);
            break;
          }

          this.sender = sender;
          this.reply(...SMTPReply.OK);
        }
        break;
      case SMTPCommand.RCPT:
        // RCPT TO:<user@example.com>
        {
          const args = parseCommandArguments(argStr);
          if (args['TO']) {
            this.recipients.push(args['TO']);
            this.reply(...SMTPReply.OK);
          } else {
            this.reply(...SMTPReply.SYNTAX_ERROR_ARGUMENT);
          }
        }

        break;
      case SMTPCommand.DATA:
        // DATA
        if (this.recipients.length > 0 && this.sender) {
          this.reply(...SMTPReply.START_MAIL_INPUT);
          let data = '';
          try {
            data = await this.wire.readUntil(
              ending + SMTPReply.SMTP_MAIL_ENDING_LINE + ending,
              { maxLength: this.maxSize }
            );
          } catch {
            this.reply(...SMTPReply.MAXIMUM_SIZE_EXCEEDED);
            return;
          }

          if (this.sender) {
            const lines = data.split(ending);

            // Undo dot stuffing.
            const message = lines
              .map(line => (line.startsWith('..') ? line.substring(1) : line))
              .join(ending);

            this.emit('message', {
              recipients: this.recipients,
              sender: this.sender,
              message,
            } as SMTPMessage);
            this.reply(...SMTPReply.OK);
          } else {
            this.reply(...SMTPReply.BAD_SEQUENCE);
          }
        } else {
          this.reply(...SMTPReply.BAD_SEQUENCE);
        }
        break;
      case SMTPCommand.AUTH:
        {
          const args = argStr.split(' ');
          if (!this.authMethods.includes(args[0])) {
            this.reply(...SMTPReply.NOT_IMPLEMENTED_ARGUMENT);
            break;
          }

          this.handleAuthentication(args);
        }
        break;
      case SMTPCommand.RSET:
        this.recipients = [];
        this.sender = undefined;
        this.reply(...SMTPReply.OK);
        break;
      default:
        this.reply(...SMTPReply.NOT_IMPLEMENTED);
    }
  }
}
