# 🏗️ Notification Microservices Architecture - Complete Flow Explanation

## 📋 Overview

This document explains how the notification system works, step by step, with code examples and explanations.

## 🎯 The Big Picture

```
Admin User (Postman/API Client)
    ↓
    POST /notifications (with JWT token)
    ↓
API Gateway (Port 3000)
    ├─ Validates JWT token
    └─ Proxies to Orchestrator
    ↓
Orchestrator Service (Port 3002)
    ├─ Checks admin role (JWT is ONLY for authorization)
    ├─ Fetches ALL users from User-Service
    ├─ For each user:
    │   ├─ Checks preferences (email_opt_in, push_opt_in)
    │   ├─ Fetches templates from Template-Service
    │   ├─ Renders templates with data
    │   └─ Publishes to RabbitMQ queues
    └─ Returns success response
    ↓
RabbitMQ Message Queues
    ├─ email.queue
    └─ push.queue
    ↓
Email Service (Port 3004) & Push Service (Port 3005)
    ├─ Consume messages from queues
    ├─ Send actual emails/push notifications
    └─ Log results
```

## 🔑 Key Concepts

### 1. **JWT Token Purpose**

- **ONLY for Authentication/Authorization**: Verifies the user is logged in and has `admin` role
- **NOT for Recipient Selection**: The JWT token does NOT determine who receives notifications
- **Admin Check**: Only users with `role: "admin"` can send notifications

### 2. **Recipient Selection**

- **If `userId` is provided**: Send to that ONE specific user
- **If `userId` is NOT provided**: Broadcast to ALL users in the database
- **Email in `data` field**: This is just template data (like `{{firstName}}`), NOT a recipient selector

### 3. **Message Queue Pattern**

- **Decoupling**: Services don't call each other directly
- **Reliability**: Messages persist even if services are down
- **Scalability**: Can add more workers to process faster

## 📝 Step-by-Step Flow

### Step 1: Admin Makes Request

**Request:**

```http
POST http://localhost:3000/notifications
Authorization: Bearer <JWT_TOKEN>
Content-Type: application/json

{
  "event": "WELCOME_MESSAGE",
  "data": {
    "firstName": "John Doe",
    "email": "teajhaney@gmail.com"
  },
  "channels": ["EMAIL", "PUSH"],
  "language": "en"
}
```

**What happens:**

- API Gateway receives request
- Validates JWT token
- Proxies to Orchestrator service

### Step 2: Orchestrator Controller (`notification.controller.ts`)

```typescript
@Post()
@UseGuards(JwtAuthGuard)  // Validates JWT token
async createNotification(...) {
  // STEP 1: Check if user is admin
  if (req.user?.role !== 'admin') {
    throw new ForbiddenException('Only administrators can send notifications');
  }

  // STEP 2: Extract admin ID (for logging only, NOT for recipients)
  const adminId = req.user?.user_id;

  // STEP 3: Call service to process notification
  return await this.notificationService.createNotification(...);
}
```

**Key Points:**

- JWT token is validated by `JwtAuthGuard`
- Admin role is checked
- Admin ID is extracted for logging/auditing purposes only
- The service handles recipient selection

### Step 3: Notification Service (`notification.service.ts`)

#### 3.1 Resolve Target Users

```typescript
private async resolveTargetUsers(
  requestedUserId: string | undefined,
  authToken?: string,
): Promise<User[]> {
  // CASE 1: Specific user targeted
  if (requestedUserId) {
    // Fetch that ONE user
    return [await this.userServiceClient.getUserWithPreferences(requestedUserId)];
  }

  // CASE 2: Broadcast to ALL users (default behavior)
  // This is what happens when userId is NOT provided
  return await this.userServiceClient.getAllUsersWithPreferences(authToken);
}
```

**What happens:**

- If `userId` is in request → fetch that user
- If `userId` is NOT in request → fetch ALL users from user-service
- Returns array of users to notify

#### 3.2 Process Each User

```typescript
for (const user of targetUsers) {
  // Check if user has preferences
  if (!user.preferences) {
    continue; // Skip users without preferences
  }

  // Determine which channels user is opted into
  const channels = this.determineChannels(
    createDto.channels,  // Requested channels: ["EMAIL", "PUSH"]
    user.preferences     // User's opt-ins: { email_opt_in: true, push_opt_in: true }
  );

  // Process each channel
  for (const channel of channels) {
    await this.processChannel(...);
  }
}
```

