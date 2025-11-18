/**
 * JWT Authentication Guard
 *
 * This guard protects routes that require authentication.
 * It validates JWT tokens and extracts user information.
 *
 * The API Gateway already validates the token, but we validate it again here
 * for security (defense in depth).
 */
import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

/**
 * JWT Payload structure
 */
interface JwtPayload {
  user_id: string;
  role: string;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  private readonly logger = new Logger(JwtAuthGuard.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Validate JWT token and set user in request
   *
   * This method:
   * 1. Extracts token from Authorization header
   * 2. Validates the token signature and expiration
   * 3. Sets req.user with the decoded payload
   * 4. Returns true if valid, throws exception if invalid
   */
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers['authorization'];

    if (!authHeader) {
      throw new UnauthorizedException('Authorization header missing');
    }

    // Extract token from "Bearer <token>"
    const token = authHeader.replace('Bearer ', '');

    if (!token) {
      throw new UnauthorizedException('Token missing');
    }

    try {
      // Get JWT secret from configuration
      const secret = this.configService.get<string>('jwtSecret');

      // Verify and decode the token
      const payload = this.jwtService.verify<JwtPayload>(token, {
        secret,
      });

      // Set user in request object for use in controllers
      request.user = payload;

      return true;
    } catch (error) {
      this.logger.warn(
        `JWT validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      throw new UnauthorizedException('Invalid or expired token');
    }
  }
}
