/**
 * RabbitMQ Module
 *
 * This module sets up the RabbitMQ connection and provides the RabbitMQ service
 * to other modules in the application.
 *
 * RabbitMQ is a message broker that allows services to communicate asynchronously
 * through queues. This enables:
 * - Decoupling: Services don't need to know about each other directly
 * - Reliability: Messages are persisted even if a service is temporarily down
 * - Scalability: Multiple workers can consume from the same queue
 */
import { Module, Global } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { RabbitMQService } from './rabbitmq.service';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [RabbitMQService],
  exports: [RabbitMQService],
})
export class RabbitMQModule {}
