/**
 * App Module
 *
 * This is the root module of the Orchestrator service.
 * It imports all feature modules and sets up global configuration.
 */
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { NotificationModule } from './notification/notification.module';
import { RabbitMQModule } from './rabbitmq/rabbitmq.module';
import { HttpClientsModule } from './http-clients/http-clients.module';
import { AuthModule } from './auth/auth.module';
import config from './config';

@Module({
  imports: [
    // Global configuration module - makes config available everywhere
    ConfigModule.forRoot({
      isGlobal: true,
      load: [config], // Load our custom config function
    }),
    // Feature modules
    AuthModule,
    RabbitMQModule,
    HttpClientsModule,
    NotificationModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
