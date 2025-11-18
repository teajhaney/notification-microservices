import { Controller, Get } from '@nestjs/common';

/**
 * Lightweight readiness endpoint for the push worker.
 */
@Controller('health')
export class HealthController {
  @Get()
  getHealth() {
    return { status: 'ok' };
  }
}
