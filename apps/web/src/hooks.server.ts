// apps/web/src/hooks.server.ts
import { json, redirect } from '@sveltejs/kit';
import type { Handle, HandleServerError } from '@sveltejs/kit';
import { createSupabaseServer } from '$lib/supabase';
import { createServerTiming } from '$lib/server/server-timing';
import { dev } from '$app/environment';
import {
	CONSUMPTION_AUTO_POWER_UPGRADE_ENABLED,
	CONSUMPTION_BILLING_GUARD_ENABLED,
	CONSUMPTION_BILLING_LIMITS,
	type FrozenMutationCapability,
	classifyFrozenMutationCapability,
	shouldGuardMutationForConsumptionBilling
} from '$lib/server/consumption-billing';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import { StripeService } from '$lib/services/stripe-service';
// import { rateLimits } from '$lib/middleware/rate-limiter';

const LEGACY_FEATURE_PATHS = new Set(['/features', '/features/']);
const LEGACY_BLOG_MARKDOWN_PATH = /^\/src\/content\/blogs\/([^/]+)\/([^/]+?)(?:\.md)?\/?$/;

function getLegacyRedirectPath(pathname: string): string | null {
	if (LEGACY_FEATURE_PATHS.has(pathname)) {
		return '/';
	}

	const legacyBlogPathMatch = pathname.match(LEGACY_BLOG_MARKDOWN_PATH);
	if (!legacyBlogPathMatch) {
		return null;
	}

	const [, category, rawSlug] = legacyBlogPathMatch;
	if (!category || !rawSlug) {
		return null;
	}

	const slug = rawSlug.replace(/\.md$/i, '');
	return `/blogs/${category}/${slug}`;
}

// Rate limiting handle
// const handleRateLimit: Handle = async ({ event, resolve }) => {
// 	const path = event.url.pathname;
// 	const method = event.request.method;

// 	// Skip rate limiting for static assets
// 	if (
// 		path.startsWith('/_app/') ||
// 		path.startsWith('/static/') ||
// 		path === '/favicon.ico' ||
// 		path === '/robots.txt' ||
// 		path === '/sitemap.xml'
// 	) {
// 		return resolve(event);
// 	}

// 	// Apply different rate limits based on the route
// 	let rateLimitResponse;

// 	// Auth endpoints - strict limits
// 	if (path.startsWith('/api/auth/') || path.startsWith('/auth/')) {
// 		rateLimitResponse = await rateLimits.auth(event);
// 	}
// 	// AI endpoints - very strict limits
// 	else if (
// 		path.includes('/generate') ||
// 		path.includes('/synthesis') ||
// 		path.includes('/briefs/generate')
// 	) {
// 		rateLimitResponse = await rateLimits.ai(event);
// 	}
// 	// Write operations - moderate limits
// 	else if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(method)) {
// 		rateLimitResponse = await rateLimits.write(event);
// 	}
// 	// Read operations - generous limits
// 	else {
// 		rateLimitResponse = await rateLimits.read(event);
// 	}

// 	if (rateLimitResponse && rateLimitResponse.status === 429) {
// 		return rateLimitResponse;
// 	}

// 	return resolve(event);
// };

