import { SecureContext } from 'tls';

import { SMTPServerConnection } from './connection.js';

export enum SMTPServerSecureMode {
  NONE,
  TLS,
  STARTTLS,
}

export interface SMTPServerOptions {
  hostname?: string;
  size?: number;
  secureMode?: SMTPServerSecureMode;
  secureContext?: SecureContext;
  authMethods?: string[];
  authenticate?: (
    connection: SMTPServerConnection,
    method?: string,
    payload?:
      | { username: string; password: string; identity?: string }
      | string[]
  ) => boolean | Promise<boolean>;
}
