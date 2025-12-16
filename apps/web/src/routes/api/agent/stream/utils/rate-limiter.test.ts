// apps/web/src/routes/api/agent/stream/utils/rate-limiter.test.ts
/**
 * Unit tests for rate limiter utilities.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock ApiResponse
vi.mock('$lib/utils/api-response', () => ({
	ApiResponse: {
		error: vi.fn((message, status, code) => ({
			type: 'error',
			message,
			status,
			code
		}))
	}
}));

// Import after mocking
import { createRateLimiter, type RateLimiter } from './rate-limiter';

// ============================================
// NoOpRateLimiter (disabled rate limiting)
// ============================================

describe('NoOpRateLimiter (disabled)', () => {
	let limiter: RateLimiter;

	beforeEach(() => {
		limiter = createRateLimiter({ enabled: false });
	});

	it('should always allow requests', () => {
		const result = limiter.checkLimit('user_1');
		expect(result.allowed).toBe(true);
	});

	it('should report as disabled', () => {
		expect(limiter.isEnabled()).toBe(false);
	});

	it('should return undefined for state', () => {
		limiter.checkLimit('user_1'); // Try to create state
		expect(limiter.getState('user_1')).toBeUndefined();
	});

	it('should not track usage', () => {
		limiter.recordUsage('user_1', 1000);
		expect(limiter.getState('user_1')).toBeUndefined();
	});

	it('should handle clearState without error', () => {
		expect(() => limiter.clearState('user_1')).not.toThrow();
	});
});

// ============================================
// InMemoryRateLimiter (enabled rate limiting)
// ============================================

describe('InMemoryRateLimiter (enabled)', () => {
	let limiter: RateLimiter;
	const config = {
		enabled: true,
		maxRequestsPerMinute: 5,
		maxTokensPerMinute: 1000,
		windowMs: 60000 // 1 minute
	};

	beforeEach(() => {
		vi.useFakeTimers();
		limiter = createRateLimiter(config);
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('should report as enabled', () => {
		expect(limiter.isEnabled()).toBe(true);
	});

	it('should allow requests under limit', () => {
		const result = limiter.checkLimit('user_1');
		expect(result.allowed).toBe(true);
		expect(result.remaining).toBe(4); // 5 - 1 = 4
	});

	it('should track state after check', () => {
		limiter.checkLimit('user_1');
		const state = limiter.getState('user_1');

		expect(state).toBeDefined();
		expect(state!.requests).toBe(1);
		expect(state!.tokens).toBe(0);
	});

	it('should block requests over request limit', () => {
		// Use up all 5 requests
		for (let i = 0; i < 5; i++) {
			limiter.checkLimit('user_1');
		}

		// 6th request should be blocked
		const result = limiter.checkLimit('user_1');

		expect(result.allowed).toBe(false);
		expect(result.response).toBeDefined();
		expect(result.remaining).toBe(0);
	});

	it('should block when token limit exceeded', () => {
		// First request allowed
		limiter.checkLimit('user_1');

		// Record tokens up to limit
		limiter.recordUsage('user_1', 1000);

		// Second request should be blocked due to tokens
		const result = limiter.checkLimit('user_1');

		expect(result.allowed).toBe(false);
		expect(result.message?.toLowerCase()).toContain('token');
	});

	it('should track token usage', () => {
		limiter.checkLimit('user_1');
		limiter.recordUsage('user_1', 500);

		const state = limiter.getState('user_1');
		expect(state!.tokens).toBe(500);
	});

	it('should cap token usage at limit', () => {
		limiter.checkLimit('user_1');
		limiter.recordUsage('user_1', 2000); // Over limit

		const state = limiter.getState('user_1');
		expect(state!.tokens).toBe(1000); // Capped at max
	});

	it('should reset limits after window expires', () => {
		// Use up all requests
		for (let i = 0; i < 5; i++) {
			limiter.checkLimit('user_1');
		}

		// Verify blocked
		expect(limiter.checkLimit('user_1').allowed).toBe(false);

		// Advance time past window
		vi.advanceTimersByTime(61000);

		// Should be allowed again
		const result = limiter.checkLimit('user_1');
		expect(result.allowed).toBe(true);
	});

	it('should clear state for user', () => {
		limiter.checkLimit('user_1');
		expect(limiter.getState('user_1')).toBeDefined();

		limiter.clearState('user_1');
		expect(limiter.getState('user_1')).toBeUndefined();
	});

	it('should track users independently', () => {
		// User 1 uses 3 requests
		limiter.checkLimit('user_1');
		limiter.checkLimit('user_1');
		limiter.checkLimit('user_1');

		// User 2 should start fresh
		const result = limiter.checkLimit('user_2');
		expect(result.allowed).toBe(true);
		expect(result.remaining).toBe(4); // User 2's first request
	});

	it('should return resetAt time', () => {
		const now = Date.now();
		vi.setSystemTime(now);

		const result = limiter.checkLimit('user_1');

		expect(result.resetAt).toBeDefined();
		expect(result.resetAt!.getTime()).toBe(now + config.windowMs);
	});

	it('should not record usage for unknown user', () => {
		// Record without checking first
		limiter.recordUsage('unknown_user', 500);

		// State should not be created
		expect(limiter.getState('unknown_user')).toBeUndefined();
	});

	it('should decrement remaining correctly', () => {
		expect(limiter.checkLimit('user_1').remaining).toBe(4);
		expect(limiter.checkLimit('user_1').remaining).toBe(3);
		expect(limiter.checkLimit('user_1').remaining).toBe(2);
		expect(limiter.checkLimit('user_1').remaining).toBe(1);
		expect(limiter.checkLimit('user_1').remaining).toBe(0);
	});
});

// ============================================
// Factory function
// ============================================

describe('createRateLimiter factory', () => {
	it('should create NoOpRateLimiter when disabled', () => {
		const limiter = createRateLimiter({ enabled: false });
		expect(limiter.isEnabled()).toBe(false);
	});

	it('should create InMemoryRateLimiter when enabled', () => {
		const limiter = createRateLimiter({ enabled: true });
		expect(limiter.isEnabled()).toBe(true);
	});

	it('should use defaults from constants', () => {
		// This will use RATE_LIMIT_ENABLED from constants (should be false)
		const limiter = createRateLimiter();
		// Default is disabled per constants
		expect(limiter.isEnabled()).toBe(false);
	});

	it('should allow partial config override', () => {
		vi.useFakeTimers();

		const limiter = createRateLimiter({
			enabled: true,
			maxRequestsPerMinute: 2
			// Other values use defaults
		});

		// Should allow 2 requests
		limiter.checkLimit('user_1');
		limiter.checkLimit('user_1');

		// Third should be blocked
		const result = limiter.checkLimit('user_1');
		expect(result.allowed).toBe(false);

		vi.useRealTimers();
	});
});

// ============================================
// Edge cases
// ============================================

describe('Rate limiter edge cases', () => {
	it('should handle rapid sequential requests', () => {
		vi.useFakeTimers();

		const limiter = createRateLimiter({
			enabled: true,
			maxRequestsPerMinute: 100,
			maxTokensPerMinute: 10000,
			windowMs: 60000
		});

		// Make many rapid requests
		const results = [];
		for (let i = 0; i < 50; i++) {
			results.push(limiter.checkLimit('user_1'));
		}

		// All should be allowed
		expect(results.every((r) => r.allowed)).toBe(true);
		// Remaining should decrement correctly
		expect(results[49].remaining).toBe(50);

		vi.useRealTimers();
	});

	it('should handle multiple users hitting limits', () => {
		vi.useFakeTimers();

		const limiter = createRateLimiter({
			enabled: true,
			maxRequestsPerMinute: 2,
			maxTokensPerMinute: 1000,
			windowMs: 60000
		});

		// Both users hit their limits
		limiter.checkLimit('user_1');
		limiter.checkLimit('user_1');
		limiter.checkLimit('user_2');
		limiter.checkLimit('user_2');

		// Both should be blocked
		expect(limiter.checkLimit('user_1').allowed).toBe(false);
		expect(limiter.checkLimit('user_2').allowed).toBe(false);

		vi.useRealTimers();
	});

	it('should handle window rollover correctly', () => {
		vi.useFakeTimers();
		const now = Date.now();
		vi.setSystemTime(now);

		const limiter = createRateLimiter({
			enabled: true,
			maxRequestsPerMinute: 2,
			maxTokensPerMinute: 1000,
			windowMs: 60000
		});

		// Use limit
		limiter.checkLimit('user_1');
		limiter.checkLimit('user_1');
		expect(limiter.checkLimit('user_1').allowed).toBe(false);

		// Advance to just before window end
		vi.advanceTimersByTime(59999);
		expect(limiter.checkLimit('user_1').allowed).toBe(false);

		// Advance past window
		vi.advanceTimersByTime(2);
		const result = limiter.checkLimit('user_1');
		expect(result.allowed).toBe(true);
		expect(result.remaining).toBe(1); // Fresh window

		vi.useRealTimers();
	});

	it('should handle zero config values gracefully', () => {
		vi.useFakeTimers();

		const limiter = createRateLimiter({
			enabled: true,
			maxRequestsPerMinute: 0,
			maxTokensPerMinute: 0,
			windowMs: 60000
		});

		// First request should be blocked immediately
		const result = limiter.checkLimit('user_1');
		expect(result.allowed).toBe(false);

		vi.useRealTimers();
	});
});
