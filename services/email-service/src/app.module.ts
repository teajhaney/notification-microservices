import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EmailModule } from './email/email.module';
import { HealthModule } from './health/health.module';

/**
 * Root module wires configuration, health checks, and the email worker.
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      envFilePath: ['.env'],
      isGlobal: true,
      load: [
        () => ({
          rabbitmq: {
            queues: {
              email:
                process.env.EMAIL_QUEUE ||
                process.env.RABBITMQ_EMAIL_QUEUE ||
                'email.queue',
            },
            url: process.env.RABBITMQ_URL,
          },
          smtp: {
            fromEmail: process.env.SMTP_FROM_EMAIL,
            fromName: process.env.SMTP_FROM_NAME,
            host: process.env.SMTP_HOST,
            pass: process.env.SMTP_PASS,
            port: process.env.SMTP_PORT,
            secure: process.env.SMTP_SECURE,
            user: process.env.SMTP_USER,
          },
        }),
      ],
    }),
    EmailModule,
    HealthModule,
  ],
})
export class AppModule {}
