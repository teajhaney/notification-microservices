import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

/**
 * Starts the push worker and exposes the health endpoint.
 */
async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.enableShutdownHooks();
  const port = process.env.PORT ?? 3005;
  await app.listen(port);
  Logger.log(`📱 push-service listening on port ${port} and waiting for jobs`);
}
bootstrap().catch((error) => {
  const err = error as Error;
  Logger.error(err.message, err.stack, 'PushServiceBootstrap');
  process.exit(1);
});
