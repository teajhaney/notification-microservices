/**
 * Notification Module
 *
 * This module brings together all notification-related functionality:
 * - NotificationController: Handles HTTP requests
 * - NotificationService: Business logic
 * - DTOs: Request validation
 *
 * Note: We import AuthModule because NotificationController uses JwtAuthGuard,
 * which requires JwtService from AuthModule.
 */
import { Module } from '@nestjs/common';
import { NotificationController } from './notification.controller';
import { NotificationService } from './notification.service';
import { RabbitMQModule } from '../rabbitmq/rabbitmq.module';
import { HttpClientsModule } from '../http-clients/http-clients.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [RabbitMQModule, HttpClientsModule, AuthModule],
  controllers: [NotificationController],
  providers: [NotificationService],
})
export class NotificationModule {}
