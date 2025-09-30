// apps/web/src/lib/middleware/rate-limiter.ts
import type { RequestEvent } from '@sveltejs/kit';
import { error } from '@sveltejs/kit';
import { LRUCache } from '$lib/utils/lru-cache';

export interface RateLimitOptions {
	windowMs: number; // Time window in milliseconds
	max: number; // Max requests per window
	message?: string; // Custom error message
	keyGenerator?: (event: RequestEvent) => string; // Custom key generator
	skipSuccessfulRequests?: boolean; // Don't count successful requests
	skipFailedRequests?: boolean; // Don't count failed requests
}

interface RateLimitRecord {
	count: number;
	resetTime: number;
}

// Store rate limit data in memory (could use Redis in production)
const rateLimitStore = new LRUCache<RateLimitRecord>({
	maxSize: 10000, // Store up to 10k unique IPs/users
	ttl: 15 * 60 * 1000 // 15 minute TTL
});

/**
 * Rate limiting middleware factory
 */
export function rateLimit(options: RateLimitOptions) {
	const {
		windowMs,
		max,
		message = 'Too many requests, please try again later.',
		keyGenerator = (event) => event.getClientAddress(),
		skipSuccessfulRequests = false,
		skipFailedRequests = false
	} = options;

	return async function rateLimitMiddleware(
		event: RequestEvent,
		next?: () => Promise<Response>
	): Promise<Response> {
		const key = keyGenerator(event);
		const now = Date.now();

		// Get or create rate limit record
		let record = rateLimitStore.get(key);

		if (!record || now > record.resetTime) {
			// Create new record
			record = {
				count: 0,
				resetTime: now + windowMs
			};
		}

		// Check if limit exceeded
		if (record.count >= max) {
			if (key === 'auth') {
				console.log(`auth: ${event}`);
			}
			const retryAfter = Math.ceil((record.resetTime - now) / 1000);

			// Return rate limit error with headers
			return new Response(JSON.stringify({ error: message }), {
				status: 429,
				headers: {
					'Content-Type': 'application/json',
					'Retry-After': retryAfter.toString(),
					'X-RateLimit-Limit': max.toString(),
					'X-RateLimit-Remaining': '0',
					'X-RateLimit-Reset': new Date(record.resetTime).toISOString()
				}
			});
		}

		// Increment counter before processing request
		record.count++;
		rateLimitStore.set(key, record);

		// Process request if next handler provided
		if (next) {
			try {
				const response = await next();

				// Optionally don't count successful requests
				if (skipSuccessfulRequests && response.ok) {
					record.count--;
					rateLimitStore.set(key, record);
				}

				// Add rate limit headers to response
				const headers = new Headers(response.headers);
				headers.set('X-RateLimit-Limit', max.toString());
				headers.set('X-RateLimit-Remaining', Math.max(0, max - record.count).toString());
				headers.set('X-RateLimit-Reset', new Date(record.resetTime).toISOString());

				return new Response(response.body, {
					status: response.status,
					statusText: response.statusText,
					headers
				});
			} catch (err) {
				// Optionally don't count failed requests
				if (skipFailedRequests) {
					record.count--;
					rateLimitStore.set(key, record);
				}
				throw err;
			}
		}

		// Return remaining count info
		return new Response(
			JSON.stringify({
				limit: max,
				remaining: Math.max(0, max - record.count),
				reset: new Date(record.resetTime).toISOString()
			}),
			{
				headers: {
					'Content-Type': 'application/json',
					'X-RateLimit-Limit': max.toString(),
					'X-RateLimit-Remaining': Math.max(0, max - record.count).toString(),
					'X-RateLimit-Reset': new Date(record.resetTime).toISOString()
				}
			}
		);
	};
}

/**
 * Common rate limit configurations
 */
export const rateLimits = {
	// Strict limit for auth endpoints
	auth: rateLimit({
		windowMs: 5 * 60 * 1000, // 10 minutes
		max: 50, // 20 requests per 5 minutes
		message: 'Too many authentication attempts. Please try again later.'
	}),

	// Standard API limit
	api: rateLimit({
		windowMs: 60 * 1000, // 1 minute
		max: 60, // 60 requests per minute
		message: 'API rate limit exceeded. Please slow down.'
	}),

	// Generous limit for read operations
	read: rateLimit({
		windowMs: 60 * 1000, // 1 minute
		max: 100, // 100 requests per minute
		skipFailedRequests: true
	}),

	// Strict limit for write operations
	write: rateLimit({
		windowMs: 60 * 1000, // 1 minute
		max: 20, // 20 requests per minute
		message: 'Too many write operations. Please wait before trying again.'
	}),

	// Very strict limit for expensive operations (AI/LLM)
	ai: rateLimit({
		windowMs: 60 * 1000, // 1 minute
		max: 10, // 5 requests per minute
		message: 'AI processing limit reached. Please wait before generating more content.'
	}),

	// Per-user rate limiting (requires authenticated user)
	perUser: (userId: string) =>
		rateLimit({
			windowMs: 60 * 1000,
			max: 30,
			keyGenerator: () => `user:${userId}`
		})
};
