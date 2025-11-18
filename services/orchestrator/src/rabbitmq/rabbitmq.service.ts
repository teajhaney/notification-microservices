import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as amqp from 'amqplib';

// Type imports for better TypeScript support
// Using ReturnType to get the actual return types from amqplib functions
type Connection = Awaited<ReturnType<typeof amqp.connect>>;
type Channel = Awaited<ReturnType<Connection['createChannel']>>;

// Message payload structure for notification queues that will be sent to email-service and push-service

export interface NotificationMessage {
  notificationId: string;
  userId: string;
  event: string;
  channel: 'EMAIL' | 'PUSH';
  recipient: {
    email?: string;
    pushToken?: unknown;
  };
  content: {
    subject?: string; // for email
    title?: string; // for push
    body: string;
  };
  metadata: {
    language: string;
    templateId: string;
    correlationId: string;
  };
}

@Injectable()
export class RabbitMQService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RabbitMQService.name);
  private connection: Connection | null = null;
  private channel: Channel | null = null;

  constructor(private configService: ConfigService) {}

  // Initialize RabbitMQ connection when module starts

  async onModuleInit() {
    await this.connect();
  }

  // Clean up connection when module is destroyed

  async onModuleDestroy() {
    await this.disconnect();
  }

  // Establish connection to RabbitMQ and create a channel

  private async connect(): Promise<void> {
    try {
      const rabbitmqUrl = this.configService.get<string>('rabbitmq.url');

      if (!rabbitmqUrl) {
        throw new Error('RabbitMQ URL is not configured');
      }

      this.logger.log(`Connecting to RabbitMQ at ${rabbitmqUrl}...`);

      // Step 1: Connect to RabbitMQ server
      this.connection = await amqp.connect(rabbitmqUrl);

      if (!this.connection) {
        throw new Error('Failed to establish RabbitMQ connection');
      }

      // Step 2: Create a channel for operations
      this.channel = await this.connection.createChannel();

      if (!this.channel) {
        throw new Error('Failed to create RabbitMQ channel');
      }

      // Step 3: Assert queues exist (create if they don't)
      // durable: true means queue survives server restarts
      const emailQueue = this.configService.get<string>(
        'rabbitmq.queues.email',
      );
      const pushQueue = this.configService.get<string>('rabbitmq.queues.push');

      if (!emailQueue || !pushQueue) {
        throw new Error('Queue names are not configured');
      }

      await this.channel.assertQueue(emailQueue, { durable: true });
      await this.channel.assertQueue(pushQueue, { durable: true });

      this.logger.log(`✅ RabbitMQ connected and queues asserted`);
      this.logger.log(`   - Email queue: ${emailQueue}`);
      this.logger.log(`   - Push queue: ${pushQueue}`);

      // Step 4: Handle connection errors
      if (this.connection) {
        this.connection.on('error', (err) => {
          this.logger.error('RabbitMQ connection error:', err);
        });

        this.connection.on('close', () => {
          this.logger.warn('RabbitMQ connection closed');
        });
      }
    } catch (error) {
      this.logger.error('Failed to connect to RabbitMQ:', error);
      throw error;
    }
  }

  // Close RabbitMQ connection gracefully

  private async disconnect(): Promise<void> {
    try {
      if (this.channel) {
        await this.channel.close();
        this.channel = null;
      }
      if (this.connection) {
        await this.connection.close();
        this.connection = null;
      }
      this.logger.log('RabbitMQ connection closed');
    } catch (error) {
      this.logger.error('Error closing RabbitMQ connection:', error);
    }
  }

  /**
   * Publish a message to a queue

   * @param queueName - The name of the queue to publish to
   * @param message - The notification message to send
   *

   */
  async publishToQueue(
    queueName: string,
    message: NotificationMessage,
  ): Promise<void> {
    if (!this.channel) {
      throw new Error('RabbitMQ channel not initialized');
    }

    try {
      // Convert message to JSON string (RabbitMQ works with buffers/strings)
      const messageBuffer = Buffer.from(JSON.stringify(message));

      // Publish to queue using default exchange
      // Default exchange routes messages directly to queues by name
      const sent = this.channel.sendToQueue(queueName, messageBuffer, {
        persistent: true, // Message survives server restarts
      });

      if (sent) {
        this.logger.log(
          `✅ Message published to ${queueName} for notification ${message.notificationId}`,
        );
      } else {
        // This happens if the queue is full (backpressure)
        this.logger.warn(
          `⚠️  Queue ${queueName} is full, message not sent for notification ${message.notificationId}`,
        );
        throw new Error(`Failed to publish message to queue ${queueName}`);
      }
    } catch (error) {
      this.logger.error(`Failed to publish message to ${queueName}:`, error);
      throw error;
    }
  }

  //Convenience method to publish email notification

  async publishEmailNotification(message: NotificationMessage): Promise<void> {
    const emailQueue = this.configService.get<string>('rabbitmq.queues.email');
    if (!emailQueue) {
      throw new Error('Email queue name is not configured');
    }
    await this.publishToQueue(emailQueue, message);
  }

  // Convenience method to publish push notification

  async publishPushNotification(message: NotificationMessage): Promise<void> {
    const pushQueue = this.configService.get<string>('rabbitmq.queues.push');
    if (!pushQueue) {
      throw new Error('Push queue name is not configured');
    }
    await this.publishToQueue(pushQueue, message);
  }
}
