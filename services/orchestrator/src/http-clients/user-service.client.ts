/**
 * User Service HTTP Client
 *
 * This service handles all HTTP communication with the user-service.
 * It's responsible for:
 * - Fetching user preferences (email_opt_in, push_opt_in, language, etc.)
 * - Fetching user details (email, push_token, etc.)
 */
import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { AxiosError } from 'axios';

//User preference structure from user-service

export interface UserPreference {
  id: string;
  user_id: string;
  email_opt_in: boolean;
  push_opt_in: boolean;
  daily_limit: number;
  language: string;
  created_at: string;
  updated_at: string;
}

// User structure from user-service

export interface User {
  id: string;
  name: string;
  email: string;
  role: string; // 'user' or 'admin' - used to filter out admin users from notifications
  push_token: unknown | null;
  preferences: UserPreference | null;
}

//Pagination metadata returned by user-service when listing users.

interface PaginationMeta {
  has_next: boolean;
  has_previous: boolean;
  limit: number;
  page: number;
  total: number;
  total_pages: number;
}

/**
 * Paginated payload structure used by the `/user` endpoint.
 */
interface PaginatedUserResponse {
  data: User[];
  meta: PaginationMeta;
}

@Injectable()
export class UserServiceClient {
  private readonly logger = new Logger(UserServiceClient.name);
  private readonly baseUrl: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    // Get user-service URL from configuration
    this.baseUrl =
      this.configService.get<string>('userServiceUrl') ||
      'http://localhost:3001';
  }

  /**
   * Fetch user preferences by user ID
   * This calls: GET /user/preferences/:userId
   */
  async getUserPreference(
    userId: string,
    authToken?: string,
  ): Promise<UserPreference | null> {
    try {
      const url = `${this.baseUrl}/user/preferences/${userId}`;

      // Set up headers with authentication token if provided
      const headers: Record<string, string> = {};
      if (authToken) {
        headers['Authorization'] = `Bearer ${authToken}`;
      }

      this.logger.debug(`Fetching user preferences for user`);

      // Make HTTP GET request
      const response = await firstValueFrom(
        this.httpService.get<{ success: boolean; data: UserPreference }>(url, {
          headers,
        }),
      );

      // Extract data from response (user-service wraps in { success, data })
      const responseData = response.data as {
        success: boolean;
        data: UserPreference;
      };
      if (responseData.success && responseData.data) {
        return responseData.data;
      }

      return null;
    } catch (error) {
      // Handle Axios errors (network errors, HTTP errors, etc.)
      if (error instanceof AxiosError) {
        if (error.response?.status === 404) {
          // User not found or no preferences
          this.logger.warn(`User preferences not found for user: ${userId}`);
          return null;
        }

        this.logger.error(
          `Failed to fetch user preferences: ${error.response?.status} - ${error.response?.statusText}`,
        );
        throw new HttpException(
          `Failed to fetch user preferences: ${error.response?.statusText}`,
          error.response?.status || HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }

      // Handle other errors
      this.logger.error('Unexpected error fetching user preferences:', error);
      throw new HttpException(
        'Failed to fetch user preferences',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Fetch user details including preferences
   *
   * This calls: GET /user/:userId (or similar endpoint that includes preferences)
   */
  async getUserWithPreferences(
    userId: string,
    authToken?: string,
  ): Promise<User | null> {
    try {
      const url = `${this.baseUrl}/user/${userId}`;

      const headers: Record<string, string> = {};
      if (authToken) {
        headers['Authorization'] = `Bearer ${authToken}`;
      }

      this.logger.debug(`Fetching user details for user: ${userId}`);

      const response = await firstValueFrom(
        this.httpService.get<{ success: boolean; data: User }>(url, {
          headers,
        }),
      );

      const responseData = response.data as { success: boolean; data: User };
      if (responseData.success && responseData.data) {
        return responseData.data;
      }

      return null;
    } catch (error) {
      if (error instanceof AxiosError) {
        if (error.response?.status === 404) {
          this.logger.warn(`User not found: ${userId}`);
          return null;
        }

        this.logger.error(
          `Failed to fetch user: ${error.response?.status} - ${error.response?.statusText}`,
        );
        throw new HttpException(
          `Failed to fetch user: ${error.response?.statusText}`,
          error.response?.status || HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }

      this.logger.error('Unexpected error fetching user:', error);
      throw new HttpException(
        'Failed to fetch user',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

 

  /**
   * Fetch every user along with their preferences by paging through user-service.
   * This allows broadcast notifications without manually iterating outside.
   *
   * IMPORTANT: This method paginates through ALL pages to fetch every user.
   */
  async getAllUsersWithPreferences(authToken?: string): Promise<User[]> {
    const headers: Record<string, string> = {};
    if (authToken) {
      headers['Authorization'] = `Bearer ${authToken}`;
    }

    const accumulatedUsers: User[] = [];
    let currentPage = 1;
    let hasMorePages = true;
    const pageSize = 100; // Fetch 100 users per page for efficiency

    this.logger.debug('Starting to fetch all users with pagination');

    try {
      // Loop through all pages until we've fetched all users
      while (hasMorePages) {
        const url = `${this.baseUrl}/user`;

        this.logger.debug(
          `Fetching users page ${currentPage} with limit ${pageSize}`,
        );

        // Use params object - axios will convert numbers to strings in query params
        // The user-service ValidationPipe with @Type(() => Number) will transform them back to numbers
        const response = await firstValueFrom(
          this.httpService.get<{
            success: boolean;
            data: User[];
            meta: PaginationMeta;
          }>(url, {
            headers,
            params: {
              page: currentPage, // Send as number, axios converts to string in query
              limit: pageSize, // Send as number, axios converts to string in query
            },
          }),
        );

        const responseData = response.data as {
          success: boolean;
          data: PaginatedUserResponse['data'];
          meta: PaginatedUserResponse['meta'];
        };

        if (!responseData.success) {
          throw new HttpException(
            'Failed to fetch users from user-service',
            HttpStatus.BAD_GATEWAY,
          );
        }

        // Extract users from this page
        const usersBatch = (responseData.data ?? []).map((user) => ({
          ...user,
          preferences: user.preferences ?? null,
        }));

        accumulatedUsers.push(...usersBatch);

        // Check if there are more pages
        hasMorePages = responseData.meta?.has_next ?? false;
        currentPage += 1;

        this.logger.debug(
          `Fetched ${usersBatch.length} users from page ${currentPage - 1}. Total so far: ${accumulatedUsers.length}`,
        );
      }

      this.logger.log(
        `✅ Successfully fetched ${accumulatedUsers.length} total users`,
      );
    } catch (error) {
      if (error instanceof AxiosError) {
        // Log detailed error information for debugging
        const errorResponse = error.response?.data;
        const errorMessage =
          errorResponse?.message ||
          error.response?.statusText ||
          'Unknown error';

        this.logger.error(
          `Failed to fetch user list: ${error.response?.status} - ${errorMessage}`,
        );
        this.logger.debug(
          `Error response body: ${JSON.stringify(errorResponse)}`,
        );
        this.logger.debug(
          `Request URL: ${error.config?.url}, Method: ${error.config?.method}`,
        );

        throw new HttpException(
          `Failed to fetch user list: ${errorMessage}`,
          error.response?.status || HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }

      if (error instanceof HttpException) {
        throw error;
      }

      this.logger.error('Unexpected error fetching users:', error);
      throw new HttpException(
        'Failed to fetch users',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    if (!accumulatedUsers.length) {
      this.logger.warn('User-service returned an empty user list');
    }

    return accumulatedUsers;
  }
}
