/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-redundant-type-constituents */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import amqp from 'amqplib';
import type { ConsumeMessage } from 'amqplib';
import { EmailService } from './email.service';
import { NotificationMessage } from '../common/notification-message.interface';

type AmqpConnection = Awaited<ReturnType<typeof amqp.connect>> | null;

type AmqpChannel = Awaited<
  ReturnType<NonNullable<AmqpConnection>['createChannel']>
> | null;

/**
 * RabbitMQ consumer that pulls email jobs and hands them to EmailService.
 * The lifecycle hooks ensure we connect/disconnect only once per process.
 */
@Injectable()
export class EmailConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EmailConsumer.name);
  private connection: AmqpConnection | null = null;
  private channel: AmqpChannel | null = null;

  constructor(
    private readonly configService: ConfigService,
    private readonly emailService: EmailService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.connect();
    await this.startConsuming();
  }

  async onModuleDestroy(): Promise<void> {
    await this.disconnect();
  }

  /**
   * Establish shared connection/channel to RabbitMQ.
   */
  private async connect(): Promise<void> {
    const rabbitUrl = this.configService.get<string>('rabbitmq.url');
    if (!rabbitUrl) {
      throw new Error('RABBITMQ_URL is not configured for email-service');
    }

    const connection = await amqp.connect(rabbitUrl);
    const channel = await connection.createChannel();

    this.connection = connection;
    this.channel = channel;

    connection.on('error', (error: Error) => {
      this.logger.error(`RabbitMQ connection error: ${error.message}`);
    });

    connection.on('close', () => {
      this.logger.warn('RabbitMQ connection closed');
    });
  }

  /**
   * Begin consuming from the configured queue with basic prefetch for fairness.
   */
  private async startConsuming(): Promise<void> {
    const channel = this.assertChannel();

    const queue = this.configService.get<string>('rabbitmq.queues.email');
    if (!queue) {
      throw new Error('EMAIL_QUEUE is not configured for email-service');
    }

    await channel.assertQueue(queue, { durable: true });
    await channel.prefetch(10);

    await channel.consume(queue, async (msg: ConsumeMessage | null) => {
      if (!msg) {
        return;
      }

      try {
        const payload = JSON.parse(
          msg.content.toString('utf8'),
        ) as NotificationMessage;

        this.logger.debug(
          `Received message - Notification ID: ${payload.notificationId}, Channel: ${payload.channel}, Body length: ${payload.content?.body?.length || 0} characters`,
        );

        if (payload.channel !== 'EMAIL') {
          this.logger.warn(
            `Received non-email payload on email queue: ${payload.channel}`,
          );
          channel.ack(msg);
          return;
        }

        // Log the full payload structure for debugging
        this.logger.debug(
          `Email payload structure: ${JSON.stringify(
            {
              notificationId: payload.notificationId,
              userId: payload.userId,
              recipient: payload.recipient,
              content: {
                subject: payload.content?.subject,
                bodyLength: payload.content?.body?.length,
                bodyPreview: payload.content?.body?.substring(0, 100),
              },
            },
            null,
            2,
          )}`,
        );

        await this.emailService.sendEmail(payload);
        channel.ack(msg);
      } catch (error) {
        this.logger.error('Failed to process email job', error as Error);
        channel.nack(msg, false, false);
      }
    });

    this.logger.log(`Listening for jobs on ${queue}`);
  }

  /**
   * Close open RabbitMQ resources gracefully during shutdown.
   */
  private async disconnect(): Promise<void> {
    await this.channel?.close();
    this.channel = null;
    await this.connection?.close();
    this.connection = null;
  }

  /**
   * Helper to ensure channel exists when accessed.
   */
  private assertChannel(): NonNullable<AmqpChannel> {
    if (!this.channel) {
      throw new Error('RabbitMQ channel is not initialized');
    }
    return this.channel;
  }
}
