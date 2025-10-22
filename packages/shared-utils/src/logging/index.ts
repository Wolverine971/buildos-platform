// packages/shared-utils/src/logging/index.ts
/**
 * Shared logging utilities for BuildOS platform
 *
 * @module @buildos/shared-utils/logging
 */

export { Logger, createLogger } from './logger.js';
export type {
	LogLevel,
	LogContext,
	LogMetadata,
	LogEntry,
	LoggerConfig,
	LogOutput
} from './types.js';
export {
	generateCorrelationId,
	createCorrelationContext,
	extractCorrelationContext,
	injectCorrelationContext
} from './correlation.js';
