// packages/shared-agent-ops/src/email/gmail-rate-limiter-port.ts
// Host-supplied rate limiting for the shared Gmail read stack. The shape mirrors
// the web in-memory limiter (`apps/web/src/lib/utils/rate-limiter.ts`) so the web
// singleton satisfies it directly; the worker uses `createInMemoryRateLimiter()`.

export type RateLimitRule = {
	requests: number;
	windowMs: number;
};

export type RateLimitDecision = {
	allowed: boolean;
	remaining: number;
	resetTime: number;
};

export interface RateLimiterPort {
	check(identifier: string, rule: RateLimitRule): RateLimitDecision;
}

type RateLimitEntry = {
	count: number;
	windowStart: number;
};

const ENTRY_TTL_MS = 3_600_000;

/**
 * Process-local limiter with the same window semantics as the web limiter.
 * Expired entries are pruned lazily on read so no interval timer is held open
 * in a long-lived worker process.
 */
export function createInMemoryRateLimiter(): RateLimiterPort {
	const memory = new Map<string, RateLimitEntry>();
	let lastPruneAt = 0;

	function prune(now: number): void {
		if (now - lastPruneAt < 60_000) return;
		lastPruneAt = now;
		for (const [key, entry] of memory.entries()) {
			if (now - entry.windowStart > ENTRY_TTL_MS) memory.delete(key);
		}
	}

	return {
		check(identifier, rule) {
			const now = Date.now();
			prune(now);

			const key = `${identifier}:${rule.windowMs}:${rule.requests}`;
			let entry = memory.get(key);
			if (!entry || now - entry.windowStart >= rule.windowMs) {
				entry = { count: 0, windowStart: now };
				memory.set(key, entry);
			}

			const resetTime = entry.windowStart + rule.windowMs;
			if (entry.count >= rule.requests) {
				return { allowed: false, remaining: 0, resetTime };
			}

			entry.count++;
			return {
				allowed: true,
				remaining: Math.max(0, rule.requests - entry.count),
				resetTime
			};
		}
	};
}
