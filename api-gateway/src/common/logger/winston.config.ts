import { WinstonModuleOptions } from 'nest-winston';
import * as winston from 'winston';

/**
 * Winston Logger Configuration
 *
 * This configuration sets up Winston with multiple transports:
 * 1. Console: For development (pretty colored output)
 * 2. File: For production (structured logs saved to files)
 *
 * Why Winston?
 * - More powerful than NestJS built-in logger
 * - Can log to multiple destinations (console, files, databases, etc.)
 * - Structured logging with metadata
 * - Better for production environments
 * - Can filter logs by level per transport
 */
export const winstonConfig: WinstonModuleOptions = {
  // Define log levels (from least to most severe)
  levels: winston.config.npm.levels, // error: 0, warn: 1, info: 2, http: 3, verbose: 4, debug: 5, silly: 6

  // Default log level (can be overridden by environment variable)
  level: process.env.LOG_LEVEL || 'info',

  // Define log format
  format: winston.format.combine(
    // Add timestamp to every log
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),

    // Handle errors properly
    winston.format.errors({ stack: true }),

    // Add metadata to logs
    winston.format.metadata({ fillExcept: ['message', 'level', 'timestamp'] }),

    // Colorize logs for console (only works in terminal)
    winston.format.colorize({ all: true }),

    // Define the log format structure
    winston.format.printf((info) => {
      const { timestamp, level, message, metadata } = info;
      // Extract metadata if present
      const metaString =
        metadata && typeof metadata === 'object' && Object.keys(metadata).length
          ? ` ${JSON.stringify(metadata)}`
          : '';
      return `${String(timestamp)} [${String(level)}]: ${String(message)}${metaString}`;
    }),
  ),

  // Define where logs should go (transports)
  transports: [
    // Console transport (always active for development)
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize({ all: true }),
        winston.format.printf((info) => {
          const { timestamp, level, message, metadata } = info;
          const metaString =
            metadata &&
            typeof metadata === 'object' &&
            Object.keys(metadata).length
              ? ` ${JSON.stringify(metadata)}`
              : '';
          return `${String(timestamp)} [${String(level)}]: ${String(message)}${metaString}`;
        }),
      ),
    }),

    // File transport for errors (only errors go here)
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json(), // JSON format for easier parsing
      ),
      maxsize: 5242880, // 5MB
      maxFiles: 5, // Keep last 5 error log files
    }),

    // File transport for all logs (combined.log)
    new winston.transports.File({
      filename: 'logs/combined.log',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json(),
      ),
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),

    // File transport for HTTP requests (useful for API monitoring)
    new winston.transports.File({
      filename: 'logs/http.log',
      level: 'http',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json(),
      ),
      maxsize: 5242880,
      maxFiles: 10,
    }),
  ],

  // Handle exceptions and rejections that aren't caught
  exceptionHandlers: [
    new winston.transports.File({ filename: 'logs/exceptions.log' }),
  ],
  rejectionHandlers: [
    new winston.transports.File({ filename: 'logs/rejections.log' }),
  ],
};
