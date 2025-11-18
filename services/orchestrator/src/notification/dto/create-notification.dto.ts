/**
 * Data Transfer Objects (DTOs) for Notification Requests
 *
 * DTOs define the structure and validation rules for incoming requests.
 * They ensure:
 * - Type safety (TypeScript knows what fields exist)
 * - Validation (class-validator checks data before processing)
 * - Documentation (clear contract for API consumers)
 */
import {
  IsString,
  IsOptional,
  IsArray,
  IsEnum,
  IsObject,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Notification channel enum
 * Defines the types of notifications we support
 */
export enum NotificationChannel {
  EMAIL = 'EMAIL',
  PUSH = 'PUSH',
}

/**
 * Create Notification DTO
 *
 * This is what the API Gateway sends to the orchestrator when creating a notification.
 *
 * Example request:
 * {
 *   "userId": "user-123",           // Optional, can use JWT user_id
 *   "event": "WELCOME_MESSAGE",     // Required: the event type
 *   "data": {                        // Required: data to inject into template
 *     "name": "John Doe",
 *     "orderId": "12345"
 *   },
 *   "channels": ["EMAIL", "PUSH"],   // Optional: defaults to user preferences
 *   "language": "en"                 // Optional: defaults to user preference or "en"
 * }
 */
export class CreateNotificationDto {
  /**
   * User ID - Optional because we can extract it from JWT token
   * If not provided, we'll use the user_id from the authenticated token
   */
  @IsOptional()
  @IsString()
  userId?: string;

  /**
   * Event type - Required
   * Examples: "WELCOME_MESSAGE", "ORDER_CONFIRMATION", "PASSWORD_RESET"
   * This determines which template to use
   */
  @IsString()
  event!: string;

  /**
   * Template data - Required
   * This object contains the variables that will be injected into the template
   * Example: { name: "John", orderId: "123" }
   */
  @IsObject()
  data!: Record<string, unknown>;

  /**
   * Notification channels - Optional
   * If not provided, we'll use the user's preferences (email_opt_in, push_opt_in)
   * If provided, we'll still respect user preferences (won't send if opted out)
   */
  @IsOptional()
  @IsArray()
  @IsEnum(NotificationChannel, { each: true })
  channels?: NotificationChannel[];

  /**
   * Language code - Optional
   * Defaults to user's preference or "en"
   * Examples: "en", "fr", "es"
   */
  @IsOptional()
  @IsString()
  language?: string;
}
