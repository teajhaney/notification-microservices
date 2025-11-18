# 🔔 Notification Microservices System

[![Open Source](https://img.shields.io/badge/Open%20Source-Yes-green.svg)](https://opensource.org/)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![NestJS](https://img.shields.io/badge/NestJS-11.0.1-red.svg)](https://nestjs.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue.svg)](https://www.typescriptlang.org/)

A production-ready, scalable notification microservices system built with NestJS, TypeScript, and RabbitMQ. This system enables you to send email and push notifications to users with template support, user preferences, and multi-channel delivery.

## 🌟 Features

- ✅ **Multi-Channel Support**: Email and Push notifications
- ✅ **Template-Based**: Dynamic template rendering with Handlebars
- ✅ **User Preferences**: Respects user opt-in/opt-out preferences
- ✅ **Scalable Architecture**: Microservices with message queue decoupling
- ✅ **Admin-Only Access**: Secure API with JWT authentication
- ✅ **Broadcast Support**: Send to all users or target specific users
- ✅ **Language Support**: Multi-language template support
- ✅ **Production Ready**: Error handling, logging, and health checks

## 📋 Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Services](#services)
- [Quick Start](#quick-start)
- [Testing Status](#testing-status)
- [Contributing](#contributing)
- [Documentation](#documentation)
- [License](#license)

## 🎯 Overview

This is an **open-source notification microservices system** that anyone can use, modify, and contribute to. The system is designed with clean architecture principles, following NestJS conventions, and uses TypeScript strict mode for type safety.

### The Big Picture

```
Admin User (API Client)
    ↓
    POST /notifications (with JWT token)
    ↓
API Gateway (Port 3000)
    ├─ Validates JWT token
    └─ Proxies to Orchestrator
    ↓
Orchestrator Service (Port 3002)
    ├─ Checks admin role (JWT is ONLY for authorization)
    ├─ Fetches ALL users from User-Service (excluding admins)
    ├─ Fetches templates from Template-Service
    ├─ For each user:
    │   ├─ Checks preferences (email_opt_in, push_opt_in)
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

## 🏗️ Architecture

### Key Concepts

#### 1. **JWT Token Purpose**

- **ONLY for Authentication/Authorization**: Verifies the user is logged in and has `admin` role
- **NOT for Recipient Selection**: The JWT token does NOT determine who receives notifications
- **Admin Check**: Only users with `role: "admin"` can send notifications

#### 2. **Recipient Selection**

- **If `userId` is provided**: Send to that ONE specific user
- **If `userId` is NOT provided**: Broadcast to ALL users in the database (excluding admins)
- **Email in `data` field**: This is just template data (like `{{firstName}}`), NOT a recipient selector

#### 3. **Message Queue Pattern**

- **Decoupling**: Services don't call each other directly
- **Reliability**: Messages persist even if services are down
- **Scalability**: Can add more workers to process faster
- **Asynchronous**: Orchestrator returns immediately, services process in background

#### 4. **Channel Selection Logic**

**NEW APPROACH**: Channels come from templates, not from the request!

- Templates define what channels are available (e.g., `[EMAIL]`, `[PUSH]`, or `[EMAIL, PUSH]`)
- User preferences filter which channels they're opted into
- Optional `channels` field in request can further filter, but still respects opt-ins

## 🔧 Services

### 1. **Orchestrator Service** (Port 3002)

The central coordinator that:

- Receives notification requests
- Validates admin authorization
- Fetches users and templates
- Renders templates with user data
- Publishes messages to RabbitMQ queues

**Status**: ✅ Tested and production-ready

See [services/orchestrator/README.md](services/orchestrator/README.md) for detailed documentation.

### 2. **Email Service** (Port 3004)

Consumes email messages from RabbitMQ and sends them via SMTP:

- Supports any SMTP provider (Gmail, SendGrid, Mailtrap, etc.)
- HTML and plain text support
- Automatic HTML detection
- Comprehensive error handling

**Status**: ✅ Tested and production-ready

See [services/email-service/README.md](services/email-service/README.md) for detailed documentation.

### 3. **Push Service** (Port 3005)

Consumes push notification messages from RabbitMQ and sends Web Push notifications:

- Uses Web Push protocol (VAPID)
- Supports browser push notifications
- Validates push subscriptions

**Status**: ⚠️ **Not Yet Tested** - Open for testing and contributions!

The push service functionality has been implemented but **has not been fully tested in a production environment**. We welcome contributions, testing, and feedback from the community. See [services/push-service/README.md](services/push-service/README.md) for setup and testing instructions.

### 4. **Template Service** (Port 3003)

Manages notification templates:

- Handlebars template rendering
- Multi-language support
- Template versioning
- Variable substitution

**Status**: ✅ Tested and production-ready

See [services/template-service/README.md](services/template-service/README.md) for detailed documentation.

### 5. **User Service** (Port 3001)

Manages users and preferences:

- User CRUD operations
- Preference management (email_opt_in, push_opt_in)
- Push token management
- JWT authentication

**Status**: ✅ Tested and production-ready

See [services/user-service/README.md](services/user-service/README.md) for detailed documentation.

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ and npm
- PostgreSQL (for user-service and template-service)
- RabbitMQ (for message queuing)
- SMTP credentials (for email-service)
- VAPID keys (for push-service)

### Installation

1. **Clone the repository**

```bash
git clone <repository-url>
cd notification-microservices
```

2. **Install dependencies for each service**

```bash
# Install root dependencies (if any)
npm install

# Install service dependencies
cd services/orchestrator && npm install && cd ../..
cd services/email-service && npm install && cd ../..
cd services/push-service && npm install && cd ../..
cd services/template-service && npm install && cd ../..
cd services/user-service && npm install && cd ../..
```

3. **Set up environment variables**

Each service has its own `.env` file. See individual service READMEs for required variables:

- `services/orchestrator/.env`
- `services/email-service/.env`
- `services/push-service/.env`
- `services/template-service/.env`
- `services/user-service/.env`

4. **Set up databases**

```bash
# User Service
cd services/user-service
npx prisma migrate dev
npx prisma generate

# Template Service
cd ../template-service
npx prisma migrate dev
npx prisma generate
```

5. **Start RabbitMQ**

```bash
# Using Docker
docker run -d --name rabbitmq -p 5672:5672 -p 15672:15672 rabbitmq:3-management

# Or install locally
# See https://www.rabbitmq.com/download.html
```

6. **Start services**

```bash
# Terminal 1: User Service
cd services/user-service && npm run start:dev

# Terminal 2: Template Service
cd services/template-service && npm run start:dev

# Terminal 3: Orchestrator
cd services/orchestrator && npm run start:dev

# Terminal 4: Email Service
cd services/email-service && npm run start:dev

# Terminal 5: Push Service
cd services/push-service && npm run start:dev
```

## 🧪 Testing Status

### ✅ Tested Services

The following services have been tested and are production-ready:

- **Orchestrator Service**: Fully tested with email and push notification flows
- **Email Service**: Tested with Gmail SMTP and other providers
- **Template Service**: Tested with template rendering and variable substitution
- **User Service**: Tested with user management and preferences

### ⚠️ Push Service Testing

**The Push Service has been implemented but not yet fully tested.** The implementation includes:

- ✅ VAPID key configuration
- ✅ RabbitMQ consumer setup
- ✅ Web Push notification sending
- ✅ Subscription validation
- ✅ Error handling

**What's Needed:**

- Real-world testing with browser push subscriptions
- Testing with different push service providers
- Performance testing under load
- Edge case testing

**We welcome contributions!** If you test the push service, please:

1. Report any issues you find
2. Share your testing results
3. Contribute improvements
4. Update documentation based on your findings

See [services/push-service/README.md](services/push-service/README.md) for testing instructions.

## 📝 Step-by-Step Flow

### Step 1: Admin Makes Request

```http
POST http://localhost:3002/notifications
Authorization: Bearer <JWT_TOKEN>
Content-Type: application/json

{
  "event": "WELCOME_MESSAGE",
  "data": {
    "firstName": "John Doe"
  },
  "channels": ["EMAIL", "PUSH"],  // Optional
  "language": "en"                 // Optional
}
```

### Step 2: Orchestrator Processing

1. **Validates** JWT token and admin role
2. **Fetches** all users with `role='user'` (excludes admins)
3. **Fetches** all templates for the event/language
4. **Determines** available channels from templates
5. **Filters** channels by user preferences
6. **For each user**:
   - Renders template with user data
   - Publishes message to appropriate queue

### Step 3: Message Queuing

Messages are published to RabbitMQ queues:

- `email.queue` - For email notifications
- `push.queue` - For push notifications

Each user gets their own message queued individually.

### Step 4: Service Consumption

- **Email Service** consumes from `email.queue` and sends via SMTP
- **Push Service** consumes from `push.queue` and sends via Web Push

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

## 🤝 Contributing

This is an **open-source project** and we welcome contributions! Here's how you can help:

### Ways to Contribute

1. **Test the Push Service**: Help us test and improve push notification functionality
2. **Report Bugs**: Found an issue? Open an issue with details
3. **Suggest Features**: Have an idea? We'd love to hear it
4. **Improve Documentation**: Help make the docs better
5. **Code Contributions**: Submit pull requests for improvements

### Contribution Guidelines

1. Follow NestJS conventions
2. Use TypeScript strict mode
3. Write clean, modular code
4. Add comments explaining complex logic
5. Update documentation for new features
6. Test your changes thoroughly

### Getting Started with Contributions

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Commit your changes (`git commit -m 'Add some amazing feature'`)
5. Push to the branch (`git push origin feature/amazing-feature`)
6. Open a Pull Request

## 📚 Documentation

Each service has its own detailed README:

- [Orchestrator Service](services/orchestrator/README.md) - Complete API documentation and examples
- [Email Service](services/email-service/README.md) - SMTP configuration and troubleshooting
- [Push Service](services/push-service/README.md) - VAPID setup and testing guide
- [Template Service](services/template-service/README.md) - Template management
- [User Service](services/user-service/README.md) - User and preference management

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

### Q: How do channels work?

**A:** Channels are determined from templates themselves. If a template supports `[EMAIL, PUSH]`, both channels are available. The optional `channels` field in the request can filter to specific channels, but user preferences are always respected.

## 📂 Project Structure

```
notification-microservices/
├── services/
│   ├── orchestrator/          # Central coordinator service
│   ├── email-service/         # Email delivery service
│   ├── push-service/          # Push notification service (⚠️ needs testing)
│   ├── template-service/      # Template management service
│   └── user-service/          # User management service
├── ARCHITECTURE_EXPLANATION.md # Detailed architecture docs
└── README.md                  # This file
```

## 🔒 Security Notes

- **Never commit sensitive data**: Keep `.env` files out of version control
- **Use strong JWT secrets**: Generate secure secrets for production
- **Protect VAPID private keys**: Keep them secret
- **Use HTTPS in production**: Required for push notifications
- **Validate all inputs**: Services use DTOs for validation

## 📄 License

This project is open source and available under the [MIT License](LICENSE).

## 🙏 Acknowledgments

- Built with [NestJS](https://nestjs.com/)
- Uses [RabbitMQ](https://www.rabbitmq.com/) for message queuing
- Uses [Nodemailer](https://nodemailer.com/) for email delivery
- Uses [web-push](https://github.com/web-push-libs/web-push) for push notifications
- Uses [Handlebars](https://handlebarsjs.com/) for template rendering

## 📞 Support

- **Issues**: Open an issue on GitHub
- **Questions**: Check the service-specific READMEs
- **Contributions**: See [Contributing](#contributing) section

---

**Made with ❤️ by the open source community**

**Status**: Production-ready (except push-service which needs testing)

**Contributions Welcome!** 🚀
