import { Module } from '@nestjs/common';
import { PushConsumer } from './push.consumer';
import { PushService } from './push.service';

/**
 * Encapsulates the push notification worker concerns.
 */
@Module({
  providers: [PushConsumer, PushService],
})
export class PushModule {}
