/**
 * Template Service HTTP Client
 *
 * This service handles all HTTP communication with the template-service.
 * It's responsible for:
 * - Fetching templates by event, channel, and language
 * - Rendering templates with provided data
 *
 * Templates are stored in the template-service and contain:
 * - Subject (for emails)
 * - Title (for push notifications)
 * - Body (the main content)
 * - Variables (placeholders that get replaced with actual data)
 */
import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { AxiosError } from 'axios';

// Rendered message structure from template-service

export interface RenderedMessage {
  channel: 'EMAIL' | 'PUSH';
  subject?: string; // for email
  title?: string; // for push
  body: string;
  recipient?: {
    id: string;
    name: string;
    email: string;
    push_token?: unknown;
  };
  metadata?: {
    templateId: string;
    templateVersion: number;
  };
}

/**
 * Template structure from template-service
 */
export interface Template {
  id: string;
  name: string;
  event: string;
  channel: ('EMAIL' | 'PUSH')[];
  language: string;
  isActive: boolean;
  versions: Array<{
    id: string;
    version: number;
    subject?: string;
    title?: string;
    body: string;
    variables?: Record<string, unknown>;
  }>;
}

@Injectable()
export class TemplateServiceClient {
  private readonly logger = new Logger(TemplateServiceClient.name);
  private readonly baseUrl: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.baseUrl =
      this.configService.get<string>('templateServiceUrl') ||
      'http://localhost:3003';
  }

  /**
   * Fetch ALL templates for an event and language
   *
   * This calls: GET /template/event/:event?language=:language
   *
   * This is the NEW preferred method - it returns all templates for the event,
   * and channels are determined from the templates themselves (their channel arrays).
   * This way, you don't need to specify channels in the notification request.
   */
  async getAllTemplatesByEvent(
    event: string,
    language: string,
    authToken?: string,
  ): Promise<Template[]> {
    try {
      const url = `${this.baseUrl}/template/event/${event}?language=${language}`;

      const headers: Record<string, string> = {};
      if (authToken) {
        headers['Authorization'] = `Bearer ${authToken}`;
      }

      this.logger.debug(
        `Fetching all templates for event: ${event}, language: ${language}`,
      );

      const response = await firstValueFrom(
        this.httpService.get<{ success: boolean; data: Template[] }>(url, {
          headers,
        }),
      );

      const responseData = response.data as {
        success: boolean;
        data: Template[];
      };
      if (responseData.success && responseData.data) {
        this.logger.debug(
          `Found ${responseData.data.length} template(s) for ${event}/${language}`,
        );
        responseData.data.forEach((template) => {
          this.logger.debug(
            `Template ${template.id}: channels=${JSON.stringify(template.channel)}`,
          );
        });
        return responseData.data;
      }

      throw new HttpException('No templates found', HttpStatus.NOT_FOUND);
    } catch (error) {
      if (error instanceof AxiosError) {
        if (error.response?.status === 404) {
          this.logger.error(
            `No templates found for event: ${event}, language: ${language}`,
          );
          throw new HttpException(
            `No templates found for ${event}/${language}`,
            HttpStatus.NOT_FOUND,
          );
        }

        this.logger.error(
          `Failed to fetch templates: ${error.response?.status} - ${error.response?.statusText}`,
        );
        throw new HttpException(
          `Failed to fetch templates: ${error.response?.statusText}`,
          error.response?.status || HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }

      if (error instanceof HttpException) {
        throw error;
      }

      this.logger.error('Unexpected error fetching templates:', error);
      throw new HttpException(
        'Failed to fetch templates',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }


  /**
   * Render a template with provided data
   *
   * This calls: POST /template/:id/render
   *
   * IMPORTANT: The template ID goes in the URL path, not in the request body!
   *
   * The template-service will:
   * 1. Fetch the template by ID
   * 2. Replace variables in the template with actual data
   * 3. Return the rendered content (array, one per channel)
   *
   * @param channel - The channel we're processing (EMAIL or PUSH) - used to filter the response
   */
  async renderTemplate(
    templateId: string,
    data: Record<string, unknown>,
    recipient: {
      id: string;
      name: string;
      email: string;
      push_token?: unknown;
    },
    channel: 'EMAIL' | 'PUSH',
    authToken?: string,
  ): Promise<RenderedMessage> {
    try {
      // FIXED: Template ID goes in the URL path, not in the body
      const url = `${this.baseUrl}/template/${templateId}/render`;

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (authToken) {
        headers['Authorization'] = `Bearer ${authToken}`;
      }

      this.logger.debug(`Rendering template: ${templateId}`);

      const response = await firstValueFrom(
        this.httpService.post<{ success: boolean; data: RenderedMessage[] }>(
          url,
          {
            // Template service expects: { data, userId }
            // It resolves the user internally and returns rendered messages for all channels
            data,
            userId: recipient.id, // Pass user ID so template service can resolve the user
          },
          { headers },
        ),
      );

      const responseData = response.data as {
        success: boolean;
        data: RenderedMessage[];
      };

      if (
        responseData.success &&
        responseData.data &&
        responseData.data.length > 0
      ) {
        // Template service returns an array (one per channel the user is eligible for)
        // We need to find the one matching the channel we're processing
        const renderedMessage = responseData.data.find(
          (msg) => msg.channel === channel,
        );

        if (!renderedMessage) {
          this.logger.error(
            `Template service returned rendered messages but none for channel ${channel}. Available channels: ${responseData.data.map((m) => m.channel).join(', ')}`,
          );
          throw new HttpException(
            `No rendered message found for channel ${channel}`,
            HttpStatus.BAD_REQUEST,
          );
        }

        this.logger.debug(
          `Successfully rendered template ${templateId} for channel ${channel}`,
        );

        return renderedMessage;
      }

      throw new HttpException(
        'Failed to render template',
        HttpStatus.BAD_REQUEST,
      );
    } catch (error) {
      if (error instanceof AxiosError) {
        this.logger.error(
          `Failed to render template: ${error.response?.status} - ${error.response?.statusText}`,
        );
        throw new HttpException(
          `Failed to render template: ${error.response?.statusText}`,
          error.response?.status || HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }

      if (error instanceof HttpException) {
        throw error;
      }

      this.logger.error('Unexpected error rendering template:', error);
      throw new HttpException(
        'Failed to render template',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
