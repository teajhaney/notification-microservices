/**
 * Notification Service
 *
 * This is the CORE business logic of the orchestrator service.
 *
 * It orchestrates the entire notification flow:
 * 1. Validates the notification request
 * 2. Fetches user preferences from user-service
 * 3. Determines which channels to use (EMAIL, PUSH, or both)
 * 4. Fetches templates from template-service for each channel
 * 5. Renders templates with the provided data
 * 6. Publishes messages to RabbitMQ queues for email-service and push-service
 *
 * This service is the "brain" that coordinates all the pieces together.
 */
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import {
  NotificationMessage,
  RabbitMQService,
} from '../rabbitmq/rabbitmq.service';
import { User, UserServiceClient } from '../http-clients/user-service.client';
import {
  TemplateServiceClient,
  Template,
} from '../http-clients/template-service.client';
import {
  CreateNotificationDto,
  NotificationChannel,
} from './dto/create-notification.dto';

// Response structure for creating a notification

export interface NotificationResponse {
  notificationId: string;
  status: 'queued';
  channels: NotificationChannel[];
  message: string;
}

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    private readonly rabbitMQService: RabbitMQService,
    private readonly userServiceClient: UserServiceClient,
    private readonly templateServiceClient: TemplateServiceClient,
  ) {}

  /**
   * Process a notification request
   *
   * This is the main entry point for creating notifications.
   */
  async createNotification(
    createDto: CreateNotificationDto,
    initiatorId: string,
    authToken?: string,
    correlationId?: string,
  ): Promise<NotificationResponse> {
    // Step 1: Generate unique notification ID
    const notificationId = uuidv4();
    this.logger.log(
      `Processing notification request ${notificationId} initiated by admin`,
    );

    try {
      // Step 2: Resolve the audience (targeted user or full user base)
      // If userId is provided → send to that user
      // If userId is NOT provided → broadcast to ALL users
      const targetUsers = await this.resolveTargetUsers(
        createDto.userId,
        authToken,
      );

      this.logger.debug(
        `Resolved ${targetUsers.length} target user(s) for notification`,
      );

      if (targetUsers.length === 0) {
        this.logger.error(
          'No recipients found. Possible reasons: no users in database, user not found by ID/email, or user-service unavailable',
        );
        throw new NotFoundException(
          'No recipients found for this notification request',
        );
      }

      // Step 3: Fetch ALL templates for this event/language
      // NEW APPROACH: Channels are determined from templates, not from request
      // This means we don't need to specify channels - templates tell us what channels are available
      const defaultLanguage = createDto.language || 'en';
      this.logger.log(
        `Fetching all templates for event: ${createDto.event}, language: ${defaultLanguage}`,
      );

      const allTemplates =
        await this.templateServiceClient.getAllTemplatesByEvent(
          createDto.event,
          defaultLanguage,
          authToken,
        );

      if (allTemplates.length === 0) {
        throw new NotFoundException(
          `No templates found for event: ${createDto.event}, language: ${defaultLanguage}`,
        );
      }

      // Extract all available channels from templates
      // A template can have channel: [EMAIL], [PUSH], or [EMAIL, PUSH]
      const availableChannels = new Set<NotificationChannel>();
      for (const template of allTemplates) {
        for (const channel of template.channel) {
          availableChannels.add(channel as NotificationChannel);
        }
      }

      this.logger.log(
        `Found ${allTemplates.length} template(s) with channels: ${[...availableChannels].join(', ')}`,
      );

      // Step 4: Iterate through all recipients and respect their preferences
      const processedChannels = new Set<NotificationChannel>();
      let recipientsWithDeliveries = 0;
      let usersSkippedNoPreferences = 0;
      let usersSkippedOptedOut = 0;
      let usersFailedProcessing = 0;

      this.logger.debug(
        `Processing notification for ${targetUsers.length} recipient(s)`,
      );

      for (const user of targetUsers) {
        this.logger.debug(
          `Processing notification for user ${user.id} (${user.email})`,
        );

        if (!user.preferences) {
          // This warning prevents the job from crashing when a user has no saved preferences yet
          this.logger.warn(
            `Skipping user ${user.id} (${user.email}) because notification preferences are missing`,
          );
          usersSkippedNoPreferences += 1;
          continue;
        }

        // Determine which channels to use:
        // 1. Start with available channels from templates
        // 2. Filter by user preferences (respect opt-outs)
        // 3. Filter by requested channels (if provided in request)
        const channels = this.determineChannelsFromTemplates(
          [...availableChannels],
          createDto.channels, // Optional: filter by requested channels
          user.preferences,
        );

        if (channels.length === 0) {
          // Respect opt-outs and inform logs for easier debugging
          this.logger.debug(
            `Skipping user ${user.id} (${user.email}) because no channels are available/opted in. Available: ${[...availableChannels].join(', ')}, Preferences: email_opt_in=${user.preferences.email_opt_in}, push_opt_in=${user.preferences.push_opt_in}`,
          );
          usersSkippedOptedOut += 1;
          continue;
        }

        this.logger.debug(
          `User ${user.id} will receive notifications via: ${channels.join(', ')}`,
        );

        const language =
          createDto.language || user.preferences.language || 'en';
        let userHasSuccessfulChannel = false;

        // Process each channel
        // For each channel, find the template that supports it and process
        for (const channel of channels) {
          try {
            this.logger.debug(
              `Attempting to queue ${channel} notification for user ${user.id} (${user.email})`,
            );

            // Find template that supports this channel
            const template = allTemplates.find((t) =>
              t.channel.includes(channel as 'EMAIL' | 'PUSH'),
            );

            if (!template) {
              throw new Error(
                `No template found for channel ${channel} (this should not happen)`,
              );
            }

            await this.processChannelWithTemplate(
              notificationId,
              user.id,
              channel,
              template,
              createDto.data,
              user,
              language,
              authToken,
              correlationId || notificationId,
            );

            // Success - mark this channel as processed
            processedChannels.add(channel);
            userHasSuccessfulChannel = true;
            this.logger.log(
              `✅ Successfully queued ${channel} notification for user ${user.id} (${user.email})`,
            );
          } catch (error) {
            // Log error but continue with other channels/recipients to keep the broadcast flowing
            // This allows EMAIL to fail but PUSH to succeed (or vice versa)
            const errorMessage =
              error instanceof Error ? error.message : 'Unknown error';
            this.logger.error(
              `❌ Failed to process ${channel} notification for user ${user.id} (${user.email}): ${errorMessage}`,
              error instanceof Error ? error.stack : undefined,
            );
            usersFailedProcessing += 1;

            // Log what channels are still being processed
            const remainingChannels = channels.filter((c) => c !== channel);
            if (remainingChannels.length > 0) {
              this.logger.debug(
                `Continuing with remaining channels: ${remainingChannels.join(', ')}`,
              );
            }
          }
        }

        if (userHasSuccessfulChannel) {
          recipientsWithDeliveries += 1;
        }
      }

      // Provide detailed error message if no recipients were processed
      if (recipientsWithDeliveries === 0 || processedChannels.size === 0) {
        const errorDetails = [
          `Total users processed: ${targetUsers.length}`,
          `Users skipped (no preferences): ${usersSkippedNoPreferences}`,
          `Users skipped (opted out): ${usersSkippedOptedOut}`,
          `Users failed processing: ${usersFailedProcessing}`,
          `Users successfully processed: ${recipientsWithDeliveries}`,
          `Channels processed: ${[...processedChannels].join(', ') || 'none'}`,
        ].join('; ');

        this.logger.error(
          `Failed to process notification for any recipient. ${errorDetails}`,
        );

        throw new BadRequestException(
          `Failed to process notification for any recipient. ${errorDetails}`,
        );
      }

      this.logger.log(
        `✅ Notification ${notificationId} queued for ${recipientsWithDeliveries} recipient(s) across channels: ${[
          ...processedChannels,
        ].join(', ')}`,
      );

      return {
        notificationId,
        status: 'queued',
        channels: [...processedChannels],
        message: `Notification queued for ${recipientsWithDeliveries} recipient(s)`,
      };
    } catch (error) {
      this.logger.error(
        `Failed to create notification ${notificationId}: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      throw error;
    }
  }

  /**
   * Determine which notification channels to use based on templates and user preferences
   *
   * NEW APPROACH: Channels come from templates, not from the request!
   *
   * Rules:
   * 1. Start with available channels from templates (what templates support)
   * 2. Filter by user preferences (respect opt-outs)
   * 3. If channels specified in request, further filter to only those (but still respect opt-ins)
   *
   * Example:
   * - Templates have: [EMAIL, PUSH] available
   * - User has: email_opt_in: true, push_opt_in: true
   * - Request specifies: ["EMAIL"] (optional)
   * - Result: [EMAIL] (only EMAIL because it's requested AND user opted in)
   *
   * Another example:
   * - Templates have: [EMAIL, PUSH] available
   * - User has: email_opt_in: false, push_opt_in: true
   * - Request specifies: ["EMAIL", "PUSH"]
   * - Result: [PUSH] (EMAIL filtered out because user opted out)
   */
  private determineChannelsFromTemplates(
    availableChannels: NotificationChannel[],
    requestedChannels: NotificationChannel[] | undefined,
    preference: { email_opt_in: boolean; push_opt_in: boolean },
  ): NotificationChannel[] {
    this.logger.debug(
      `Available channels from templates: ${availableChannels.join(', ')}, Requested: ${requestedChannels?.join(', ') || 'all'}, User preferences: email_opt_in=${preference.email_opt_in}, push_opt_in=${preference.push_opt_in}`,
    );

    // Step 1: Start with available channels (from templates)
    let channelsToUse = [...availableChannels];

    // Step 2: If channels specified in request, filter to only those
    if (requestedChannels && requestedChannels.length > 0) {
      channelsToUse = channelsToUse.filter((channel) =>
        requestedChannels.includes(channel),
      );
      this.logger.debug(
        `After filtering by requested channels: ${channelsToUse.join(', ') || 'none'}`,
      );
    }

    // Step 3: Filter by user preferences (respect opt-outs)
    const filteredChannels = channelsToUse.filter((channel) => {
      if (channel === NotificationChannel.EMAIL) {
        const allowed = preference.email_opt_in;
        if (!allowed) {
          this.logger.debug(
            `Filtering out EMAIL channel - user has email_opt_in: false`,
          );
        }
        return allowed;
      }
      if (channel === NotificationChannel.PUSH) {
        const allowed = preference.push_opt_in;
        if (!allowed) {
          this.logger.debug(
            `Filtering out PUSH channel - user has push_opt_in: false`,
          );
        }
        return allowed;
      }
      return false;
    });

    this.logger.debug(
      `Final channels after filtering: ${filteredChannels.join(', ') || 'none'}`,
    );

    return filteredChannels;
  }

  /**


  /**
   * Load the final recipient list for this notification request.
   *
   * RECIPIENT SELECTION LOGIC:
   * - If userId is provided → send to that ONE user only (if role=user)
   * - If userId is NOT provided → broadcast to ALL users with role=user (excludes admins)
   *
   * IMPORTANT: We only send notifications to users with role='user', NOT to admins.
   * Admin users (role='admin') are excluded from receiving notifications.
   *
   * NOTE: The email in the 'data' field is just template data (e.g., {{firstName}}),
   *       it does NOT determine who receives the notification.
   *       We broadcast to ALL regular users, and each user's template will use their own data.
   */
  private async resolveTargetUsers(
    requestedUserId: string | undefined,
    authToken?: string,
  ): Promise<User[]> {
    // CASE 1: Specific user targeted (userId provided in request)
    if (requestedUserId) {
      this.logger.debug(`Targeting specific user: ${requestedUserId}`);
      const user = await this.userServiceClient.getUserWithPreferences(
        requestedUserId,
        authToken,
      );
      if (!user) {
        this.logger.warn(`User not found with ID: ${requestedUserId}`);
        return [];
      }

      // Filter out admin users - only send to regular users
      if (user.role === 'admin') {
        this.logger.warn(
          `Skipping user ${user.id} (${user.email}) - admin users do not receive notifications`,
        );
        return [];
      }

      this.logger.debug(
        `Found user: ${user.email} (${user.id}), role: ${user.role}`,
      );
      return [user];
    }

    // CASE 2: Broadcast to ALL users (no userId provided)
    // IMPORTANT: Filter out admin users - only send to users with role='user'
    this.logger.log(
      'No userId provided - broadcasting to ALL users with role=user (excluding admins)',
    );
    const allUsers =
      await this.userServiceClient.getAllUsersWithPreferences(authToken);

    // Filter out admin users - only send notifications to regular users
    const regularUsers = allUsers.filter((user) => user.role !== 'admin');
    const adminCount = allUsers.length - regularUsers.length;

    if (adminCount > 0) {
      this.logger.debug(
        `Filtered out ${adminCount} admin user(s) - only sending to ${regularUsers.length} regular user(s)`,
      );
    }

    this.logger.log(
      `Found ${regularUsers.length} regular user(s) to notify (${adminCount} admin(s) excluded)`,
    );

    return regularUsers;
  }

  /**
   * Process a single notification channel using a specific template
   *
   * NEW APPROACH: Template is passed in (already fetched), so we don't need to fetch it again.
   *
   * This method:
   * 1. Renders the template with the provided data
   * 2. Creates a message for RabbitMQ
   * 3. Publishes to the appropriate queue
   *
   * @param template - The template to use (already fetched, includes channel array)
   */
  private async processChannelWithTemplate(
    notificationId: string,
    userId: string,
    channel: NotificationChannel,
    template: Template,
    data: Record<string, unknown>,
    user: User,
    language: string,
    authToken?: string,
    correlationId?: string,
  ): Promise<void> {
    this.logger.debug(
      `Processing ${channel} notification for user ${userId} using template ${template.id}`,
    );

    // Step 1: Validate push token if needed
    if (
      channel === NotificationChannel.PUSH &&
      (!user.push_token || typeof user.push_token !== 'object')
    ) {
      // Skip push attempts without a valid subscription payload
      this.logger.warn(
        `Skipping push notification for user ${user.id} because no push token is registered`,
      );
      return;
    }

    // Step 2: Render template
    // The template-service will replace variables in the template with actual data
    this.logger.debug(
      `Rendering template ${template.id} with data: ${JSON.stringify(data)}`,
    );
    
    const rendered = await this.templateServiceClient.renderTemplate(
      template.id,
      data,
      {
        id: userId,
        name: user.name || user.email.split('@')[0],
        email: user.email,
        push_token: user.push_token || undefined,
      },
      channel as 'EMAIL' | 'PUSH', // Pass channel so we can filter the response
      authToken,
    );
    
    this.logger.debug(
      `Rendered template result - Subject: "${rendered.subject}", Body length: ${rendered.html?.length || rendered.body?.length || 0}`,
    );

    // Step 3: Build RabbitMQ message
    // This is what email-service and push-service will receive
    // IMPORTANT: Template service returns 'html' for EMAIL and 'body' for PUSH
    // We need to extract the correct field based on channel
    const messageBody =
      channel === NotificationChannel.EMAIL
        ? rendered.html || rendered.body || ''
        : rendered.body || '';

    if (!messageBody) {
      this.logger.error(
        `No body content found in rendered template for channel ${channel}. Rendered message: ${JSON.stringify(rendered)}`,
      );
      throw new Error(
        `Template rendering failed: no body content for channel ${channel}`,
      );
    }

    const message: NotificationMessage = {
      notificationId,
      userId,
      event: template.event,
      channel,
      recipient: {
        email: channel === NotificationChannel.EMAIL ? user.email : undefined,
        pushToken:
          channel === NotificationChannel.PUSH
            ? user.push_token || undefined
            : undefined,
      },
      content: {
        subject: rendered.subject,
        title: rendered.title,
        body: messageBody, // Use html for EMAIL, body for PUSH
      },
      metadata: {
        language,
        templateId: template.id,
        correlationId: correlationId || notificationId,
      },
    };

    this.logger.debug(
      `Built message for ${channel} - Body length: ${messageBody.length} characters`,
    );

    // Step 4: Publish to appropriate queue
    if (channel === NotificationChannel.EMAIL) {
      await this.rabbitMQService.publishEmailNotification(message);
    } else if (channel === NotificationChannel.PUSH) {
      await this.rabbitMQService.publishPushNotification(message);
    }
  }
}
