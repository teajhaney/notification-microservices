# Orchestrator Service

The Orchestrator Service is the central coordinator for the notification microservices architecture. It receives notification requests, orchestrates the entire notification flow, and publishes messages to RabbitMQ queues for processing by email and push notification services.

> **✅ Status**: This service has been tested and is production-ready. It has been tested with email and push notification flows.

## 📋 Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Features](#features)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Configuration](#configuration)
- [Running the Service](#running-the-service)
- [API Endpoints](#api-endpoints)
- [Testing](#testing)
- [How It Works](#how-it-works)
- [Troubleshooting](#troubleshooting)

## 🎯 Overview

The Orchestrator Service acts as the "brain" of the notification system. When a notification request comes in, it:

1. **Validates** the request and authenticates the user (admin role required)
2. **Fetches** all users with `role='user'` (admin users are automatically excluded)
3. **Fetches** all templates for the event/language from template-service
4. **Determines** channels from templates (channels come from templates, not from request!)
5. **Filters** channels by user preferences (respects opt-outs)
6. **Renders** templates with the provided data for each user
7. **Publishes** individual messages to RabbitMQ queues (one per user per channel)

This design provides:

- **Decoupling**: Services communicate via queues, not direct calls
- **Scalability**: Add more workers as needed
- **Reliability**: Messages persist even if services are temporarily down
- **Flexibility**: Easy to add new notification channels

## 🏗️ Architecture

```
Client Request
    ↓
API Gateway (/notifications)
    ↓
Orchestrator Service
    ├─ Validates JWT token
    ├─ Fetches user preferences (user-service)
    ├─ Fetches templates (template-service)
    ├─ Renders templates with data
    └─ Publishes to RabbitMQ
         ├─ email.queue → Email Service
         └─ push.queue → Push Service
```

## ✨ Features

- ✅ JWT authentication and authorization
- ✅ User preference-based channel selection
- ✅ Multi-language template support
- ✅ Template rendering with dynamic data
- ✅ RabbitMQ message queuing
- ✅ Comprehensive error handling
- ✅ Request validation
- ✅ Standardized API responses

## 📦 Prerequisites

Before running the Orchestrator Service, ensure you have:

- **Node.js** (v18 or higher)
- **npm** or **yarn**
- **RabbitMQ** server running (see [RabbitMQ Setup](#rabbitmq-setup))
- **User Service** running (default: `http://localhost:3001`)
- **Template Service** running (default: `http://localhost:3003`)

## 🚀 Installation

1. **Navigate to the orchestrator directory:**

   ```bash
   cd services/orchestrator
   ```

2. **Install dependencies:**

   ```bash
   npm install
   ```

3. **Set up environment variables:**
   Create a `.env` file in the `services/orchestrator/` directory (see [Configuration](#configuration))

## ⚙️ Configuration

Create a `.env` file in `services/orchestrator/` with the following variables:

```env
# Service Port
PORT=3002

# RabbitMQ Configuration
RABBITMQ_URL=amqp://localhost:5672
EMAIL_QUEUE=email.queue
PUSH_QUEUE=push.queue

# External Service URLs
USER_SERVICE_URL=http://localhost:3001
TEMPLATE_SERVICE_URL=http://localhost:3003

# JWT Secret (must match API Gateway and other services)
JWT_SECRET=your-secret-key-here

# Optional: Redis URL (for caching if needed)
REDIS_URL=redis://localhost:6379
```

### Environment Variables Explained

| Variable               | Description                              | Default                  |
| ---------------------- | ---------------------------------------- | ------------------------ |
| `PORT`                 | Port where the orchestrator service runs | `3002`                   |
| `RABBITMQ_URL`         | RabbitMQ connection string               | `amqp://localhost:5672`  |
| `EMAIL_QUEUE`          | Queue name for email notifications       | `email.queue`            |
| `PUSH_QUEUE`           | Queue name for push notifications        | `push.queue`             |
| `USER_SERVICE_URL`     | Base URL of the user-service             | `http://localhost:3001`  |
| `TEMPLATE_SERVICE_URL` | Base URL of the template-service         | `http://localhost:3003`  |
| `JWT_SECRET`           | Secret key for JWT token validation      | (required)               |
| `REDIS_URL`            | Redis connection string (optional)       | `redis://localhost:6379` |

## 🐰 RabbitMQ Setup

### Using Docker (Recommended)

```bash
docker run -d \
  --name rabbitmq \
  -p 5672:5672 \
  -p 15672:15672 \
  rabbitmq:3-management
```

This will:

- Start RabbitMQ on port `5672` (AMQP protocol)
- Start Management UI on port `15672` (access at `http://localhost:15672`)
- Default credentials: `guest` / `guest`

### Using Local Installation

1. **Install RabbitMQ:**

   ```bash
   # macOS
   brew install rabbitmq

   # Ubuntu/Debian
   sudo apt-get install rabbitmq-server
   ```

2. **Start RabbitMQ:**

   ```bash
   # macOS
   brew services start rabbitmq

   # Ubuntu/Debian
   sudo systemctl start rabbitmq-server
   ```

## 🏃 Running the Service

### Development Mode

```bash
npm run start:dev
```

This will:

- Start the service in watch mode (auto-reload on changes)
- Run on the port specified in `.env` (default: `3002`)

### Production Mode

```bash
# Build the application
npm run build

# Start the production server
npm run start:prod
```

### Expected Output

When the service starts successfully, you should see:

```
🚀 Orchestrator Service is running on port 3002
📡 User Service: http://localhost:3001
📡 Template Service: http://localhost:3003
📡 RabbitMQ: amqp://localhost:5672

✅ Notification endpoint available at: http://localhost:3002/notifications
```

## 📡 API Endpoints

### Create Notification

**Endpoint:** `POST /notifications`

**Authentication:** Required (JWT Bearer token)

**Headers:**

```
Authorization: Bearer <JWT_TOKEN>
Content-Type: application/json
X-Correlation-ID: <optional-correlation-id>
```

**Request Body:**

```json
{
  "event": "WELCOME_MESSAGE",
  "data": {
    "name": "John Doe",
    "orderId": "12345"
  },
  "channels": ["EMAIL", "PUSH"], // Optional: filters available channels from templates
  "language": "en" // Optional: defaults to user preference or "en"
}
```

**Important Notes:**

- `channels` field is **optional** - if not provided, all channels from templates are used
- Channels are determined from templates themselves (templates define what channels are available)
- Admin users (`role='admin'`) are automatically excluded from notifications
- Each user gets their own message queued individually

**Response (Success - 200):**

```json
{
  "success": true,
  "data": {
    "notificationId": "550e8400-e29b-41d4-a716-446655440000",
    "status": "queued",
    "channels": ["EMAIL", "PUSH"],
    "message": "Notification queued successfully"
  },
  "message": "Request successful",
  "meta": {}
}
```

**Response (Error - 400/404/500):**

```json
{
  "success": false,
  "error": "Error message here",
  "message": "Error message here",
  "data": {},
  "meta": {}
}
```

## 🧪 Testing

### Prerequisites for Testing

Before testing, ensure:

1. ✅ **Orchestrator Service** is running on port `3002`
2. ✅ **User Service** is running and has test users with preferences
3. ✅ **Template Service** is running and has templates for the events you're testing
4. ✅ **RabbitMQ** is running and accessible
5. ✅ You have a valid **JWT token** from the user-service

### Step 1: Get a JWT Token

First, authenticate with the user-service to get a JWT token:

```bash
# Sign in (replace with your test user credentials)
curl -X POST http://localhost:3000/user/signin \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "your-password"
  }'
```

**Response:**

```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": { ... }
  }
}
```

Copy the `token` value for use in the next step.

### Step 2: Create a Test User with Preferences

Make sure your test user has preferences set up:

```bash
# Get user preferences (replace USER_ID and TOKEN)
curl -X GET http://localhost:3000/user/preferences/USER_ID \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

If preferences don't exist, create them:

```bash
curl -X POST http://localhost:3000/user/preferences \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "email_opt_in": true,
    "push_opt_in": true,
    "language": "en"
  }'
```

### Step 3: Create Templates in Template Service

Ensure templates exist for the events you want to test:

```bash
# Create a welcome message template (replace TOKEN)
curl -X POST http://localhost:3000/template \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Welcome Message",
    "event": "WELCOME_MESSAGE",
    "channel": ["EMAIL", "PUSH"],
    "language": "en",
    "subject": "Welcome, {{name}}!",
    "title": "Welcome!",
    "body": "Hello {{name}}, welcome to our platform!"
  }'
```

### Step 4: Test Notification Creation

Now you can test creating a notification:

#### Example 1: Welcome Message (Email + Push)

```bash
curl -X POST http://localhost:3002/notifications \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "event": "WELCOME_MESSAGE",
    "data": {
      "name": "John Doe"
    },
    "channels": ["EMAIL", "PUSH"],
    "language": "en"
  }'
```

#### Example 2: Order Confirmation (Email Only)

```bash
curl -X POST http://localhost:3002/notifications \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "event": "ORDER_CONFIRMATION",
    "data": {
      "name": "Jane Smith",
      "orderId": "ORD-12345",
      "orderTotal": "$99.99",
      "items": ["Product A", "Product B"]
    },
    "channels": ["EMAIL"],
    "language": "en"
  }'
```

#### Example 3: Password Reset (Email Only)

```bash
curl -X POST http://localhost:3002/notifications \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "event": "PASSWORD_RESET",
    "data": {
      "name": "Alice Johnson",
      "resetLink": "https://example.com/reset?token=abc123"
    },
    "channels": ["EMAIL"],
    "language": "en"
  }'
```

#### Example 4: Using Templates to Determine Channels (No Channels Specified)

If you don't specify channels, the service will use ALL channels available from templates:

```bash
curl -X POST http://localhost:3002/notifications \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "event": "WELCOME_MESSAGE",
    "data": {
      "name": "Bob Wilson"
    }
  }'
```

**What happens:**

- Fetches all templates for `WELCOME_MESSAGE/en`
- If templates have `[EMAIL]` and `[PUSH]` → both channels are used
- Still respects user preferences (won't send if user opted out)

#### Example 5: Broadcast to All Users (No userId specified)

```bash
curl -X POST http://localhost:3002/notifications \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "event": "WELCOME_MESSAGE",
    "data": {
      "firstName": "John"
    },
    "channels": ["EMAIL", "PUSH"]
  }'
```

**What happens:**

- Fetches ALL users with `role='user'` (excludes admins)
- For each user, queues notifications based on their preferences
- Each user gets their own message in the queue

### Step 5: Verify Messages in RabbitMQ

You can verify that messages were published to RabbitMQ queues:

1. **Access RabbitMQ Management UI:**
   - Open `http://localhost:15672` in your browser
   - Login with `guest` / `guest`

2. **Check Queues:**
   - Navigate to "Queues" tab
   - You should see `email.queue` and `push.queue`
   - Check the message count and click on a queue to see messages

3. **Inspect Messages:**
   - Click on a queue name
   - Click "Get messages" to see the message payload
   - Messages should contain the notification data in JSON format

### Using Postman or Insomnia

1. **Create a new POST request:**
   - URL: `http://localhost:3002/notifications`
   - Method: `POST`

2. **Set Headers:**
   - `Authorization`: `Bearer YOUR_JWT_TOKEN`
   - `Content-Type`: `application/json`

3. **Set Body (JSON):**

   ```json
   {
     "event": "WELCOME_MESSAGE",
     "data": {
       "name": "John Doe",
       "orderId": "12345"
     },
     "channels": ["EMAIL", "PUSH"],
     "language": "en"
   }
   ```

4. **Send the request** and check the response

## 🔄 How It Works

### Request Flow

1. **Client sends request** to Orchestrator: `POST /notifications`
   - Must include JWT token with `role='admin'`
   - Request body: `event`, `data`, optional `channels`, optional `language`

2. **Orchestrator** receives request:
   - Validates JWT token (JwtAuthGuard)
   - Checks if user has admin role (only admins can send notifications)
   - Validates request body (CreateNotificationDto)

3. **NotificationService** processes:
   - **Step 1:** Resolves target users
     - If `userId` provided → fetch that specific user (if `role='user'`)
     - If `userId` NOT provided → fetch ALL users with `role='user'` (excludes admins)
   - **Step 2:** Fetches ALL templates for event/language
     - Gets all active templates for the event
     - Extracts available channels from templates (e.g., [EMAIL], [PUSH], or both)
   - **Step 3:** For each user:
     - Determines channels from templates (filtered by user preferences)
     - Filters by requested channels (if provided)
     - For each channel:
       - Finds template that supports the channel
       - Renders template with user's data
       - Creates RabbitMQ message with user's info
       - Publishes to appropriate queue (email.queue or push.queue)
   - **Step 4:** Returns response with notification ID and status

4. **Response** returned to client:
   - `notificationId`: Unique ID for this notification batch
   - `status`: "queued"
   - `channels`: List of channels that were successfully queued
   - `message`: Summary of how many recipients were processed

### Channel Selection Logic (NEW APPROACH)

**Channels are determined from templates, not from the request!**

The service determines which channels to use:

1. **Fetch all templates** for the event/language combination
   - Templates can have `channel: [EMAIL]`, `channel: [PUSH]`, or `channel: [EMAIL, PUSH]`
   - Extract all available channels from templates

2. **Filter by user preferences:**
   - If user has `email_opt_in: false` → exclude EMAIL channel
   - If user has `push_opt_in: false` → exclude PUSH channel

3. **Filter by requested channels (if provided):**
   - If `channels: ["EMAIL"]` is specified → only use EMAIL (if available in templates)
   - If `channels` is not specified → use all available channels from templates

4. **Language selection:**
   - Priority: Request language → User preference → Default "en"

**Example:**

- Template 1: `event: "WELCOME_MESSAGE"`, `channel: [EMAIL]` → EMAIL available
- Template 2: `event: "WELCOME_MESSAGE"`, `channel: [PUSH]` → PUSH available
- Result: Both EMAIL and PUSH are available (if user opted in)

### User Filtering

**Admin users are automatically excluded:**

- Only users with `role='user'` receive notifications
- Users with `role='admin'` are filtered out automatically
- This applies to both specific user targeting and broadcast scenarios

### Message Queuing

**Each user gets their own message:**

- For 3 users → 3 separate messages queued (one per user)
- Each message contains that specific user's data
- If one user fails, others still get queued (error handling continues)

### Message Format

Messages published to RabbitMQ follow this structure:

```json
{
  "notificationId": "uuid",
  "userId": "user-id",
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
    "templateId": "template-id",
    "correlationId": "correlation-id"
  }
}
```

## 🐛 Troubleshooting

### Common Issues

#### 1. "RabbitMQ connection failed"

**Problem:** Cannot connect to RabbitMQ server

**Solutions:**

- Verify RabbitMQ is running: `docker ps` (if using Docker)
- Check `RABBITMQ_URL` in `.env` file
- Test connection: `telnet localhost 5672`
- Check RabbitMQ logs

#### 2. "User preferences not found"

**Problem:** User doesn't have preferences set up

**Solutions:**

- Create preferences for the user via user-service
- Ensure user ID in JWT token matches an existing user
- Check user-service is running and accessible

#### 3. "Template not found" or "No templates found"

**Problem:** No templates exist for the event/language combination

**Solutions:**

- Create template(s) in template-service for the event
- Templates can have `channel: [EMAIL]`, `channel: [PUSH]`, or `channel: [EMAIL, PUSH]`
- Verify template has correct `event` and `language`
- Check template-service is running and accessible
- **Note:** Channels are determined from templates, so make sure templates exist with the channels you want

#### 4. "JWT validation failed"

**Problem:** JWT token is invalid or expired

**Solutions:**

- Get a new token from user-service
- Verify `JWT_SECRET` matches across all services
- Check token hasn't expired

#### 5. "No valid notification channels available"

**Problem:** User has opted out of all channels OR no templates exist for the event

**Solutions:**

- Update user preferences to enable at least one channel (`email_opt_in: true` or `push_opt_in: true`)
- Create templates for the event with the desired channels
- Verify templates exist and are active (`isActive: true`)

#### 6. "Failed to process notification for any recipient"

**Problem:** All users were skipped or failed processing

**Solutions:**

- Check logs for detailed error messages
- Verify users exist with `role='user'` (admins are excluded)
- Ensure users have preferences set up
- Verify templates exist and can be rendered
- Check RabbitMQ connection and queues

### Debug Mode

Enable debug logging by setting:

```env
LOG_LEVEL=debug
```

This will show detailed logs of:

- HTTP requests to user-service and template-service
- Template rendering process
- RabbitMQ message publishing
- Channel selection logic

### Checking Logs

The service logs important events:

- ✅ Successful operations (green checkmarks)
- ⚠️ Warnings (yellow)
- ❌ Errors (red)

Watch the console output for real-time debugging.

## 📚 Related Documentation

- [User Service README](../user-service/README.md)
- [Template Service README](../template-service/README.md)
- [API Gateway README](../../api-gateway/README.md)

## 🤝 Contributing

When adding new features:

1. Follow NestJS conventions
2. Add comments explaining complex logic
3. Update this README with new endpoints/examples
4. Test thoroughly before submitting

## 📝 License

[Your License Here]
