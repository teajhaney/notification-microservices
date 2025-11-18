/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as webpush from 'web-push';
import {
  NotificationMessage,
  WebPushSubscription,
} from '../common/notification-message.interface';

/**
 * Wraps the `web-push` library so the consumer only has to pass queue payloads.
 */
@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);

  constructor(private readonly configService: ConfigService) {
    this.configureVapid();
  }

  /**
   * Configure VAPID keys up-front so every send call is lean.
   *
   * VAPID (Voluntary Application Server Identification) keys are required for Web Push.
   * Generate them using: npx web-push generate-vapid-keys
   */
  private configureVapid(): void {
    const subject =
      this.configService.get<string>('vapid.subject') ||
      'mailto:notifications@example.com';
    const publicKey = this.configService.get<string>('vapid.publicKey');
    const privateKey = this.configService.get<string>('vapid.privateKey');

    if (!publicKey || !privateKey) {
      const missing: string[] = [];
      if (!publicKey) missing.push('VAPID_PUBLIC_KEY');
      if (!privateKey) missing.push('VAPID_PRIVATE_KEY');

      this.logger.error(
        `❌ VAPID keys are not configured. Missing: ${missing.join(', ')}`,
      );
      this.logger.error(
        '📝 To generate VAPID keys, run: npx web-push generate-vapid-keys',
      );
      this.logger.error('📚 See README.md for detailed setup instructions');
      throw new Error(
        `VAPID keys are not configured for push-service. Missing: ${missing.join(', ')}. Run 'npx web-push generate-vapid-keys' to generate them.`,
      );
    }

    webpush.setVapidDetails(subject, publicKey, privateKey);
    this.logger.log(
      `✅ VAPID keys configured successfully (subject: ${subject})`,
    );
  }

  /**
   * Send a push notification using the Web Push protocol.
   */
  async sendPush(message: NotificationMessage): Promise<void> {
    const subscriptionCandidate = message.recipient.pushToken;

    if (!this.isValidSubscription(subscriptionCandidate)) {
      this.logger.warn(
        `Skipping push for notification ${message.notificationId} because the user has no subscription`,
      );
      return;
    }
    const subscription = subscriptionCandidate;

    const payload = JSON.stringify({
      body: message.content.body,
      data: {
        correlationId: message.metadata.correlationId,
        event: message.event,
        notificationId: message.notificationId,
      },
      title: message.content.title ?? 'Notification',
    });

    await webpush.sendNotification(subscription, payload);
    this.logger.log(
      `Push sent for notification ${message.notificationId} to ${subscription.endpoint}`,
    );
  }

  private isValidSubscription(value: unknown): value is WebPushSubscription {
    if (
      !value ||
      typeof value !== 'object' ||
      value === null ||
      typeof (value as WebPushSubscription).endpoint !== 'string'
    ) {
      return false;
    }

    const keys = (value as WebPushSubscription).keys;
    return (
      !!keys && typeof keys.auth === 'string' && typeof keys.p256dh === 'string'
    );
  }
}
