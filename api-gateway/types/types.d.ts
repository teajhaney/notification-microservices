declare interface JwtPayload {
  user_id: string;
  role: string;
}

declare interface JwtRequest extends Request {
  user: JwtPayload;
}

declare type ExtraHeaders =
  | Record<string, string>
  | ((req: UserRequest) => Record<string, string>);

declare interface ProxyOptions {
  extraHeaders?: ExtraHeaders;
}

declare interface UserRequest extends Request {
  user?: { userId: string };
  proxy?: (
    targetUrl: string,
    pathPrefix: string,
    addUserHeader?: boolean,
    options?: ProxyOptions,
  ) => ReturnType<typeof proxy>;
}

declare interface UserPreferences {
  email_opt_in: boolean;
  push_opt_in: boolean;
  daily_limit: number;
  language: string;
}

declare interface RenderedMessage {
  channel: 'EMAIL' | 'PUSH';
  subject?: string;
  html?: string;
  title?: string;
  body?: string;
}

declare interface NotificationStatus {
  id: string;
  userId: string;
  event: string;
  channels: NotificationChannel[];
  status: 'pending' | 'queued' | 'processing' | 'sent' | 'failed';
  createdAt: string;
  updatedAt: string;
}

declare interface ThrottlerStorageRecord {
  totalHits: number;
  timeToExpire: number;
  blockDuration: number;
  key: string;
  limit: number;
  isBlocked: boolean;
  timeToBlockExpire: number;
}

declare interface ProxyOptions {
  extraHeaders?:
    | Record<string, string>
    | ((req: UserRequest) => Record<string, string>);
}
