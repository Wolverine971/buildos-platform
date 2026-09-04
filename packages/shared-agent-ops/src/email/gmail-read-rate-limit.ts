// packages/shared-agent-ops/src/email/gmail-read-rate-limit.ts
// Gmail read quota rules. The host supplies the limiter so web keeps its
// process singleton and the worker gets its own in-memory instance.
import type { RateLimiterPort } from './gmail-rate-limiter-port';

export type GmailReadOperation = 'search' | 'get';

const RULES = {
	search: {
		user: { requests: 30, windowMs: 60_000 },
		connection: { requests: 20, windowMs: 60_000 }
	},
	get: {
		user: { requests: 60, windowMs: 60_000 },
		connection: { requests: 40, windowMs: 60_000 }
	}
} as const;

export type GmailReadRateLimitDecision =
	| { allowed: true; headers: Record<string, string> }
	| { allowed: false; retryAfterSeconds: number; headers: Record<string, string> };

export function checkGmailReadRateLimit(params: {
	userId: string;
	connectionIds: string[];
	operation: GmailReadOperation;
	limiter: RateLimiterPort;
}): GmailReadRateLimitDecision {
	const rule = RULES[params.operation];
	const { limiter } = params;
	const checks = [
		limiter.check(`gmail-read:${params.operation}:user:${params.userId}`, rule.user),
		...params.connectionIds.map((connectionId) =>
			limiter.check(
				`gmail-read:${params.operation}:connection:${params.userId}:${connectionId}`,
				rule.connection
			)
		)
	];
	const blocked = checks.find((check) => !check.allowed);
	const limit = Math.min(rule.user.requests, rule.connection.requests);
	const remaining = Math.min(...checks.map((check) => check.remaining));
	const resetTime = Math.max(...checks.map((check) => check.resetTime));
	const headers = {
		'X-RateLimit-Limit': String(limit),
		'X-RateLimit-Remaining': String(remaining),
		'X-RateLimit-Reset': String(Math.ceil(resetTime / 1000))
	};

	if (!blocked) return { allowed: true, headers };
	return {
		allowed: false,
		retryAfterSeconds: Math.max(1, Math.ceil((blocked.resetTime - Date.now()) / 1000)),
		headers
	};
}
