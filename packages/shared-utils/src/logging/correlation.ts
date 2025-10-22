// packages/shared-utils/src/logging/correlation.ts
/**
 * Correlation ID utilities for tracking requests across services
 *
 * Correlation IDs help trace a single user action across:
 * - Web API requests
 * - Queue jobs
 * - Worker processing
 * - External service calls
 *
 * Usage:
 *   // In web API endpoint
 *   const correlationId = generateCorrelationId();
 *   const context = createCorrelationContext(correlationId, { userId });
 *
 *   // In worker job
 *   const context = extractCorrelationContext(job.metadata);
 *   logger.info('Processing job', context);
 */

import { randomUUID } from 'crypto';
import type { LogContext } from './types.js';

/**
 * Generate a new correlation ID
 */
export function generateCorrelationId(): string {
	return randomUUID();
}

/**
 * Create a correlation context for logging
 */
export function createCorrelationContext(
	correlationId: string,
	additionalContext?: Partial<LogContext>
): LogContext {
	return {
		correlationId,
		...additionalContext
	};
}

/**
 * Extract correlation ID from job metadata or headers
 */
export function extractCorrelationContext(
	source: Record<string, any> | Headers
): Pick<LogContext, 'correlationId' | 'requestId'> {
	if (source instanceof Headers) {
		return {
			correlationId:
				source.get('x-correlation-id') || source.get('x-request-id') || undefined,
			requestId: source.get('x-request-id') || undefined
		};
	}

	return {
		correlationId: source.correlationId || source.correlation_id || undefined,
		requestId: source.requestId || source.request_id || undefined
	};
}

/**
 * Inject correlation context into job metadata
 */
export function injectCorrelationContext<T extends Record<string, any>>(
	metadata: T,
	context: Pick<LogContext, 'correlationId' | 'requestId'>
): T & { correlationId?: string; requestId?: string } {
	return {
		...metadata,
		...(context.correlationId && { correlationId: context.correlationId }),
		...(context.requestId && { requestId: context.requestId })
	};
}
