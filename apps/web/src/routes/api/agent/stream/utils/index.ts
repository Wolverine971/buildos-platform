// apps/web/src/routes/api/agent/stream/utils/index.ts
/**
 * Utility re-exports for /api/agent/stream endpoint.
 *
 * Provides a clean import interface for all utility functions.
 *
 * Usage:
 * ```typescript
 * import {
 *   normalizeContextType,
 *   rateLimiter,
 *   mapPlannerEventToSSE
 * } from './utils';
 * ```
 */

// ============================================
// CONTEXT UTILITIES
// ============================================

export {
	normalizeContextType,
	normalizeProjectFocus,
	projectFocusEquals,
	generateOntologyCacheKey,
	assignEntityByPrefix,
	generateLastTurnContext,
	buildContextShiftLastTurnContext,
	buildQuickUsageSnapshot
} from './context-utils';

// ============================================
// RATE LIMITING
// ============================================

export {
	createRateLimiter,
	rateLimiter,
	type RateLimiter,
	type RateLimiterConfig
} from './rate-limiter';

// ============================================
// EVENT MAPPING
// ============================================

export { mapPlannerEventToSSE, isKnownEventType, getRegisteredEventTypes } from './event-mapper';
