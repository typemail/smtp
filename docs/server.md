# SMTP Server

## Usage

```js
import { SMTPServer } from '@typemail/smtp/server';

const server = new SMTPServer();

server.on('connection', conn => {
  conn.on('message', message => console.log(message));
});
```

`message` will be of the type _SMTPMessage_:

```ts
export interface SMTPMessage {
  recipients: string[];
  sender: string;
  message: string;
}
```

The `message` is a raw message that needs to be parsed. [letterparser](https://github.com/mat-sz/letterparser) can be used to parse and extract data from the raw messages.

### Options

The constructor for `SMTPServer` accepts an options object.

| Property       | Default value | Description                                                                                                              |
| -------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `ip`           | `0.0.0.0`     | IP address to bind to.                                                                                                   |
| `port`         | `25`          | Port to bind to. (Ports under 1024 usually require superuser privileges.)                                                |
| `hostname`     | `localhost`   | Hostname advertised by the SMTP server.                                                                                  |
| `size`         | `1000000`     | Maximum message size (in bytes).                                                                                         |
| `tls`          | `undefined`   | [createSecureContext options](https://nodejs.org/api/tls.html#tls_tls_createsecurecontext_options) for STARTTLS support. |
| `tlsPort`      | `465`         | Port for secure only communication, only enabled if `tls` is configured properly.                                        |
| `authenticate` | `undefined`   | Authentication function. See [Authentication](#Authentication) for more details.                                         |
| `authMethods`  | `undefined`   | Array of authentication method strings. See [Authentication](#Authentication) for more details.                          |

### Events

#### `listening`

Emitted when all configured servers are listening.

#### `message`

Emitted when a message is succesfully received.

#### `error`

Emitted when an error occurs.

#### `rejected`

Emitted when a message is rejected. For now, this only happens when the message exceeds the maximum size.

### Authentication

To enable authentication, a function of following type must be passed with the options object:

```ts
  authenticate?: (
    connection: SMTPServerConnection,
    method: string,
    payload?: { username: string; password: string; identity?: string; } | string[]
  ) => boolean | Promise<boolean>;
```

Custom methods can be supported in the following way:

```js
import { SMTPServer } from '@typemail/smtp/server';

const server = new SMTPServer({
  supportedAuthenticationMethods: ['XOAUTH2', 'NTLM'],
  authenticate: async (connection, method, payload) => {
    switch (method) {
      case 'XOAUTH2':
        if (Array.isArray(payload) && typeof payload[0] === 'string') {
          // Validate payload and return the result.
          return true;
        }
        break;
      case 'NTLM':
        const negotiateResponse = await connection.challenge(
          'ntlm supported',
          true
        );
        // Test response.
        const authenticateResponse = await connection.challenge('anything');
        // Test response.
        return true;
        break;
    }

    return false;
  },
});

server.on('connection', conn => {
  conn.on('message', message => console.log(message));
});
```