// Main handle for Supabase and session management
const handleSupabase: Handle = async ({ event, resolve }) => {
	// Create Supabase client with proper cookie handling per SvelteKit docs
	event.locals.supabase = createSupabaseServer({
		getAll: () => event.cookies.getAll(),
		setAll: (cookiesToSet) => {
			/**
			 * Note: SvelteKit requires the `path` variable to be set.
			 * Setting path to '/' replicates standard behavior.
			 * https://kit.svelte.dev/docs/types#public-types-cookies
			 */
			cookiesToSet.forEach(({ name, value, options }) => {
				event.cookies.set(name, value, {
					...options,
					path: '/'
				});
			});
		}
	});

	const timingEnabled =
		dev || (typeof process !== 'undefined' && process.env.PERF_TIMING === 'true');
	const slowThresholdRaw = typeof process !== 'undefined' ? process.env.PERF_SLOW_MS : undefined;
	const slowThreshold = slowThresholdRaw ? Number(slowThresholdRaw) : dev ? 200 : 400;
	const shouldLogSlow =
		timingEnabled &&
		(dev || (typeof process !== 'undefined' && process.env.PERF_LOG_SLOW === 'true'));

	event.locals.serverTiming = createServerTiming(timingEnabled);
	const timing = event.locals.serverTiming;
	const measure = <T>(name: string, fn: () => Promise<T> | T) =>
		timing ? timing.measure(name, fn) : fn();

	timing?.start('request');

	let sessionCache: {
		session: typeof event.locals.session;
		user: typeof event.locals.user;
	} | null = null;
	let sessionPromise: Promise<{
		session: typeof event.locals.session;
		user: typeof event.locals.user;
	}> | null = null;

	// PERFORMANCE: Skip session loading for static assets and API routes that don't need auth
	const pathname = event.url.pathname;
	const search = event.url.search;
	const legacyRedirectPath = getLegacyRedirectPath(pathname);
	const shouldRedirectToApexDomain = event.url.hostname === 'www.build-os.com';

	if (legacyRedirectPath || shouldRedirectToApexDomain) {
		const targetPath = `${legacyRedirectPath ?? pathname}${search}`;
		if (shouldRedirectToApexDomain) {
			throw redirect(308, `https://build-os.com${targetPath}`);
		}
		throw redirect(308, targetPath);
	}

	// Skip auth for static assets and certain API routes
	if (
		pathname.startsWith('/_app/') ||
		pathname.startsWith('/static/') ||
		pathname.startsWith('/api/webhooks/') || // Public webhooks
		pathname.startsWith('/webhooks/') || // Public webhooks at root level
		pathname === '/favicon.ico' ||
		pathname === '/robots.txt' ||
		pathname === '/sitemap.xml'
	) {
		// Set minimal locals for static requests
		event.locals.session = null;
		event.locals.user = null;
		event.locals.safeGetSession = async () => ({ session: null, user: null });
		event.locals.getCalendarTokens = async () => null;

		return resolve(event);
	}

	/**
	 * Unlike `supabase.auth.getSession()`, which returns the session _without_
	 * validating the JWT, this function also calls `getUser()` to validate the
	 * JWT before returning the session.
	 */
	event.locals.safeGetSession = async () => {
		if (sessionCache) {
			return sessionCache;
		}

		if (sessionPromise) {
			return sessionPromise;
		}

		const { supabase } = event.locals;

		sessionPromise = (async () => {
			try {
				// Check if explicitly logged out
				if (event.locals._explicitlyCleared === true) {
					return { session: null, user: null };
				}

				// Get session first (doesn't validate JWT)
				const {
					data: { session },
					error: sessionError
				} = await measure('auth.session', () => supabase.auth.getSession());

				if (sessionError || !session) {
					return { session: null, user: null };
				}

				// Validate JWT by calling getUser
				const {
					data: { user: authUser },
					error: userError
				} = await measure('auth.user', () => supabase.auth.getUser());

				if (userError || !authUser) {
					// JWT validation failed
					return { session: null, user: null };
				}

				// Get user data from public.users table
				const { data: userData, error: dbError } = await measure('db.user', () =>
					supabase.from('users').select('*').eq('id', authUser.id).single()
				);

				if (dbError) {
					// User exists in auth but not in public.users table
					// This is handled properly during registration/login
					console.error('User data not found for authenticated user:', authUser.id);
					return { session, user: null };
				}

				return {
					session,
					user: userData
				};
			} catch (error) {
				console.error('Error in safeGetSession:', error);
				return { session: null, user: null };
			}
		})();

		sessionCache = await sessionPromise;
		sessionPromise = null;
		if (sessionCache.session && sessionCache.user) {
			event.locals.session = sessionCache.session;
			event.locals.user = sessionCache.user;
		}
		return sessionCache;
	};

	// PERFORMANCE: Lazy calendar token loader - only when needed
	event.locals.getCalendarTokens = async () => {
		// Skip if no user ID available
		const userId = event.locals.user?.id;
		if (!userId) {
			return null;
		}

		// Skip for non-calendar routes to save time
		if (!pathname.includes('calendar') && !pathname.includes('task') && pathname !== '/') {
			return null;
		}

		try {
			// const timeoutPromise = new Promise<never>((_, reject) =>
			// 	setTimeout(() => reject(new Error('Calendar tokens timeout')), 2500)
			// );

			const tokensPromise = measure('db.calendar_tokens', () =>
				event.locals.supabase
					.from('user_calendar_tokens')
					.select(
						'access_token, refresh_token, expiry_date, scope, updated_at, token_type'
					)
					.eq('user_id', userId)
					.single()
			);

			// const { data: tokens, error } = await Promise.race([tokensPromise, timeoutPromise]);
			const { data: tokens, error } = await Promise.race([tokensPromise]);

			if (error || !tokens || !tokens.refresh_token) {
				return null;
			}

			const hasValidTokens = !!(tokens.access_token && tokens.refresh_token);
			const needsRefresh = tokens.expiry_date
				? tokens.expiry_date < Date.now() + 5 * 60 * 1000
				: false;

			return {
				access_token: tokens.access_token,
				refresh_token: tokens.refresh_token,
				expiry_date: tokens.expiry_date,
				scope: tokens.scope,
				updated_at: tokens.updated_at,
				token_type: tokens.token_type,
				hasValidTokens,
				needsRefresh
			};
		} catch (error) {
			console.error('Error fetching calendar tokens:', error);
			return null;
		}
	};

	// Initialize locals with default values
	event.locals.session = null;
	event.locals.user = null;
	event.locals._explicitlyCleared = false;

	// PERFORMANCE: Only load session data for routes that need it
	const needsAuth =
		!pathname.startsWith('/auth/') &&
		!pathname.startsWith('/api/auth/') &&
		!pathname.startsWith('/api/public/') &&
		pathname !== '/robots.txt' &&
		pathname !== '/sitemap.xml';

	if (needsAuth) {
		try {
			const sessionData = await event.locals.safeGetSession();

			if (sessionData.session && sessionData.user) {
				event.locals.session = sessionData.session;
				event.locals.user = sessionData.user;
			}
		} catch (error) {
			console.error('Error loading session in hooks:', error);
			// Continue with null session/user - don't throw
		}
	}

	const mutationGuardEnabled =
		CONSUMPTION_BILLING_GUARD_ENABLED &&
		shouldGuardMutationForConsumptionBilling(pathname, event.request.method);
	let mutationGuardUserId: string | null = null;
	let mutationCapability: FrozenMutationCapability | null = null;
	let postMutationGateRow: Record<string, unknown> | null = null;

	if (mutationGuardEnabled) {
		mutationCapability = classifyFrozenMutationCapability(pathname);
		const sessionData =
			event.locals.user && event.locals.session
				? { user: event.locals.user, session: event.locals.session }
				: await event.locals.safeGetSession();
		const user = sessionData.user;

		if (user && !user.is_admin) {
			mutationGuardUserId = user.id;

			const gateResult: any = await measure('db.consumption_gate_pre', () =>
				(event.locals.supabase as any).rpc('evaluate_user_consumption_gate', {
					p_user_id: user.id,
					p_project_limit: CONSUMPTION_BILLING_LIMITS.FREE_PROJECT_LIMIT,
					p_credit_limit: CONSUMPTION_BILLING_LIMITS.FREE_CREDIT_LIMIT
				})
			);
			const gateData = gateResult?.data;
			const gateError = gateResult?.error;

			if (gateError) {
				console.error('Failed to evaluate consumption billing gate (pre):', gateError);
			} else {
				const gateRow = Array.isArray(gateData) ? gateData[0] : gateData;
				const isFrozen = Boolean(
					(gateRow as { is_frozen?: boolean } | null | undefined)?.is_frozen
				);

				if (isFrozen) {
					const blockedCapability = mutationCapability ?? 'other_mutation';
					const frozenMessage =
						blockedCapability === 'ai_compute'
							? 'AI generation is paused until billing is activated. Your workspace remains readable.'
							: blockedCapability === 'workspace_write'
								? 'Editing is paused until billing is activated. Your workspace remains readable.'
								: 'Upgrade required to continue. Your workspace remains readable.';

					return json(
						{
							success: false,
							error: frozenMessage,
							code: 'UPGRADE_REQUIRED',
							read_only: true,
							blocked_capability: blockedCapability,
							activation_path: '/billing/activate',
							billing_state:
								(gateRow as { billing_state?: string } | null | undefined)
									?.billing_state ?? 'upgrade_required_frozen',
							billing_tier:
								(gateRow as { billing_tier?: string } | null | undefined)
									?.billing_tier ?? 'explorer',
							timestamp: new Date().toISOString()
						},
						{ status: 402 }
					);
				}
			}
		}
	}

	// PERFORMANCE: Resolve response with optimized headers
	// Only include essential headers in serialized responses
	const response = await resolve(event, {
		filterSerializedResponseHeaders: (name) => {
			// Only allow specific headers to be included in serialized responses
			return name === 'content-range' || name === 'x-supabase-api-version';
		}
	});

	if (mutationGuardEnabled && mutationGuardUserId && response.ok) {
		try {
			const gateResult: any = await measure('db.consumption_gate_post', () =>
				(event.locals.supabase as any).rpc('evaluate_user_consumption_gate', {
					p_user_id: mutationGuardUserId,
					p_project_limit: CONSUMPTION_BILLING_LIMITS.FREE_PROJECT_LIMIT,
					p_credit_limit: CONSUMPTION_BILLING_LIMITS.FREE_CREDIT_LIMIT
				})
			);
			if (gateResult?.error) {
				console.error(
					'Failed to evaluate consumption billing gate (post):',
					gateResult.error
				);
			} else {
				const row = Array.isArray(gateResult?.data) ? gateResult.data[0] : gateResult?.data;
				if (row && typeof row === 'object') {
					postMutationGateRow = row as Record<string, unknown>;
				}
			}
		} catch (error) {
			console.error('Failed to evaluate consumption billing gate (post):', error);
		}
	}

	if (
		mutationGuardEnabled &&
		mutationGuardUserId &&
		response.ok &&
		CONSUMPTION_AUTO_POWER_UPGRADE_ENABLED &&
		StripeService.isEnabled()
	) {
		const stillFrozen = Boolean(postMutationGateRow?.is_frozen);
		const billingTier =
			typeof postMutationGateRow?.billing_tier === 'string'
				? postMutationGateRow.billing_tier
				: null;
		const lifetimeCreditsUsed =
			typeof postMutationGateRow?.lifetime_credits_used === 'number'
				? postMutationGateRow.lifetime_credits_used
				: 0;
		const shouldCheckAutoUpgrade =
			!stillFrozen &&
			billingTier === 'pro' &&
			mutationCapability === 'ai_compute' &&
			lifetimeCreditsUsed >= CONSUMPTION_BILLING_LIMITS.PRO_INCLUDED_CREDITS;

		if (shouldCheckAutoUpgrade) {
			try {
				const adminSupabase = createAdminSupabaseClient();
				const stripeService = new StripeService(adminSupabase as any);
				const upgradeResult = await measure('billing.auto_upgrade_power', () =>
					stripeService.maybeAutoUpgradeToPowerTier(mutationGuardUserId, {
						proIncludedCredits: CONSUMPTION_BILLING_LIMITS.PRO_INCLUDED_CREDITS
					})
				);

				if (upgradeResult.upgraded) {
					console.info(
						`Auto-upgraded ${mutationGuardUserId} to Power at ${upgradeResult.currentCycleCredits} credits`
					);
				}
			} catch (error) {
				console.error('Failed auto-upgrade check (Pro -> Power):', error);
			}
		}
	}

	timing?.end('request');
	const timingHeader = timing?.toHeader();
	if (timingHeader) {
		response.headers.append('Server-Timing', timingHeader);
	}

	if (shouldLogSlow && slowThreshold > 0 && timing) {
		const slowMetrics = timing.getSlowMetrics(slowThreshold);
		if (slowMetrics.length > 0) {
			const summary = slowMetrics
				.map((metric) => `${metric.name}=${metric.dur.toFixed(1)}ms`)
				.join(' ');
			console.info(`[Perf] ${event.request.method} ${event.url.pathname} slow: ${summary}`);
		}
	}

	// PERFORMANCE: Set cache headers more efficiently
	if (pathname.startsWith('/auth/') || pathname.startsWith('/api/auth/')) {
		response.headers.set('Cache-Control', 'no-cache, no-store, must-revalidate');
	}

	return response;
};

// Export handle
export const handle = handleSupabase;

// PERFORMANCE: Optimized error handler with minimal logging overhead
export const handleError: HandleServerError = ({ error, event }) => {
	const errorId = Math.random().toString(36).substr(2, 9);
	const errorMessage = error instanceof Error ? error.message : String(error);

	if (dev) {
		console.error(`[${errorId}] Server error:`, {
			message: errorMessage,
			url: event.url.pathname,
			method: event.request.method,
			timestamp: new Date().toISOString(),
			userId: event.locals.user?.id
		});
	} else {
		// Minimal logging in production
		console.error(`[${errorId}] Error on ${event.url.pathname}:`, errorMessage);
	}

	return {
		message: dev ? errorMessage || 'Something went wrong' : 'Something went wrong',
		errorId
	};
};
