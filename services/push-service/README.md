<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" /></a>
</p>

[circleci-image]: https://img.shields.io/circleci/build/github/nestjs/nest/master?token=abc123def456
[circleci-url]: https://circleci.com/gh/nestjs/nest

  <p align="center">A progressive <a href="http://nodejs.org" target="_blank">Node.js</a> framework for building efficient and scalable server-side applications.</p>
    <p align="center">
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/v/@nestjs/core.svg" alt="NPM Version" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/l/@nestjs/core.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/dm/@nestjs/common.svg" alt="NPM Downloads" /></a>
<a href="https://circleci.com/gh/nestjs/nest" target="_blank"><img src="https://img.shields.io/circleci/build/github/nestjs/nest/master" alt="CircleCI" /></a>
<a href="https://discord.gg/G7Qnnhy" target="_blank"><img src="https://img.shields.io/badge/discord-online-brightgreen.svg" alt="Discord"/></a>
<a href="https://opencollective.com/nest#backer" target="_blank"><img src="https://opencollective.com/nest/backers/badge.svg" alt="Backers on Open Collective" /></a>
<a href="https://opencollective.com/nest#sponsor" target="_blank"><img src="https://opencollective.com/nest/sponsors/badge.svg" alt="Sponsors on Open Collective" /></a>
  <a href="https://paypal.me/kamilmysliwiec" target="_blank"><img src="https://img.shields.io/badge/Donate-PayPal-ff3f59.svg" alt="Donate us"/></a>
    <a href="https://opencollective.com/nest#sponsor"  target="_blank"><img src="https://img.shields.io/badge/Support%20us-Open%20Collective-41B883.svg" alt="Support us"></a>
  <a href="https://twitter.com/nestframework" target="_blank"><img src="https://img.shields.io/twitter/follow/nestframework.svg?style=social&label=Follow" alt="Follow us on Twitter"></a>
