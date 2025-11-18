import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';

/**
 * Separate module so HTTP surface stays isolated from worker logic.
 */
@Module({
  controllers: [HealthController],
})
export class HealthModule {}
