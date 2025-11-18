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
   */
  private configureVapid(): void {
    const subject =
      this.configService.get<string>('vapid.subject') ||
      'mailto:notifications@example.com';
    const publicKey = this.configService.get<string>('vapid.publicKey');
    const privateKey = this.configService.get<string>('vapid.privateKey');

    if (!publicKey || !privateKey) {
      throw new Error('VAPID keys are not configured for push-service');
    }

    webpush.setVapidDetails(subject, publicKey, privateKey);
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