**Channel Selection Logic:**

- If channels specified in request → use those BUT respect user opt-ins
- If channels NOT specified → use user preferences
- If user has `email_opt_in: false` → don't send email even if requested
- If user has `push_opt_in: false` → don't send push even if requested

#### 3.3 Process Channel (Fetch Template, Render, Queue)

```typescript
private async processChannel(...) {
  // STEP 1: Fetch template from template-service
  const template = await this.templateServiceClient.getTemplateByEvent(
    event,      // "WELCOME_MESSAGE"
    channel,    // "EMAIL" or "PUSH"
    language    // "en"
  );

  // STEP 2: Render template with data
  const rendered = await this.templateServiceClient.renderTemplate(
    template.id,
    data,  // { firstName: "John Doe", email: "teajhaney@gmail.com" }
    {
      id: userId,
      name: user.name,
      email: user.email,  // User's actual email from database
      push_token: user.push_token
    }
  );

  // STEP 3: Build RabbitMQ message
  const message: NotificationMessage = {
    notificationId: uuidv4(),
    userId: user.id,
    event: "WELCOME_MESSAGE",
    channel: "EMAIL",
    recipient: {
      email: user.email  // User's actual email
    },
    content: {
      subject: rendered.subject,  // "Welcome John!"
      body: rendered.body         // "Hello John Doe, welcome to..."
    },
    metadata: {
      language: "en",
      templateId: template.id,
      correlationId: notificationId
    }
  };

  // STEP 4: Publish to RabbitMQ queue
  if (channel === NotificationChannel.EMAIL) {
    await this.rabbitMQService.publishEmailNotification(message);
  } else if (channel === NotificationChannel.PUSH) {
    await this.rabbitMQService.publishPushNotification(message);
  }
}
```

**Key Points:**

- Template is fetched from template-service
- Template is rendered with user's actual data (from database)
- Message is published to RabbitMQ queue
- Orchestrator doesn't send emails/push directly - it just queues messages

### Step 4: RabbitMQ Queues

**Queues:**

- `email.queue` - Contains email notification messages
- `push.queue` - Contains push notification messages

**Message Format:**

```json
{
  "notificationId": "uuid-123",
  "userId": "user-456",
  "event": "WELCOME_MESSAGE",
  "channel": "EMAIL",
  "recipient": {
    "email": "user@example.com"
  },
  "content": {
    "subject": "Welcome!",
    "body": "Hello John, welcome to our platform!"
  },
  "metadata": {
    "language": "en",
    "templateId": "template-789",
    "correlationId": "uuid-123"
  }
}
```

### Step 5: Email Service Consumes from Queue

**Email Consumer (`email.consumer.ts`):**

```typescript
@Injectable()
export class EmailConsumer implements OnModuleInit {
  async onModuleInit() {
    // Connect to RabbitMQ
    await this.connect();

    // Start consuming from email.queue
    await this.startConsuming();
  }

  private async startConsuming() {
    const queue = 'email.queue';

    // Listen for messages
    await channel.consume(queue, async msg => {
      // Parse message
      const payload = JSON.parse(msg.content.toString()) as NotificationMessage;

      // Send email
      await this.emailService.sendEmail(payload);

      // Acknowledge message (remove from queue)
      channel.ack(msg);
    });
  }
}
```

**Email Service (`email.service.ts`):**

```typescript
async sendEmail(message: NotificationMessage): Promise<void> {
  // Use nodemailer to send actual email
  await this.transporter.sendMail({
    from: this.fromAddress,
    to: message.recipient.email,
    subject: message.content.subject,
    text: message.content.body
  });

  this.logger.log(`Email sent to ${message.recipient.email}`);
}
```

### Step 6: Push Service Consumes from Queue

**Push Consumer (`push.consumer.ts`):**

```typescript
@Injectable()
export class PushConsumer implements OnModuleInit {
  async onModuleInit() {
    // Connect to RabbitMQ
    await this.connect();

    // Start consuming from push.queue
    await this.startConsuming();
  }

  private async startConsuming() {
    const queue = 'push.queue';

    // Listen for messages
    await channel.consume(queue, async msg => {
      // Parse message
      const payload = JSON.parse(msg.content.toString()) as NotificationMessage;

      // Send push notification
      await this.pushService.sendPush(payload);

      // Acknowledge message
      channel.ack(msg);
    });
  }
}
```

