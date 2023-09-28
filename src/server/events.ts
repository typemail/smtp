import { SMTPServer } from './index.js';
import { SMTPMessage } from '../smtp/message.js';
import { SMTPServerConnection } from './connection.js';

export type SMTPServerConnectionMessageEventListener = (
  this: SMTPServerConnection,
  message: SMTPMessage
) => void;
export type SMTPServerConnectionErrorEventListener = (
  this: SMTPServerConnection,
  error: Error
) => void;
export type SMTPServerConnectionRejectedMessageEventListener = (
  this: SMTPServerConnection,
  sender: string,
  recipients: string[]
) => void;
export type SMTPServerConnectionEventListener = (
  this: SMTPServer,
  connection: SMTPServerConnection
) => void;
