/**
 * Structured Logger Service
 *
 * Provides consistent, structured logging across the application.
 * - Development: Human-readable console output
 * - Production: Structured JSON for log aggregation
 *
 * Usage:
 * ```typescript
 * import { createLogger } from '$lib/utils/logger';
 *
 * const logger = createLogger('MyService');
 * logger.info('Operation started', { userId, action: 'create' });
 * logger.error(error, { context: 'database_query', table: 'users' });
 * ```
 */

import { dev } from '$app/environment';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
	level: LogLevel;
	message: string;
	context: string;
	timestamp: string;
	meta?: Record<string, any>;
	error?: {
		name: string;
		message: string;
		stack?: string;
	};
}

export class Logger {
	constructor(private context: string) {}

	/**
	 * Debug-level logging (only in development)
	 */
	debug(message: string, meta?: Record<string, any>): void {
		if (dev) {
			this.log('debug', message, meta);
		}
	}

	/**
	 * Info-level logging
	 */
	info(message: string, meta?: Record<string, any>): void {
		this.log('info', message, meta);
	}

	/**
	 * Warning-level logging
	 */
	warn(message: string, meta?: Record<string, any>): void {
		this.log('warn', message, meta);
	}

	/**
	 * Error-level logging
	 */
	error(error: Error | string, meta?: Record<string, any>): void {
		if (error instanceof Error) {
			this.log('error', error.message, {
				...meta,
				error: {
					name: error.name,
					message: error.message,
					stack: dev ? error.stack : undefined
				}
			});
		} else {
			this.log('error', error, meta);
		}
	}

	/**
	 * Internal log method
	 */
	private log(level: LogLevel, message: string, meta?: Record<string, any>): void {
		const entry: LogEntry = {
			level,
			message,
			context: this.context,
			timestamp: new Date().toISOString(),
			...(meta && Object.keys(meta).length > 0 ? { meta } : {})
		};

		if (dev) {
			// Development: Human-readable console output
			this.logToDev(entry);
		} else {
			// Production: Structured JSON
			this.logToProduction(entry);
		}
	}

	/**
	 * Development logging - colorized and readable
	 */
	private logToDev(entry: LogEntry): void {
		const colors = {
			debug: '\x1b[36m', // Cyan
			info: '\x1b[32m', // Green
			warn: '\x1b[33m', // Yellow
			error: '\x1b[31m' // Red
		};
		const reset = '\x1b[0m';
		const color = colors[entry.level];

		const prefix = `${color}[${entry.level.toUpperCase()}]${reset} [${entry.context}]`;
		const message = `${prefix} ${entry.message}`;

		switch (entry.level) {
			case 'debug':
			case 'info':
				console.log(message, entry.meta || '');
				break;
			case 'warn':
				console.warn(message, entry.meta || '');
				break;
			case 'error':
				console.error(message, entry.meta || '');
				break;
		}
	}

	/**
	 * Production logging - structured JSON
	 */
	private logToProduction(entry: LogEntry): void {
		const jsonLog = JSON.stringify(entry);

		switch (entry.level) {
			case 'debug':
			case 'info':
				console.log(jsonLog);
				break;
			case 'warn':
				console.warn(jsonLog);
				break;
			case 'error':
				console.error(jsonLog);
				break;
		}
	}
}

/**
 * Create a logger instance for a specific context
 *
 * @param context - Context identifier (e.g., 'AgentChatOrchestrator', 'ToolExecutionService')
 * @returns Logger instance
 */
export function createLogger(context: string): Logger {
	return new Logger(context);
}

/**
 * Global logger for general use
 */
export const logger = createLogger('App');
