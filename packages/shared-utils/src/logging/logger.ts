/**
 * Shared Logger for BuildOS Platform
 *
 * Provides structured logging with:
 * - Log levels (debug, info, warn, error, fatal)
 * - Context propagation (user IDs, correlation IDs, etc.)
 * - Multiple outputs (console, database, HTTP)
 * - Child loggers for namespacing
 * - Emoji categorization for visual scanning
 *
 * Usage:
 *   const logger = createLogger('worker:brief', supabase);
 *   logger.info('Processing brief', { userId, briefId });
 *   logger.error('Brief failed', error, { userId, briefId });
 */

// import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createServiceClient,
  TypedSupabaseClient,
} from "@buildos/supabase-client";
import type {
  LogLevel,
  LogContext,
  LogMetadata,
  LogEntry,
  LoggerConfig,
} from "./types.js";

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  fatal: 4,
};

const LOG_EMOJIS: Record<LogLevel, string> = {
  debug: "🔍",
  info: "ℹ️",
  warn: "⚠️",
  error: "❌",
  fatal: "🚨",
};

export class Logger {
  private config: LoggerConfig;
  private supabase: TypedSupabaseClient | undefined;

  constructor(config: LoggerConfig, supabase?: TypedSupabaseClient) {
    this.config = config;
    this.supabase = supabase;
  }

  /**
   * Debug-level logging (verbose)
   */
  debug(message: string, context?: LogContext, metadata?: LogMetadata): void {
    if (!this.shouldLog("debug")) return;
    this.log("debug", message, context, metadata);
  }

  /**
   * Info-level logging (normal operations)
   */
  info(message: string, context?: LogContext, metadata?: LogMetadata): void {
    if (!this.shouldLog("info")) return;
    this.log("info", message, context, metadata);
  }

  /**
   * Warning-level logging (recoverable issues)
   */
  warn(message: string, context?: LogContext, metadata?: LogMetadata): void {
    if (!this.shouldLog("warn")) return;
    this.log("warn", message, context, metadata);
  }

  /**
   * Error-level logging (failures)
   */
  error(
    message: string,
    error?: Error | unknown,
    context?: LogContext,
    metadata?: LogMetadata,
  ): void {
    const errorObj = this.normalizeError(error);
    this.log("error", message, context, metadata, errorObj);
  }

  /**
   * Fatal-level logging (critical failures)
   */
  fatal(
    message: string,
    error?: Error | unknown,
    context?: LogContext,
    metadata?: LogMetadata,
  ): void {
    const errorObj = this.normalizeError(error);
    this.log("fatal", message, context, metadata, errorObj);
  }

  /**
   * Create a child logger with a sub-namespace
   */
  child(subNamespace: string, additionalContext?: LogContext): Logger {
    const childConfig: LoggerConfig = {
      ...this.config,
      namespace: `${this.config.namespace}:${subNamespace}`,
      defaultContext: {
        ...this.config.defaultContext,
        ...additionalContext,
      },
    };
    return new Logger(childConfig, this.supabase);
  }

  /**
   * Main logging method
   */
  private log(
    level: LogLevel,
    message: string,
    context?: LogContext,
    metadata?: LogMetadata,
    error?: { message: string; stack?: string; name?: string; code?: string },
  ): void {
    const entry: LogEntry = {
      level,
      message,
      timestamp: new Date(),
      namespace: this.config.namespace,
      context: {
        ...this.config.defaultContext,
        ...context,
      },
      metadata,
      error,
    };

    // Console output (always enabled in development, configurable in production)
    if (this.config.enableConsole) {
      this.logToConsole(entry);
    }

    // Database output (async, non-blocking)
    // Log all levels for notification system correlation tracking
    if (this.config.enableDatabase && this.supabase) {
      this.logToDatabase(entry).catch((err) =>
        console.error("[Logger] Failed to log to database:", err),
      );
    }

    // HTTP output (for external log aggregation services)
    if (
      this.config.enableHttp &&
      this.config.httpEndpoint &&
      this.config.httpToken
    ) {
      this.logToHttp(entry).catch((err) =>
        console.error("[Logger] Failed to log to HTTP endpoint:", err),
      );
    }
  }