**Push Service (`push.service.ts`):**

```typescript
async sendPush(message: NotificationMessage): Promise<void> {
  // Use web-push library to send push notification
  await webpush.sendNotification(
    message.recipient.pushToken,  // User's push subscription
    JSON.stringify({
      title: message.content.title,
      body: message.content.body,
      data: {
        notificationId: message.notificationId,
        event: message.event
      }
    })
  );

  this.logger.log(`Push sent to ${message.recipient.pushToken.endpoint}`);
}
```

## 🔄 Complete Example Flow

### Scenario: Admin sends welcome message to ALL users

1. **Admin Request:**

   ```json
   POST /notifications
   {
     "event": "WELCOME_MESSAGE",
     "data": { "firstName": "John" },
     "channels": ["EMAIL", "PUSH"]
   }
   ```

2. **Orchestrator:**

   - Validates admin role ✅
   - Fetches ALL users (e.g., 150 users)
   - For each user:
     - Checks preferences
     - Fetches template
     - Renders template
     - Publishes to `email.queue` (if email_opt_in: true)
     - Publishes to `push.queue` (if push_opt_in: true)
   - Returns: `"Notification queued for 150 recipient(s)"`

3. **RabbitMQ:**

   - `email.queue` now has ~150 messages (one per user)
   - `push.queue` now has ~150 messages (one per user)

4. **Email Service:**

   - Consumes messages from `email.queue`
   - Sends actual emails via SMTP
   - Processes ~10 messages at a time (prefetch: 10)

5. **Push Service:**
   - Consumes messages from `push.queue`
   - Sends push notifications via Web Push API
   - Processes ~10 messages at a time (prefetch: 10)

## 🎓 Key Learning Points

### 1. **Separation of Concerns**

- **Orchestrator**: Coordinates, doesn't send
- **Email Service**: Only sends emails
- **Push Service**: Only sends push notifications
- **User Service**: Manages users and preferences
- **Template Service**: Manages templates

### 2. **Message Queue Benefits**

- **Decoupling**: Services don't know about each other
- **Reliability**: Messages persist if service is down
- **Scalability**: Add more workers to process faster
- **Asynchronous**: Orchestrator returns immediately, services process in background

### 3. **User Preferences**

- Users can opt-out of channels
- System respects opt-outs even if admin requests that channel
- Each user gets personalized content based on their data

### 4. **Template Rendering**

- Templates are stored in template-service
- Templates have variables like `{{firstName}}`
- Rendering replaces variables with actual user data
- Each user gets personalized message

## 🐛 Common Questions

### Q: Why does orchestrator fetch ALL users?

**A:** Because when `userId` is not provided, we want to broadcast to everyone. The orchestrator is the coordinator - it needs to know who to notify.

### Q: Why not let email/push services fetch users?

**A:** That would couple them to user-service. With message queues, they're decoupled - they just process messages, they don't need to know about users.

### Q: What if a user doesn't have preferences?

**A:** They're skipped. The system logs a warning and continues with other users.

### Q: What if template doesn't exist?

**A:** The processChannel method throws an error, which is caught and logged. That user/channel is skipped, but processing continues for other users.

### Q: Can I send to just one user?

**A:** Yes! Include `userId` in the request body:

```json
{
  "userId": "user-123",
  "event": "WELCOME_MESSAGE",
  "data": { "firstName": "John" }
}
```

## 📚 Code Locations

- **Orchestrator Controller**: `services/orchestrator/src/notification/notification.controller.ts`
- **Orchestrator Service**: `services/orchestrator/src/notification/notification.service.ts`
- **RabbitMQ Service**: `services/orchestrator/src/rabbitmq/rabbitmq.service.ts`
- **Email Consumer**: `services/email-service/src/email/email.consumer.ts`
- **Email Service**: `services/email-service/src/email/email.service.ts`
- **Push Consumer**: `services/push-service/src/push/push.consumer.ts`
- **Push Service**: `services/push-service/src/push/push.service.ts`

## ✅ Summary

1. **Admin** sends POST request with JWT token
2. **Orchestrator** validates admin role, fetches users, processes each user
3. **Orchestrator** publishes messages to RabbitMQ queues
4. **Email/Push Services** consume from queues and send notifications
5. **Users** receive notifications!

The system is **decoupled**, **scalable**, and **reliable**! 🚀
