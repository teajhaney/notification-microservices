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

# SMTP Configuration
# For Gmail (⚠️ IMPORTANT: Use 'smtp.gmail.com', NOT 'mtp.gmail.com'):
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password  # Use App Password, not regular password!
SMTP_SECURE=false
SMTP_FROM_NAME=Notification Bot
SMTP_FROM_EMAIL=your-email@gmail.com

# For Mailtrap (testing):
# SMTP_HOST=smtp.mailtrap.io
# SMTP_PORT=587
# SMTP_USER=your-mailtrap-user
# SMTP_PASS=your-mailtrap-pass
# SMTP_SECURE=false
```

**⚠️ Common Gmail Configuration Issues:**

1. **Typo in SMTP_HOST**: Use `smtp.gmail.com` (with 's'), NOT `mtp.gmail.com`
2. **App Password Required**: Gmail requires an App Password, not your regular password
   - Go to Google Account → Security → 2-Step Verification → App Passwords
   - Generate an App Password for "Mail"
   - Use that 16-character password as `SMTP_PASS`
3. **Port**: Use `587` for TLS or `465` for SSL (set `SMTP_SECURE=true` for 465)

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
