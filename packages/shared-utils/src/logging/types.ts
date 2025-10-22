// packages/shared-utils/src/logging/types.ts
/**
 * Shared logging types for BuildOS platform
 * Used across web and worker applications
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal';

export interface LogContext {
	// User & entity IDs
	userId?: string;
	projectId?: string;
	brainDumpId?: string;
	taskId?: string;
	briefId?: string;
	notificationEventId?: string;
	notificationDeliveryId?: string;
	jobId?: string;

	// Request tracking
	requestId?: string;
	correlationId?: string;
	sessionId?: string;

	// Notification-specific
	eventType?: string;
	channel?: 'push' | 'email' | 'sms' | 'in_app';
	recipientEmail?: string;
	phoneNumber?: string;

	// Custom metadata
	[key: string]: any;
}

export interface LogMetadata {
	// Performance
	duration_ms?: number;
	responseTime_ms?: number;

	// External services
	twilioSid?: string;
	emailTrackingId?: string;
	llmModel?: string;
	llmProvider?: string;
	llmCostUsd?: number;

	// Status & errors
	status?: string;
	errorCode?: string;
	errorCategory?: string;
	retryAttempt?: number;
	maxRetries?: number;

	// Custom fields
	[key: string]: any;
}

export interface LogEntry {
	level: LogLevel;
	message: string;
	timestamp: Date;
	namespace: string;
	context: LogContext;
	metadata?: LogMetadata;
	error?: {
		message: string;
		stack?: string;
		name?: string;
		code?: string;
	};
}

export interface LoggerConfig {
	minLevel: LogLevel;
	namespace: string;
	enableConsole: boolean;
	enableDatabase: boolean;
	enableHttp?: boolean;
	httpEndpoint?: string;
	httpToken?: string;
	defaultContext?: LogContext;
}

export type LogOutput = 'console' | 'database' | 'http';
