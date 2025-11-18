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
import { NotificationMessage } from '../common/notification-message.interface';
import { PushService } from './push.service';

/**
 * RabbitMQ consumer for push notifications.
 */
type Connection = Awaited<ReturnType<typeof amqp.connect>>;
type Channel = Awaited<ReturnType<Connection['createChannel']>>;

@Injectable()
export class PushConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PushConsumer.name);
  private connection: Connection | null = null;
  private channel: Channel | null = null;

  constructor(
    private readonly configService: ConfigService,
    private readonly pushService: PushService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.connect();
    await this.startConsuming();
  }

  async onModuleDestroy(): Promise<void> {
    await this.disconnect();
  }

  private async connect(): Promise<void> {
    const rabbitUrl = this.configService.get<string>('rabbitmq.url');
    if (!rabbitUrl) {
      throw new Error('RABBITMQ_URL is not configured for push-service');
    }

    const connection = await amqp.connect(rabbitUrl);
    const channel = await connection.createChannel();

    this.connection = connection;
    this.channel = channel;

    connection.on('error', (error) => {
      this.logger.error(`RabbitMQ connection error: ${error.message}`);
    });

    connection.on('close', () => {
      this.logger.warn('RabbitMQ connection closed');
    });
  }

  private async startConsuming(): Promise<void> {
    const channel = this.assertChannel();

    const queue = this.configService.get<string>('rabbitmq.queues.push');
    if (!queue) {
      throw new Error('PUSH_QUEUE is not configured for push-service');
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

        if (payload.channel !== 'PUSH') {
          this.logger.warn(
            `Received mismatched channel on push queue: ${payload.channel}`,
          );
          channel.ack(msg);
          return;
        }

        await this.pushService.sendPush(payload);
        channel.ack(msg);
      } catch (error) {
        this.logger.error('Failed to process push job', error as Error);
        channel.nack(msg, false, false);
      }
    });

    this.logger.log(`Listening for push jobs on ${queue}`);
  }

  private async disconnect(): Promise<void> {
    await this.channel?.close();
    this.channel = null;
    await this.connection?.close();
    this.connection = null;
  }

  private assertChannel(): Channel {
    if (!this.channel) {
      throw new Error('RabbitMQ channel is not initialized');
    }
    return this.channel;
  }
}
