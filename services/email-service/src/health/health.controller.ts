import { Controller, Get } from '@nestjs/common';

/**
 * Simple health controller so orchestrator/devops can probe the worker.
 * Exposing this endpoint keeps the service observable even though its main job
 * happens in the background RabbitMQ consumer.
 */
@Controller('health')
export class HealthController {
  @Get()
  getHealth() {
    return { status: 'ok' };
  }
}
