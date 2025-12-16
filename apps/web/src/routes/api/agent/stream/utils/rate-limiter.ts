// apps/web/src/routes/api/agent/stream/utils/rate-limiter.ts
/**
 * Rate Limiter for /api/agent/stream endpoint.
 *
 * Pluggable interface for request rate limiting.
 * Currently disabled but kept configurable for future use.
 *
 * Current implementation: In-memory (non-distributed, lost on restart)
 * Future: Could be Redis/Upstash for distributed limiting
 */

import { ApiResponse } from '$lib/utils/api-response';
import type { RateLimitResult, RateLimitState } from '../types';
import { RATE_LIMIT_ENABLED, RATE_LIMIT, ERROR_MESSAGES, ERROR_CODES } from '../constants';

// ============================================
// RATE LIMITER INTERFACE
// ============================================

/**
 * Rate limiter interface.
 * Implementations can be swapped for different backends (memory, Redis, etc.)
 */
export interface RateLimiter {
	/**
	 * Check if a request should be allowed for the given user.
	 *
	 * @param userId - The user ID to check
	 * @returns RateLimitResult indicating if request is allowed
	 */
	checkLimit(userId: string): RateLimitResult;

	/**
	 * Record token usage for a user.
	 * Called after successful request processing.
	 *
	 * @param userId - The user ID
	 * @param tokens - Number of tokens used
	 */
	recordUsage(userId: string, tokens: number): void;

	/**
	 * Check if rate limiting is enabled.
	 *
	 * @returns True if rate limiting is active
	 */
	isEnabled(): boolean;

	/**
	 * Get current rate limit state for a user (for debugging/monitoring).
	 *
	 * @param userId - The user ID
	 * @returns Current rate limit state or undefined if not tracked
	 */
	getState(userId: string): RateLimitState | undefined;

	/**
	 * Clear rate limit state for a user.
	 *
	 * @param userId - The user ID
	 */
	clearState(userId: string): void;
}

/**
 * Configuration for rate limiter.
 */
export interface RateLimiterConfig {
	/** Whether rate limiting is enabled */
	enabled: boolean;
	/** Maximum requests per window */
	maxRequestsPerMinute: number;
	/** Maximum tokens per window */
	maxTokensPerMinute: number;
	/** Window duration in milliseconds */
	windowMs: number;
}

// ============================================
// NO-OP RATE LIMITER
// ============================================

/**
 * No-op rate limiter that always allows requests.
 * Used when rate limiting is disabled.
 */
class NoOpRateLimiter implements RateLimiter {
	checkLimit(_userId: string): RateLimitResult {
		return { allowed: true };
	}

	recordUsage(_userId: string, _tokens: number): void {
		// No-op
	}

	isEnabled(): boolean {
		return false;
	}

	getState(_userId: string): RateLimitState | undefined {
		return undefined;
	}

	clearState(_userId: string): void {
		// No-op
	}
}

// ============================================
// IN-MEMORY RATE LIMITER
// ============================================

/**
 * In-memory rate limiter implementation.
 * Simple but non-distributed - state is lost on restart.
 *
 * Note: This is suitable for single-instance deployments.
 * For distributed environments, consider Redis/Upstash implementation.
 */
class InMemoryRateLimiter implements RateLimiter {
	private state = new Map<string, RateLimitState>();
	private config: RateLimiterConfig;

	constructor(config: RateLimiterConfig) {
		this.config = config;
	}

	checkLimit(userId: string): RateLimitResult {
		if (!this.config.enabled) {
			return { allowed: true };
		}

		const now = Date.now();
		let userState = this.state.get(userId);

		// Initialize or reset if window expired
		if (!userState || userState.resetAt <= now) {
			userState = {
				requests: 0,
				tokens: 0,
				resetAt: now + this.config.windowMs
			};
			this.state.set(userId, userState);
		}

		// Check request limit
		if (userState.requests >= this.config.maxRequestsPerMinute) {
			return {
				allowed: false,
				response: ApiResponse.error(
					ERROR_MESSAGES.RATE_LIMITED_REQUESTS,
					429,
					ERROR_CODES.RATE_LIMITED
				),
				message: ERROR_MESSAGES.RATE_LIMITED_REQUESTS,
				remaining: 0,
				resetAt: new Date(userState.resetAt)
			};
		}

		// Check token limit
		if (userState.tokens >= this.config.maxTokensPerMinute) {
			return {
				allowed: false,
				response: ApiResponse.error(
					ERROR_MESSAGES.RATE_LIMITED_TOKENS,
					429,
					ERROR_CODES.RATE_LIMITED
				),
				message: ERROR_MESSAGES.RATE_LIMITED_TOKENS,
				remaining: 0,
				resetAt: new Date(userState.resetAt)
			};
		}

		// Increment request count
		userState.requests++;

		return {
			allowed: true,
			remaining: this.config.maxRequestsPerMinute - userState.requests,
			resetAt: new Date(userState.resetAt)
		};
	}

	recordUsage(userId: string, tokens: number): void {
		if (!this.config.enabled) return;

		const userState = this.state.get(userId);
		if (userState) {
			userState.tokens = Math.min(userState.tokens + tokens, this.config.maxTokensPerMinute);
		}
	}

	isEnabled(): boolean {
		return this.config.enabled;
	}

	getState(userId: string): RateLimitState | undefined {
		return this.state.get(userId);
	}

	clearState(userId: string): void {
		this.state.delete(userId);
	}
}

// ============================================
// FACTORY FUNCTION
// ============================================

/**
 * Create a rate limiter based on configuration.
 * Factory function allows swapping implementations.
 *
 * @param config - Rate limiter configuration
 * @returns RateLimiter instance
 */
export function createRateLimiter(config?: Partial<RateLimiterConfig>): RateLimiter {
	const fullConfig: RateLimiterConfig = {
		enabled: config?.enabled ?? RATE_LIMIT_ENABLED,
		maxRequestsPerMinute: config?.maxRequestsPerMinute ?? RATE_LIMIT.MAX_REQUESTS_PER_MINUTE,
		maxTokensPerMinute: config?.maxTokensPerMinute ?? RATE_LIMIT.MAX_TOKENS_PER_MINUTE,
		windowMs: config?.windowMs ?? RATE_LIMIT.WINDOW_MS
	};

	if (!fullConfig.enabled) {
		return new NoOpRateLimiter();
	}

	// Future: Add Redis/Upstash implementation here
	// if (config.backend === 'redis') {
	//   return new RedisRateLimiter(fullConfig);
	// }

	return new InMemoryRateLimiter(fullConfig);
}

// ============================================
// DEFAULT INSTANCE
// ============================================

/**
 * Default rate limiter instance using config from constants.
 * Pre-created for convenience - most code can just import this.
 */
export const rateLimiter = createRateLimiter();
