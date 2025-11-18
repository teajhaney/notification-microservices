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
      throw new Error('SMTP credentials are not fully configured');
    }

    const resolvedPort = port;
    const secure =
      this.configService.get<string>('smtp.secure') === 'true' ||
      resolvedPort === 465;

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

    await this.transporter.sendMail({
      from: this.fromAddress,
      subject: message.content.subject ?? 'Notification',
      text: message.content.body,
      to: message.recipient.email,
    });

    this.logger.log(
      `Email sent for notification ${message.notificationId} to ${message.recipient.email}`,
    );
  }
}
