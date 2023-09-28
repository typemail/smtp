import { Socket } from 'net';
import { createSecureContext, SecureContextOptions } from 'tls';
import { readFileSync } from 'fs';
import { upgradeSocket } from '@typemail/starttls';

import { SMTPServer } from '../../src/index.js';
import { SMTPServerSecureMode } from '../../src/server/options.js';
import { SMTPServerConnection } from '../../src/server/connection.js';

const options: SecureContextOptions = {
  key: readFileSync('./__tests__/cert/server.key'),
  cert: readFileSync('./__tests__/cert/server.cert'),
};

const HOST = '127.0.0.1';
let currentPort = 2525;
const nextPort = () => currentPort++;

describe('server', () => {
  it('starts listening without exceptions', () => {
    const port = nextPort();
    const server = new SMTPServer({
      hostname: 'localhost',
    });

    return new Promise(resolve => {
      server.on('listening', () => {
        server.close();
        resolve(true);
      });
      server.listen(port, HOST);
    });
  });

  it('closes client socket on .close', () => {
    const port = nextPort();
    const server = new SMTPServer({
      hostname: 'localhost',
    });
    server.listen(port, HOST);

    const socket = new Socket();
    const onData = vi.fn();
    socket.on('connect', () => {
      socket.write('EHLO\r\n');
    });
    socket.on('data', data => {
      onData(data.toString());
      server.close();
    });

    return new Promise(resolve => {
      socket.on('close', () => {
        expect(onData).toHaveBeenCalledWith(
          '421 The server is shutting down\r\n'
        );
        resolve(true);
      });
      socket.connect({ host: '127.0.0.1', port });
    });
  });

  it('handles incoming mail', () => {
    const port = nextPort();
    const server = new SMTPServer({
      hostname: 'localhost',
    });
    server.listen(port, HOST);

    const onMessage = vi.fn();
    server.on('connection', connection => {
      connection.on('message', onMessage);
    });

    const socket = new Socket();
    socket.on('connect', () => {
      socket.write(
        'EHLO\r\nMAIL FROM:<a@localhost>\r\nRCPT TO:<b@localhost>\r\nDATA\r\n'
      );
    });

    let messageSent = false;
    socket.on('data', buffer => {
      const string = buffer.toString();
      if (string.includes('354')) {
        socket.write('Test\r\n.\r\n');
        messageSent = true;
      } else if (messageSent && string.includes('250')) {
        socket.write('QUIT\r\n');
      }
    });

    return new Promise(resolve => {
      socket.on('close', () => {
        server.close();
        expect(onMessage).toHaveBeenCalledWith(
          expect.objectContaining({
            recipients: ['b@localhost'],
            sender: 'a@localhost',
            message: 'Test',
          })
        );
        resolve(true);
      });
      socket.connect({ host: '127.0.0.1', port });
    });
  });

  it('handles incoming mail (case insensitive)', () => {
    const port = nextPort();
    const server = new SMTPServer({
      hostname: 'localhost',
    });
    server.listen(port, HOST);

    const onMessage = vi.fn();
    server.on('connection', connection => {
      connection.on('message', onMessage);
    });

    const socket = new Socket();
    socket.on('connect', () => {
      socket.write(
        'EHLO\r\nMAIL From:<a@localhost>\r\nRCPT tO:<b@localhost>\r\nDATA\r\n'
      );
    });

    let messageSent = false;
    socket.on('data', buffer => {
      const string = buffer.toString();
      if (string.includes('354')) {
        socket.write('Test\r\n.\r\n');
        messageSent = true;
      } else if (messageSent && string.includes('250')) {
        socket.write('QUIT\r\n');
      }
    });

    return new Promise(resolve => {
      socket.on('close', () => {
        server.close();
        expect(onMessage).toHaveBeenCalledWith(
          expect.objectContaining({
            recipients: ['b@localhost'],
            sender: 'a@localhost',
            message: 'Test',
          })
        );
        resolve(true);
      });
      socket.connect({ host: '127.0.0.1', port });
    });
  });

  it('supports STARTTLS', () => {
    const port = nextPort();
    const server = new SMTPServer({
      hostname: 'localhost',
      secureContext: createSecureContext(options),
      secureMode: SMTPServerSecureMode.STARTTLS,
    });
    server.listen(port, HOST);

    let connection: SMTPServerConnection;
    server.on('connection', conn => {
      connection = conn;
    });

    let socket = new Socket();
    socket.on('connect', () => {
      socket.write('EHLO\r\n');
    });

    return new Promise(resolve => {
      socket.on('data', async data => {
        const str = data.toString('utf-8');
        if (str.startsWith('250-SMTPUTF8')) {
          socket.write('STARTTLS\r\n');
        }

        if (str.startsWith('220 TLS go ahead')) {
          socket = await upgradeSocket(socket, {
            rejectUnauthorized: false,
          });
          socket.write('QUIT\r\n');
        }

        if (str.startsWith('221 Bye')) {
          expect(connection.secure).toBe(true);
          server.close();
          resolve(true);
        }
      });
      socket.connect({ host: '127.0.0.1', port });
    });
  });
});
