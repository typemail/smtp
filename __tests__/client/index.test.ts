import { sendmail, SMTPServer, SMTPClient } from '../../src/index.js';

const HOST = '127.0.0.1';
const PORT = 5525;
let server: SMTPServer;

describe('client', () => {
  // TODO: TLS tests
  // TODO: Error handling tests
  // TODO: Auth tests
  // TODO: Capability tests
  // TODO: Greeting tests

  beforeAll(() => {
    server = new SMTPServer({
      hostname: 'localhost',
    });
    server.listen(PORT, HOST);
  });

  describe('SMTPClient', () => {
    it('should send a message: events', () => {
      const message = {
        sender: 'a@localhost',
        recipients: ['b@localhost'],
        message: 'Test',
      };

      return new Promise(resolve => {
        server.once('connection', connection => {
          connection.on('message', msg => {
            expect(msg).toMatchObject(message);
            resolve(true);
          });
        });

        const client = new SMTPClient({ hostname: HOST, port: PORT });
        client.on('ready', () => {
          client.mail(message);
        });
      });
    });

    it('should send a message: async/await', () => {
      const message = {
        sender: 'a@localhost',
        recipients: ['b@localhost'],
        message: 'Test',
      };

      return new Promise(resolve => {
        server.once('connection', connection => {
          connection.on('message', msg => {
            expect(msg).toMatchObject(message);
            resolve(true);
          });
        });

        const fn = async () => {
          const client = new SMTPClient({ hostname: HOST, port: PORT });
          await client.connect();
          client.mail(message);
        };
        fn();
      });
    });
  });

  describe('sendmail', () => {
    it('should send a message', () => {
      const message = {
        sender: 'a@localhost',
        recipients: ['b@localhost'],
        message: 'Test',
      };

      return new Promise(resolve => {
        server.once('connection', connection => {
          connection.on('message', msg => {
            expect(msg).toMatchObject(message);
            resolve(true);
          });
        });

        sendmail(message, { smtp: { hostname: HOST, port: PORT } });
      });
    });
  });

  afterAll(() => {
    server.close();
  });
});
