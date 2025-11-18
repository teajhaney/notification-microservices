## 📧 Email Service

This worker listens to the `email.queue` RabbitMQ queue, renders the payload produced by the orchestrator, and delivers real emails through your SMTP provider (Mailtrap, SendGrid SMTP, SES SMTP, etc.).

---

### 🧱 Architecture

- `RabbitMQ` → durable queue for email jobs
- `EmailConsumer` → long–living worker pulling jobs with `prefetch` for fairness
- `EmailService` → wraps Nodemailer and your SMTP credentials
- `/health` endpoint → simple readiness probe for Kubernetes/Docker health checks

---

### ⚙️ Required Environment Variables

Create `services/email-service/.env` (or inject via your orchestrator) with:

```env
PORT=3004
RABBITMQ_URL=amqp://guest:guest@localhost:5672
EMAIL_QUEUE=email.queue

SMTP_HOST=smtp.mailtrap.io
SMTP_PORT=587
SMTP_USER=your-user
SMTP_PASS=your-pass
SMTP_SECURE=false
SMTP_FROM_NAME=Notification Bot
SMTP_FROM_EMAIL=notifications@example.com
```

All variables are loaded through `@nestjs/config`, so any process manager can override them.

---

### 🚀 Running Locally

```bash
cd services/email-service
npm install
npm run start:dev
```

The worker logs `📨 email-service listening...` once it connects to RabbitMQ and is ready to consume messages.

---

### ✅ Health Check

```
GET http://localhost:3004/health
→ { "status": "ok" }
```

Use this endpoint for readiness/liveness probes.

---

### 🧪 Tests & Linting

```bash
npm run lint
npm run test
npm run test:e2e
```

The e2e test simply asserts the `/health` endpoint response so it doubles as a smoke test.

---

### 🛠️ Operational Notes

- Messages are `nack`ed without requeue on fatal errors to prevent poison-looping. Use a Dead Letter Exchange if you need retries.
- All configuration lives in one module so you can replace SMTP with an API-based provider later without touching the consumer.
- The worker will refuse to start when SMTP or RabbitMQ credentials are missing to surface misconfiguration early.