</p>
  <!--[![Backers on Open Collective](https://opencollective.com/nest/backers/badge.svg)](https://opencollective.com/nest#backer)
  [![Sponsors on Open Collective](https://opencollective.com/nest/sponsors/badge.svg)](https://opencollective.com/nest#sponsor)-->

## Description

Push notification service that consumes messages from RabbitMQ and sends Web Push notifications to users' browsers/devices.

> **⚠️ Testing Status**: This service has been implemented but **has not been fully tested** in a production environment. We welcome contributions, testing, and feedback from the community. See the [Testing Push Notifications](#testing-push-notifications) section below for testing instructions.

## Environment Variables

The push-service requires the following environment variables:

### Required Variables

```bash
# VAPID Keys (Required for Web Push)
# Generate these using: npx web-push generate-vapid-keys
VAPID_PUBLIC_KEY=your_public_key_here
VAPID_PRIVATE_KEY=your_private_key_here
VAPID_SUBJECT=mailto:your-email@example.com  # Optional, defaults to mailto:notifications@example.com

# RabbitMQ Configuration
RABBITMQ_URL=amqp://localhost:5672
PUSH_QUEUE=push.queue  # Optional, defaults to 'push.queue'
```

### Generating VAPID Keys

VAPID (Voluntary Application Server Identification) keys are required for Web Push notifications. They identify your application to push services.

**Quick Setup:**

```bash
# Install web-push globally (if not already installed)
npm install -g web-push

# Generate VAPID keys
npx web-push generate-vapid-keys
```

This will output something like:

```
=======================================

Public Key:
BEl62iUYgUivxIkv69yViEuiBIa40HIgHjBwvYVWQjK...
Private Key:
...
=======================================
```

**Add to your `.env` file:**

```bash
VAPID_PUBLIC_KEY=BEl62iUYgUivxIkv69yViEuiBIa40HIgHjBwvYVWQjK...
VAPID_PRIVATE_KEY=...
VAPID_SUBJECT=mailto:your-email@example.com
```

**Important Notes:**

- Keep your `VAPID_PRIVATE_KEY` secret - never commit it to version control
- The `VAPID_SUBJECT` should be a `mailto:` URL or a regular URL
- Use the same VAPID keys for your entire application (don't generate new ones for each environment unless needed)
- The public key will be shared with browsers when users subscribe to push notifications

## How It Works

1. **Consumes from RabbitMQ**: Listens to the `push.queue` for notification messages
2. **Validates Subscription**: Checks that the user has a valid push subscription
3. **Sends Push**: Uses the `web-push` library to send notifications via Web Push protocol
4. **Acknowledges**: Sends ACK/NACK back to RabbitMQ based on success/failure

## Message Format

The service expects messages in this format (from orchestrator):

```typescript
{
  notificationId: string;
  userId: string;
  event: string;
  channel: 'PUSH';
  recipient: {
    pushToken: {
      endpoint: string;
      keys: {
        auth: string;
        p256dh: string;
      };
    };
  };
  content: {
    title?: string;
    body: string;
  };
  metadata: {
    correlationId: string;
    language: string;
    templateId: string;
  };
}
```

## Testing Push Notifications

### Prerequisites

1. ✅ **VAPID keys configured** (see above)
2. ✅ **Push-service running** on port `3004` (or configured port)
3. ✅ **RabbitMQ running** and accessible
4. ✅ **User-service running** with API to save push subscriptions
5. ✅ **Orchestrator running** to send notifications
6. ✅ **HTTPS or localhost** - Browsers require HTTPS for push notifications (except localhost)

### Step 1: Create a Simple HTML Test Page

Create a file `test-push.html` in your project root:

```html
<!DOCTYPE html>
<html>
  <head>
    <title>Push Notification Test</title>
  </head>
  <body>
    <h1>Push Notification Test</h1>
    <button id="subscribe">Subscribe to Push</button>
    <button id="send-test">Send Test Notification</button>
    <div id="status"></div>

    <script>
      const VAPID_PUBLIC_KEY = 'YOUR_VAPID_PUBLIC_KEY_HERE'; // Replace with your actual public key
      const USER_SERVICE_URL = 'http://localhost:3000'; // Adjust if needed
      const ORCHESTRATOR_URL = 'http://localhost:3002'; // Adjust if needed
      const USER_ID = 'your-user-id'; // Replace with actual user ID
      const AUTH_TOKEN = 'your-jwt-token'; // Replace with actual JWT token

      let subscription = null;

      // Convert VAPID key from base64 URL-safe to Uint8Array
      function urlBase64ToUint8Array(base64String) {
        const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
        const base64 = (base64String + padding)
          .replace(/\-/g, '+')
          .replace(/_/g, '/');
        const rawData = window.atob(base64);
        const outputArray = new Uint8Array(rawData.length);
        for (let i = 0; i < rawData.length; ++i) {
          outputArray[i] = rawData.charCodeAt(i);
        }
        return outputArray;
      }

      // Subscribe to push notifications
      document
        .getElementById('subscribe')
        .addEventListener('click', async () => {
          try {
            const registration =
              await navigator.serviceWorker.register('/sw.js');
            subscription = await registration.pushManager.subscribe({
              userVisibleOnly: true,
              applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
            });

            // Save subscription to user-service
            const response = await fetch(
              `${USER_SERVICE_URL}/user/push-token/${USER_ID}`,
              {
                method: 'PUT',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${AUTH_TOKEN}`,
                },
                body: JSON.stringify({
                  pushToken: subscription.toJSON(),
                }),
              },
            );

            if (response.ok) {
              document.getElementById('status').textContent =
                '✅ Subscribed successfully!';
              console.log('Subscription:', subscription.toJSON());
            } else {
              throw new Error('Failed to save subscription');
            }
          } catch (error) {
            document.getElementById('status').textContent =
              `❌ Error: ${error.message}`;
            console.error('Subscription error:', error);
          }
        });

      // Send test notification via orchestrator
      document
        .getElementById('send-test')
        .addEventListener('click', async () => {
          try {
            const response = await fetch(`${ORCHESTRATOR_URL}/notifications`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${AUTH_TOKEN}`,
              },
              body: JSON.stringify({
                event: 'WELCOME_MESSAGE',
                data: {
                  firstName: 'Test User',
                },
                channels: ['PUSH'],
                language: 'en',
              }),
            });

            const result = await response.json();
            if (response.ok) {
              document.getElementById('status').textContent =
                '✅ Test notification sent! Check your browser notifications.';
            } else {
              document.getElementById('status').textContent =
                `❌ Error: ${result.message || 'Failed to send'}`;
            }
          } catch (error) {
            document.getElementById('status').textContent =
              `❌ Error: ${error.message}`;
            console.error('Send error:', error);
          }
        });

      // Listen for push notifications
      navigator.serviceWorker.addEventListener('message', (event) => {
        console.log('Push notification received:', event.data);
        document.getElementById('status').textContent =
          `📬 Notification: ${JSON.stringify(event.data)}`;
      });
    </script>
  </body>
</html>
```

### Step 2: Create a Service Worker

Create `sw.js` in your project root (or public directory):

```javascript
// Service Worker for Push Notifications
self.addEventListener('push', (event) => {
  let data = {};

  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data = { body: event.data.text() };
    }
  }

  const options = {
    body: data.body || 'You have a new notification',
    title: data.title || 'Notification',
    icon: '/icon.png', // Optional: add an icon
    badge: '/badge.png', // Optional: add a badge
    data: data.data || {},
    requireInteraction: false,
    actions: [], // Optional: add action buttons
  };

  event.waitUntil(self.registration.showNotification(options.title, options));
});

// Handle notification clicks
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  // You can open a URL or focus a window
  event.waitUntil(
    clients.openWindow('/'), // Replace with your app URL
  );
});
```

### Step 3: Serve the Test Page

You need to serve the HTML file over HTTPS (or localhost). Options:

**Option A: Using a simple HTTP server (localhost only):**

```bash
# Install http-server globally
npm install -g http-server

# Serve from project root
http-server -p 8080
```

**Option B: Using Python:**

```bash
# Python 3
python3 -m http.server 8080

# Python 2
python -m SimpleHTTPServer 8080
```

**Option C: Using Node.js Express (for HTTPS):**
Create a simple Express server if you need HTTPS for production testing.

### Step 4: Test the Flow

1. **Open the test page** in your browser: `http://localhost:8080/test-push.html`
2. **Click "Subscribe to Push"** - This will:
   - Register a service worker
   - Subscribe to push notifications
   - Save the subscription to your user-service
3. **Check the browser console** - You should see the subscription object
4. **Click "Send Test Notification"** - This will:
   - Send a notification request to the orchestrator
   - The orchestrator queues it to RabbitMQ
   - The push-service consumes it and sends the push
   - You should see a browser notification!

### Step 5: Verify in Logs

Check the push-service logs for:

```
✅ VAPID keys configured successfully
Listening for push jobs on push.queue
Push sent for notification <id> to <endpoint>
```

### Alternative: Test via API Directly

If you already have a push subscription saved, you can test directly:

```bash
# Send a push notification via orchestrator
curl -X POST http://localhost:3002/notifications \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "event": "WELCOME_MESSAGE",
    "data": {
      "firstName": "John"
    },
    "channels": ["PUSH"],
    "language": "en"
  }'
```

### Troubleshooting

**"Service Worker registration failed"**

- Make sure you're using HTTPS or localhost
- Check that `sw.js` is accessible at the root

**"Push subscription failed"**

- Verify VAPID_PUBLIC_KEY matches what you generated
- Check browser console for specific errors

**"No notification received"**

- Check push-service logs for errors
- Verify RabbitMQ is running and messages are being consumed
- Check that the user has `push_opt_in: true` in preferences
- Verify the push subscription is saved correctly in user-service

**"Invalid subscription"**

- Make sure the subscription format matches `WebPushSubscription` interface
- Check that `endpoint`, `keys.auth`, and `keys.p256dh` are all present

## Project setup

```bash
$ npm install
```

## Compile and run the project

```bash
# development
$ npm run start

# watch mode
$ npm run start:dev

# production mode
$ npm run start:prod
```

## Run tests

```bash
# unit tests
$ npm run test

# e2e tests
$ npm run test:e2e

# test coverage
$ npm run test:cov
```

## Deployment

When you're ready to deploy your NestJS application to production, there are some key steps you can take to ensure it runs as efficiently as possible. Check out the [deployment documentation](https://docs.nestjs.com/deployment) for more information.

If you are looking for a cloud-based platform to deploy your NestJS application, check out [Mau](https://mau.nestjs.com), our official platform for deploying NestJS applications on AWS. Mau makes deployment straightforward and fast, requiring just a few simple steps:

```bash
$ npm install -g @nestjs/mau
$ mau deploy
```

With Mau, you can deploy your application in just a few clicks, allowing you to focus on building features rather than managing infrastructure.

## Resources

Check out a few resources that may come in handy when working with NestJS:

- Visit the [NestJS Documentation](https://docs.nestjs.com) to learn more about the framework.
- For questions and support, please visit our [Discord channel](https://discord.gg/G7Qnnhy).
- To dive deeper and get more hands-on experience, check out our official video [courses](https://courses.nestjs.com/).
- Deploy your application to AWS with the help of [NestJS Mau](https://mau.nestjs.com) in just a few clicks.
- Visualize your application graph and interact with the NestJS application in real-time using [NestJS Devtools](https://devtools.nestjs.com).
- Need help with your project (part-time to full-time)? Check out our official [enterprise support](https://enterprise.nestjs.com).
- To stay in the loop and get updates, follow us on [X](https://x.com/nestframework) and [LinkedIn](https://linkedin.com/company/nestjs).
- Looking for a job, or have a job to offer? Check out our official [Jobs board](https://jobs.nestjs.com).

## Support

Nest is an MIT-licensed open source project. It can grow thanks to the sponsors and support by the amazing backers. If you'd like to join them, please [read more here](https://docs.nestjs.com/support).

## Stay in touch

- Author - [Kamil Myśliwiec](https://twitter.com/kammysliwiec)
- Website - [https://nestjs.com](https://nestjs.com/)
- Twitter - [@nestframework](https://twitter.com/nestframework)

## License

Nest is [MIT licensed](https://github.com/nestjs/nest/blob/master/LICENSE).
