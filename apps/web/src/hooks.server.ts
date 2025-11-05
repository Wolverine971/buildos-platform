// apps/web/src/hooks.server.ts
import type { Handle, HandleServerError } from '@sveltejs/kit';
import { createSupabaseServer } from '$lib/supabase';
import { dev } from '$app/environment';
// import { rateLimits } from '$lib/middleware/rate-limiter';

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

	// PERFORMANCE: Skip session loading for static assets and API routes that don't need auth
	const pathname = event.url.pathname;

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
		const { supabase } = event.locals;

		try {
			// Check if explicitly logged out
			if (event.locals._explicitlyCleared === true) {
				return { session: null, user: null };
			}

			// Get session first (doesn't validate JWT)
			const {
				data: { session },
				error: sessionError
			} = await supabase.auth.getSession();

			if (sessionError || !session) {
				return { session: null, user: null };
			}

			// Validate JWT by calling getUser
			const {
				data: { user: authUser },
				error: userError
			} = await supabase.auth.getUser();

			if (userError || !authUser) {
				// JWT validation failed
				return { session: null, user: null };
			}

			// Get user data from public.users table
			const { data: userData, error: dbError } = await supabase
				.from('users')
				.select('*')
				.eq('id', authUser.id)
				.single();

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
	};

	// PERFORMANCE: Lazy calendar token loader - only when needed
	event.locals.getCalendarTokens = async () => {
		// Skip if no user ID available
		if (!event.locals.user?.id) {
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

			const tokensPromise = event.locals.supabase
				.from('user_calendar_tokens')
				.select('access_token, refresh_token, expiry_date, scope, updated_at, token_type')
				.eq('user_id', event.locals.user.id)
				.single();

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

	// PERFORMANCE: Resolve response with optimized headers
	// Only include essential headers in serialized responses
	const response = await resolve(event, {
		filterSerializedResponseHeaders: (name) => {
			// Only allow specific headers to be included in serialized responses
			return name === 'content-range' || name === 'x-supabase-api-version';
		}
	});

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
		message: errorMessage || 'Something went wrong',
		errorId
	};
};
