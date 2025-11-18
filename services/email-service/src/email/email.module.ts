import { Module } from '@nestjs/common';
import { EmailConsumer } from './email.consumer';
import { EmailService } from './email.service';

/**
 * Email module wires the consumer to the delivery service.
 * Splitting concerns keeps the worker testable and easy to extend later.
 */
@Module({
  providers: [EmailConsumer, EmailService],
})
export class EmailModule {}
