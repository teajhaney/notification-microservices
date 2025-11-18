/**
 * Notification Controller
 *
 * This controller handles HTTP requests for notifications.
 * It receives requests from the API Gateway and delegates to the NotificationService.
 *
 * IMPORTANT ARCHITECTURE NOTES:
 * - JWT token is ONLY used for authentication/authorization (checking admin role)

 *
 * Endpoints:
 * - POST /notifications - Create a new notification (admin only)
 *
 * The controller:
 * 1. Validates JWT token (JwtAuthGuard)
 * 2. Checks if user has admin role (required to send notifications)
 * 3. Validates the request body using DTOs
 * 4. Calls the NotificationService to process the notification
 * 5. Returns the response
 */
import {
  Body,
  Controller,
  ForbiddenException,
  Headers,
  Logger,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { NotificationService } from './notification.service';
import { CreateNotificationDto } from './dto/create-notification.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

/**
 * JWT Payload structure (set by API Gateway)
 */
interface JwtPayload {
  user_id: string;
  role: string;
}

/**
 * Request with user information (set by JwtAuthGuard)
 */
interface AuthenticatedRequest extends Request {
  user?: JwtPayload;
}

@Controller('notifications')
export class NotificationController {
  private readonly logger = new Logger(NotificationController.name);

  constructor(private readonly notificationService: NotificationService) {}

  /**
   * Create Notification Endpoint
   *
   * POST /notifications
   *
   * FLOW EXPLANATION:
   * 1. JWT Authentication: Validates the token (JwtAuthGuard)
   * 2. Authorization: Checks if user has 'admin' role (only admins can send notifications)
   * 3. Request Processing:
   *    - If userId is provided → send to that specific user
   *    - If userId is NOT provided → broadcast to ALL users in database
   * 4. Orchestrator fetches ALL users from user-service
   * 5. For each user, orchestrator:
   *    - Checks user preferences (email_opt_in, push_opt_in)
   *    - Fetches templates from template-service
   *    - Renders templates with provided data
   *    - Publishes messages to RabbitMQ queues (email.queue, push.queue)
   * 6. Email-service and Push-service consume from their queues and send notifications
   *
   * Request Headers:
   * - Authorization: Bearer <JWT_TOKEN> (required, must be admin)
   * - X-Correlation-ID: <correlation-id> (optional, for tracing)
   *
   * Request Body Examples:
   *
   * Broadcast to ALL users:
   * {
   *   "event": "WELCOME_MESSAGE",
   *   "data": { "firstName": "John", "email": "john@example.com" },
   *   "channels": ["EMAIL", "PUSH"],  // optional
   *   "language": "en"                 // optional
   * }
   *
   * Send to specific user:
   * {
   *   "userId": "user-123",
   *   "event": "WELCOME_MESSAGE",
   *   "data": { "firstName": "John" },
   *   "channels": ["EMAIL"],
   *   "language": "en"
   * }
   *
   * Response:
   * {
   *   "success": true,
   *   "data": {
   *     "notificationId": "uuid",
   *     "status": "queued",
   *     "channels": ["EMAIL", "PUSH"],
   *     "message": "Notification queued for 150 recipient(s)"
   *   }
   * }
   */
  @Post()
  @UseGuards(JwtAuthGuard)
  async createNotification(
    @Body() createDto: CreateNotificationDto,
    @Request() req: AuthenticatedRequest,
    @Headers('authorization') authHeader?: string,
    @Headers('x-correlation-id') correlationId?: string,
  ) {
    // STEP 1: Authorization Check
    // JWT token is ONLY used to verify admin role - it does NOT determine recipients
    if (req.user?.role !== 'admin') {
      throw new ForbiddenException(
        'Only administrators can send notifications '
      );
    }

    // Extract admin ID from JWT token (for logging/auditing purposes only)
    const adminId = req.user?.user_id;
    if (!adminId) {
      throw new Error('Admin identifier not found in JWT token');
    }

    // Extract JWT token to pass to user-service and template-service for authentication
    const authToken = authHeader?.replace('Bearer ', '');

    this.logger.log(
      `Admin ${adminId} requested notification. Event: ${createDto.event}, Target: ${createDto.userId ? `user ${createDto.userId}` : 'ALL USERS'}`,
    );

    // STEP 2: Process the notification
    // The service will:
    // - Fetch users (specific user or all users)
    // - Process each user's preferences
    // - Queue messages to RabbitMQ
    return await this.notificationService.createNotification(
      createDto,
      adminId, // Pass admin ID for logging/auditing
      authToken, // Pass token for calling user-service and template-service
      correlationId,
    );
  }
}
