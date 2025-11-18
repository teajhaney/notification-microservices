/**
 * Matches the payload emitted by the orchestrator queue publisher.
 */
export interface NotificationMessage {
  notificationId: string;
  userId: string;
  event: string;
  channel: 'EMAIL' | 'PUSH';
  recipient: {
    email?: string;
    pushToken?: WebPushSubscription | null;
  };
  content: {
    subject?: string;
    title?: string;
    body: string;
  };
  metadata: {
    correlationId: string;
    language: string;
    templateId: string;
  };
}

/**
 * Shape of the push subscription saved in the user-service.
 */
export interface WebPushSubscription {
  endpoint: string;
  keys: {
    auth: string;
    p256dh: string;
  };
}
