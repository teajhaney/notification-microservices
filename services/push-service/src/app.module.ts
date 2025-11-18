import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HealthModule } from './health/health.module';
import { PushModule } from './push/push.module';

/**
 * Root module wiring configuration and the push worker.
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
              push:
                process.env.PUSH_QUEUE ||
                process.env.RABBITMQ_PUSH_QUEUE ||
                'push.queue',
            },
            url: process.env.RABBITMQ_URL,
          },
          vapid: {
            privateKey: process.env.VAPID_PRIVATE_KEY,
            publicKey: process.env.VAPID_PUBLIC_KEY,
            subject: process.env.VAPID_SUBJECT,
          },
        }),
      ],
    }),
    HealthModule,
    PushModule,
  ],
})
export class AppModule {}
