import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';

/**
 * Dedicated module for the lightweight REST surface.
 * We intentionally keep it isolated so email processing code remains focused.
 */
@Module({
  controllers: [HealthController],
})
export class HealthModule {}
