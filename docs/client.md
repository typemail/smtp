# SMTP Client

## Usage

### SMTPClient

**Events:**

```js
import { SMTPClient } from '@typemail/smtp/client';

const message = {
  sender: 'a@example.com',
  recipients: ['b@example.com'],
  message: 'MESSAGE',
};

const client = new SMTPClient({ hostname: HOST, port: PORT });
client.on('ready', () => {
  client.mail(message);
  client.close();
});
```

**Async/await:**

```js
import { SMTPClient } from '@typemail/smtp/client';

const message = {
  sender: 'a@example.com',
  recipients: ['b@example.com'],
  message: 'MESSAGE',
};

const client = new SMTPClient({ hostname: HOST, port: PORT });
await client.connect();
await client.mail(message);
client.close();
```

### sendmail

```js
import { sendmail } from '@typemail/smtp/client';

const message = {
  sender: 'a@example.com',
  recipients: ['b@example.com'],
  message: 'MESSAGE',
};

sendmail(message, { smtp: { hostname: HOST, port: PORT } });
```
