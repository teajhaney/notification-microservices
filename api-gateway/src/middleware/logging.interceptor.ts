import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Inject,
  type LoggerService,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { throwError } from 'rxjs';

/**
 * Logging Interceptor with Winston
 *
 * This interceptor automatically logs all HTTP requests and responses.
 * It uses Winston logger for more powerful logging capabilities.
 *
 * How it works:
 * 1. Injects Winston logger using WINSTON_MODULE_NEST_PROVIDER
 * 2. Logs incoming requests (method, URL, body)
 * 3. Logs outgoing responses (status code, timing)
 * 4. Can log errors if request fails
 *
 * Benefits of Winston:
 * - Logs are written to files automatically
 * - Structured logging (JSON format in files)
 * - Different log levels for different purposes
 * - Can log to multiple destinations
 */
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  // Inject Winston logger instead of using built-in Logger
  constructor(
    @Inject(WINSTON_MODULE_NEST_PROVIDER)
    private readonly logger: LoggerService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const req = context
      .switchToHttp()
      .getRequest<{ method?: string; url?: string; body?: unknown }>();
    const method = req?.method ?? 'UNKNOWN_METHOD';
    const url = req?.url ?? 'UNKNOWN_URL';
    const body = req?.body ?? {};

    // Record start time for calculating request duration
    const startTime = Date.now();

    // Log incoming request
    // Using 'http' level for HTTP request logs (you can also use 'log' or 'info')
    this.logger.log(
      `→ Incoming Request: ${method} ${url}`,
      LoggingInterceptor.name,
    );

    // Log request body (sanitize sensitive data in production!)
    // In production, you might want to exclude passwords, tokens, etc.
    if (Object.keys(body).length > 0 && this.logger.debug) {
      this.logger.debug(
        `Request Body: ${JSON.stringify(body)}`,
        LoggingInterceptor.name,
      );
    }

    return next.handle().pipe(
      // Log successful response
      tap(() => {
        const res = context
          .switchToHttp()
          .getResponse<{ statusCode?: number }>();
        const duration = Date.now() - startTime;
        const statusCode = res?.statusCode ?? 'UNKNOWN';

        this.logger.log(
          `← Response: ${method} ${url} - Status: ${statusCode} - Duration: ${duration}ms`,
          LoggingInterceptor.name,
        );
      }),

      // Log errors if request fails
      catchError((error: unknown) => {
        const duration = Date.now() - startTime;
        const res = context
          .switchToHttp()
          .getResponse<{ statusCode?: number }>();

        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';
        const errorStack = error instanceof Error ? error.stack : undefined;

        this.logger.error(
          `✗ Error: ${method} ${url} - Status: ${res?.statusCode ?? 'UNKNOWN'} - Duration: ${duration}ms - Error: ${errorMessage}`,
          errorStack,
          LoggingInterceptor.name,
        );

        // Re-throw error so error handlers can process it
        return throwError(() => error);
      }),
    );
  }
}
