// apps/web/src/lib/server/agent-call/oauth-rate-limit.ts
//
// Per-IP rate limiting for the public OAuth endpoints. These endpoints are
// unauthenticated (token exchange, dynamic client registration) and the global
// rate-limit middleware is currently disabled, so without this an attacker can
// spam `agent_oauth_clients` via DCR or brute the token endpoint. Backed by the
// existing in-memory `rateLimiter` singleton; limits are env-overridable.
import { json } from '@sveltejs/kit';
import { rateLimiter } from '$lib/utils/rate-limiter';

export interface OAuthRateLimitRule {
	requests: number;
	windowMs: number;
}

function ruleFromEnv(prefix: string, defaults: OAuthRateLimitRule): OAuthRateLimitRule {
	const parse = (value: string | undefined, fallback: number): number => {
		const parsed = value ? Number.parseInt(value, 10) : NaN;
		return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
	};
	return {
		requests: parse(process.env[`${prefix}_MAX`], defaults.requests),
		windowMs: parse(process.env[`${prefix}_WINDOW_MS`], defaults.windowMs)
	};
}

/**
 * Defaults are generous for legitimate clients (refresh-on-expiry, a handful of
 * registrations) but cut off automated abuse. Token exchange is busier than
 * registration, so it gets a higher ceiling.
 */
export const OAUTH_RATE_LIMITS = {
	token: ruleFromEnv('OAUTH_RL_TOKEN', { requests: 120, windowMs: 60_000 }),
	register: ruleFromEnv('OAUTH_RL_REGISTER', { requests: 20, windowMs: 60 * 60_000 })
} as const;

export type OAuthRateLimitResult =
	| { allowed: true; headers: Record<string, string> }
	| { allowed: false; response: Response };

/**
 * Checks (and consumes) one unit against the given rule. On success returns the
 * informational `X-RateLimit-*` headers to attach to the eventual response; on
 * rejection returns a ready-to-send 429 in OAuth error shape.
 */
export function checkOAuthRateLimit(
	identifier: string,
	rule: OAuthRateLimitRule
): OAuthRateLimitResult {
	const result = rateLimiter.check(identifier, rule);
	const baseHeaders: Record<string, string> = {
		'X-RateLimit-Limit': String(rule.requests),
		'X-RateLimit-Remaining': String(result.remaining),
		'X-RateLimit-Reset': String(Math.ceil(result.resetTime / 1000))
	};

	if (result.allowed) {
		return { allowed: true, headers: baseHeaders };
	}

	const retryAfter = Math.max(1, Math.ceil((result.resetTime - Date.now()) / 1000));
	return {
		allowed: false,
		response: json(
			{
				error: 'temporarily_unavailable',
				error_description: 'Too many OAuth requests. Slow down and retry.'
			},
			{
				status: 429,
				headers: {
					...baseHeaders,
					'Retry-After': String(retryAfter),
					'Cache-Control': 'no-store',
					'Access-Control-Allow-Origin': '*'
				}
			}
		)
	};
}
