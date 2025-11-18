import { HttpStatus } from '@nestjs/common';
/**
 * HTTP Clients Module
 *
 * This module provides HTTP clients for communicating with external services.
 * We use @nestjs/axios which provides:
 * - HTTP client with interceptors
 * - Request/response transformation
 * - Error handling
 */
import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';

import { UserServiceClient } from './user-service.client';
import { TemplateServiceClient } from './template-service.client';

@Module({
  imports: [HttpModule],
  providers: [UserServiceClient, TemplateServiceClient],
  exports: [UserServiceClient, TemplateServiceClient],
})
export class HttpClientsModule {}