  /**
   * Console logging with emoji indicators
   */
  private logToConsole(entry: LogEntry): void {
    const emoji = LOG_EMOJIS[entry.level];
    const timestamp = entry.timestamp.toISOString();
    const prefix = `${emoji} [${timestamp}] [${entry.namespace}]`;

    const logFn = this.getConsoleMethod(entry.level);

    // Format the log entry
    const logData: Record<string, any> = {
      ...entry.context,
      ...entry.metadata,
    };

    if (entry.error) {
      logData.error = entry.error;
    }

    // Log with structured data
    if (Object.keys(logData).length > 0) {
      logFn(`${prefix} ${entry.message}`, logData);
    } else {
      logFn(`${prefix} ${entry.message}`);
    }
  }

  /**
   * Database logging (for notification system correlation tracking)
   */
  private async logToDatabase(entry: LogEntry): Promise<void> {
    if (!this.supabase) return;

    try {
      // Log to notification_logs table for correlation tracking
      // Note: Type assertion needed until database types are regenerated after migration
      await this.supabase.from("notification_logs").insert({
        level: entry.level,
        message: entry.message,
        namespace: entry.namespace,
        correlation_id: entry.context.correlationId || null,
        request_id: entry.context.requestId || null,
        user_id: entry.context.userId || null,
        notification_event_id: entry.context.notificationEventId || null,
        notification_delivery_id: entry.context.notificationDeliveryId || null,
        error_stack: entry.error?.stack || null,
        metadata: {
          ...entry.context,
          ...entry.metadata,
        },
        created_at: entry.timestamp.toISOString(),
      } as any);
    } catch (error) {
      // Don't fail the application if logging fails
      console.error("[Logger] Database logging failed:", error);
    }
  }

  /**
   * HTTP logging (for external services like BetterStack, Axiom)
   */
  private async logToHttp(entry: LogEntry): Promise<void> {
    if (!this.config.httpEndpoint || !this.config.httpToken) return;

    try {
      const payload = {
        level: entry.level,
        message: entry.message,
        timestamp: entry.timestamp.toISOString(),
        namespace: entry.namespace,
        ...entry.context,
        metadata: entry.metadata,
        error: entry.error,
      };

      await fetch(this.config.httpEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.config.httpToken}`,
        },
        body: JSON.stringify(payload),
      });
    } catch (error) {
      // Don't fail the application if logging fails
      console.error("[Logger] HTTP logging failed:", error);
    }
  }

  /**
   * Check if log level should be logged
   */
  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVELS[level] >= LOG_LEVELS[this.config.minLevel];
  }

  /**
   * Get console method for log level
   */
  private getConsoleMethod(level: LogLevel): typeof console.log {
    switch (level) {
      case "debug":
        return console.debug.bind(console);
      case "info":
        return console.log.bind(console);
      case "warn":
        return console.warn.bind(console);
      case "error":
      case "fatal":
        return console.error.bind(console);
    }
  }

  /**
   * Normalize error object
   */
  private normalizeError(
    error: Error | unknown,
  ):
    | { message: string; stack?: string; name?: string; code?: string }
    | undefined {
    if (!error) return undefined;

    if (error instanceof Error) {
      return {
        message: error.message,
        stack: error.stack,
        name: error.name,
        code: (error as any).code,
      };
    }

    // Handle non-Error objects
    return {
      message: String(error),
      name: "UnknownError",
    };
  }
}

/**
 * Create a logger instance
 */
export function createLogger(
  namespace: string,
  supabase?: TypedSupabaseClient,
  options?: Partial<LoggerConfig>,
): Logger {
  // Determine min log level from environment
  const envLogLevel = (process.env.LOG_LEVEL as LogLevel) || undefined;
  const minLevel =
    options?.minLevel ||
    envLogLevel ||
    (process.env.NODE_ENV === "production" ? "info" : "debug");

  const config: LoggerConfig = {
    namespace,
    minLevel,
    enableConsole: options?.enableConsole ?? true,
    enableDatabase: options?.enableDatabase ?? supabase !== undefined,
    enableHttp: options?.enableHttp ?? false,
    httpEndpoint: options?.httpEndpoint || process.env.LOG_HTTP_URL,
    httpToken: options?.httpToken || process.env.LOG_HTTP_TOKEN,
    defaultContext: options?.defaultContext || {},
  };

  return new Logger(config, supabase);
}
