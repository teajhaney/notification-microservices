import {
  IsEmail,
  IsString,
  MinLength,
  IsOptional,
  IsBoolean,
  IsInt,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';

export class RegisterDto {
  @IsString()
  name: string;

  @IsString()
  @IsEmail({}, { message: 'Please provide a valid email address' })
  email: string;

  @IsString()
  @MinLength(6, { message: 'Password must be at least 6 characters long' })
  password: string;

  @IsOptional()
  @IsString()
  push_token?: string;

  @IsOptional()
  @IsString()
  role?: string;
}

export class LoginDto {
  @IsEmail({}, { message: 'Please provide a valid email address' })
  email: string;

  @IsString()
  @MinLength(6, { message: 'Password must be at least 6 characters long' })
  password: string;
}

export class UpdatePreferenceDto {
  @IsOptional()
  @IsBoolean()
  email_opt_in?: boolean;

  @IsOptional()
  @IsBoolean()
  push_opt_in?: boolean;

  @IsOptional()
  @IsInt()
  daily_limit?: number;

  @IsOptional()
  @IsString()
  language?: string;
}

export class PaginationDto {
  /**
   * Page number (1-indexed)
   * Query parameters come as strings, so we need @Type to transform them to numbers
   */
  @IsOptional()
  @Type(() => Number) // Transform string query param to number
  @IsInt()
  @Min(1)
  page?: number = 1;

  /**
   * Number of items per page (max 100)
   * Query parameters come as strings, so we need @Type to transform them to numbers
   */
  @IsOptional()
  @Type(() => Number) // Transform string query param to number
  @IsInt()
  @Min(1)
  @Max(100) // Cap to prevent abuse
  limit?: number = 10;
}
