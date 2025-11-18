/**
 * Response Interceptors and Exception Filters
 *
 * These provide consistent response formatting across the service:
 * - ResponseInterceptor: Wraps all successful responses in a standard format
 * - HttpExceptionFilter: Catches and formats all errors consistently
 *
 * This ensures the API Gateway and clients always receive predictable response structures.
 */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
} from '@nestjs/common';
import { Observable, map } from 'rxjs';

/**
 * Response Interceptor
 *
 * Automatically wraps all successful responses in this format:
 * {
 *   success: true,
 *   data: <response data>,
 *   message: "Request successful",
 *   meta: {}
 * }
 */
@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler<T>): Observable<any> {
    return next.handle().pipe(
      map((data: any) => {
        // If the handler already returns a standard response, don't re-wrap
        if (data?.success !== undefined) return data;

        // If response contains meta (pagination)
        if (data?.meta) {
          return {
            success: true,
            data: data.data ?? {},
            message: data.message ?? 'Request successful',
            meta: data.meta,
          };
        }

        // Default response for non-paginated requests
        return {
          success: true,
          data,
          message: 'Request successful',
          meta: {},
        };
      }),
    );
  }
}

/**
 * Exception Filter
 *
 * Catches all exceptions and formats them consistently:
 * {
 *   success: false,
 *   error: <error message>,
 *   message: <error message>,
 *   data: {},
 *   meta: {}
 * }
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: any, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();

    const status =
      exception instanceof HttpException ? exception.getStatus() : 500;

    const message =
      exception instanceof HttpException
        ? exception.getResponse()['message'] || exception.message
        : 'Internal server error';

    response.status(status).json({
      success: false,
      error: message,
      message,
      data: {},
      meta: {},
    });
  }
}
