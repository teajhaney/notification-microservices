/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { NotificationMessage } from '../common/notification-message.interface';

/**
 * Handles actual SMTP delivery using Nodemailer.
 * This service is intentionally stateless so the consumer can call it per message.
 */
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly transporter: Transporter<unknown>;
  private readonly fromAddress: string;

  constructor(private readonly configService: ConfigService) {
    this.transporter = this.buildTransporter();
    const fromName: string =
      this.configService.get<string>('smtp.fromName') || 'Notification Bot';
    const fromEmail: string | undefined =
      this.configService.get<string>('smtp.fromEmail') ||
      this.configService.get<string>('smtp.user');
    if (!fromEmail) {
      throw new Error(
        'SMTP_FROM_EMAIL or SMTP_USER must be configured for email-service',
      );
    }
    this.fromAddress = `${fromName} <${fromEmail}>`;
  }

  /**
   * Build a Nodemailer transporter from environment variables.
   * Keeping it in a helper keeps the constructor clean and more testable.
   */
  private buildTransporter(): Transporter<unknown> {
    const host = this.configService.get<string>('smtp.host');
    const portValue = this.configService.get<string>('smtp.port');
    const port = portValue ? Number(portValue) : undefined;
    const user = this.configService.get<string>('smtp.user');
    const pass = this.configService.get<string>('smtp.pass');

    if (!host || port === undefined || Number.isNaN(port) || !user || !pass) {
      const missing: string[] = [];
      if (!host) missing.push('SMTP_HOST');
      if (port === undefined || Number.isNaN(port)) missing.push('SMTP_PORT');
      if (!user) missing.push('SMTP_USER');
      if (!pass) missing.push('SMTP_PASS');

      throw new Error(
        `SMTP credentials are not fully configured. Missing: ${missing.join(', ')}`,
      );
    }

    const resolvedPort = port;
    const secure =
      this.configService.get<string>('smtp.secure') === 'true' ||
      resolvedPort === 465;

    this.logger.log(
      `📧 SMTP configured: ${host}:${resolvedPort} (secure: ${secure})`,
    );

    return nodemailer.createTransport({
      auth: {
        pass,
        user,
      },
      host,
      port: resolvedPort,
      secure,
    });
  }

  /**
   * Actually send the email using the transporter constructed above.
   */
  async sendEmail(message: NotificationMessage): Promise<void> {
    if (!message.recipient.email) {
      this.logger.warn(
        `Skipping email for notification ${message.notificationId} because recipient email is missing`,
      );
      return;
    }

    // Validate that body content exists
    if (!message.content.body || message.content.body.trim() === '') {
      this.logger.error(
        `Cannot send email for notification ${message.notificationId} - body content is empty or missing`,
      );
      throw new Error(
        `Email body is empty for notification ${message.notificationId}`,
      );
    }

    const emailBody = message.content.body;
    const emailSubject = message.content.subject ?? 'Notification';

    this.logger.debug(
      `Preparing to send email - Subject: "${emailSubject}", Body length: ${emailBody.length} characters`,
    );

    // Determine if body contains HTML (simple check for HTML tags)
    const containsHtml = /<[a-z][\s\S]*>/i.test(emailBody);

    // Build email options - support both text and HTML
    const mailOptions: {
      from: string;
      subject: string;
      to: string;
      text?: string;
      html?: string;
    } = {
      from: this.fromAddress,
      subject: emailSubject,
      to: message.recipient.email,
    };

    if (containsHtml) {
      // If HTML detected, use html field (email clients will render HTML)
      mailOptions.html = emailBody;
      this.logger.debug('Email body contains HTML - using html field');
    } else {
      // Plain text - use text field
      mailOptions.text = emailBody;
      this.logger.debug('Email body is plain text - using text field');
    }

    try {
      await this.transporter.sendMail(mailOptions);

      this.logger.log(
        `✅ Email sent for notification ${message.notificationId} to ${message.recipient.email} (subject: "${emailSubject}")`,
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';

      // Provide helpful error messages for common SMTP issues
      if (errorMessage.includes('ENOTFOUND')) {
        this.logger.error(
          `❌ DNS lookup failed for SMTP host. Check your SMTP_HOST configuration. Error: ${errorMessage}`,
        );
      } else if (errorMessage.includes('EAUTH')) {
        this.logger.error(
          `❌ SMTP authentication failed. Check your SMTP_USER and SMTP_PASS credentials.`,
        );
      } else {
        this.logger.error(
          `❌ Failed to send email to ${message.recipient.email}: ${errorMessage}`,
        );
      }

      throw error; // Re-throw so consumer can handle it
    }
  }
}
