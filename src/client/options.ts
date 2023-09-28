export enum SMTPClientSecure {
  NOT_SECURE,
  STARTTLS_AUTO,
  STARTTLS_REQUIRED,
  TLS,
}

export interface SMTPClientOptions {
  hostname: string;
  port: number;
  secure?: SMTPClientSecure;
  rejectUnauthorized?: boolean;

  // TODO: Authentication
}
