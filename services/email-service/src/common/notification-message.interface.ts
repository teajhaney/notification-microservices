/**
 * Shared shape for messages coming from the orchestrator.
 * Keeping this contract in one place helps the consumer and sender stay in sync.
 */
export interface NotificationMessage {
  notificationId: string;
  userId: string;
  event: string;
  channel: 'EMAIL' | 'PUSH';
  recipient: {
    email?: string;
    pushToken?: unknown;
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
