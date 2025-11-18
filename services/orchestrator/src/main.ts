/**
 * Main Bootstrap File
 *
 * This is the entry point of the Orchestrator service.
 * It:
 * 1. Creates the NestJS application
 * 2. Sets up global pipes for validation
 * 3. Sets up global interceptors for response formatting
 * 4. Sets up global exception filters for error handling
 * 5. Starts the HTTP server
 */
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import {
  ResponseInterceptor,
  HttpExceptionFilter,
} from './common/interceptors/response.interceptors';
import { ConfigService } from '@nestjs/config';

async function bootstrap() {
  // Create NestJS application
  const app = await NestFactory.create(AppModule);

  // Get configuration service
  const configService = app.get(ConfigService);
  const port = (configService.get('port') as number) || 3002;

  // Global validation pipe
  // This automatically validates all incoming requests using DTOs
  // transform: true - automatically transforms plain objects to DTO instances
  // whitelist: true - strips properties that don't have decorators
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true, // Reject requests with unknown properties
    }),
  );

  // Global response interceptor
  // Wraps all successful responses in a standard format
  app.useGlobalInterceptors(new ResponseInterceptor());

  // Global exception filter
  // Catches all errors and formats them consistently
  app.useGlobalFilters(new HttpExceptionFilter());

  // Enable CORS if needed (for development)
  app.enableCors();

  // Start the server
  await app.listen(port);

  console.log(`\n🚀 Orchestrator Service is running on port ${port}`);
  console.log(
    `📡 User Service: ${configService.get('userServiceUrl') as string}`,
  );
  console.log(
    `📡 Template Service: ${configService.get('templateServiceUrl') as string}`,
  );
  console.log(`📡 RabbitMQ: ${configService.get('rabbitmq.url') as string}`);
  console.log(
    `\n✅ Notification endpoint available at: http://localhost:${port}/notifications\n`,
  );
}

bootstrap().catch((err) => {
  console.error('Error starting app:', err);
  process.exit(1);
});
