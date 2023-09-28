import { EventEmitter } from 'stream';

import { SMTPServerConnection } from '../../src/server/connection.js';

class Socket extends EventEmitter {
  writeCallbacks: Record<string, () => void> = {};
  destroyCallbacks: (() => void)[] = [];
  readable = true;

  setEncoding() {
    //
  }

  read() {
    return undefined;
  }

  write(data: string) {
    if (this.writeCallbacks[data]) {
      this.writeCallbacks[data]();
      delete this.writeCallbacks[data];
    }
  }

  waitForWrite(data: string): Promise<void> {
    return new Promise(resolve => {
      this.writeCallbacks[data] = resolve;
    });
  }

  waitForDestroy(): Promise<void> {
    return new Promise(resolve => {
      this.destroyCallbacks.push(resolve);
    });
  }

  command(data: string) {
    this.emit('data', Buffer.from(data + '\r\n'));
  }

  destroy() {
    this.readable = false;
    this.destroyCallbacks.forEach(fn => fn());
    this.destroyCallbacks = [];
  }
}

describe('connection', () => {
  it('welcomes clients', async () => {
    const socket = new Socket();
    const write = vi.spyOn(socket, 'write');
    new SMTPServerConnection(socket as any, {
      hostname: 'localhost',
      size: 100000,
    });

    const expected = '220 localhost ESMTP @typemail/smtp\r\n';
    expect(write).toHaveBeenCalledWith(expected);
  });

  it('connection is dropped on error', async () => {
    const socket = new Socket();
    const destroy = vi.spyOn(socket, 'destroy');
    const connection = new SMTPServerConnection(socket as any, {
      hostname: 'localhost',
      size: 100000,
    });

    socket.command('FROM');

    await socket.waitForDestroy();
    expect(destroy).toHaveBeenCalled();
    expect(connection.open).toEqual(false);
  });

  it('handles command: HELO', async () => {
    const socket = new Socket();
    const write = vi.spyOn(socket, 'write');
    new SMTPServerConnection(socket as any, {
      hostname: 'localhost',
      size: 100000,
    });

    socket.command('HELO');

    const expected = '250 localhost, greeting accepted.\r\n';
    await socket.waitForWrite(expected);
    expect(write).toHaveBeenCalledWith(expected);
  });

  it('handles command: EHLO', async () => {
    const socket = new Socket();
    const write = vi.spyOn(socket, 'write');
    new SMTPServerConnection(socket as any, {
      hostname: 'localhost',
      size: 100000,
    });

    socket.command('EHLO');

    const expected = '250-localhost, greeting accepted.\r\n';
    await socket.waitForWrite(expected);
    expect(write).toHaveBeenCalledWith(expected);
  });

  it('handles command: QUIT', async () => {
    const socket = new Socket();
    const write = vi.spyOn(socket, 'write');
    const destroy = vi.spyOn(socket, 'destroy');
    new SMTPServerConnection(socket as any, {
      hostname: 'localhost',
      size: 100000,
    });

    socket.command('QUIT');

    const expected = '221 Bye\r\n';
    await socket.waitForWrite(expected);
    expect(write).toHaveBeenCalledWith(expected);
    expect(destroy).toHaveBeenCalledWith();
  });

  it('handles command: NOOP', async () => {
    const socket = new Socket();
    const write = vi.spyOn(socket, 'write');
    new SMTPServerConnection(socket as any, {
      hostname: 'localhost',
      size: 100000,
    });

    socket.command('NOOP');

    const expected = '250 Ok\r\n';
    await socket.waitForWrite(expected);
    expect(write).toHaveBeenCalledWith(expected);
  });
});
