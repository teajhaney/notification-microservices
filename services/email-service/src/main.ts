import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

/**
 * Boots the Nest HTTP context and the background consumer in one place.
 */
async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.enableShutdownHooks();
  const port = process.env.PORT ?? 3004;
  await app.listen(port);
  Logger.log(`📨 email-service listening on port ${port} and waiting for jobs`);
}
bootstrap().catch((error) => {
  const err = error as Error;
  Logger.error(err.message, err.stack, 'EmailServiceBootstrap');
  process.exit(1);
});
