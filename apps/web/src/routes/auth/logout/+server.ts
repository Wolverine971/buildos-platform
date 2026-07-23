// apps/web/src/routes/auth/logout/+server.ts
import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { dev } from '$app/environment';
import { ApiResponse, ErrorCode, HttpStatus } from '$lib/utils/api-response';
import { logRouteError, routeErrorResponse } from '$lib/server/route-error';
import {
	getSecurityEventLogOptions,
	getSecurityRequestContext,
	logSecurityEvent
} from '$lib/server/security-event-logger';
import { getSafeLocalRedirect } from '$lib/server/safe-redirect';

export const POST: RequestHandler = async (event) => {
	const {
		locals: { supabase, safeGetSession },
		cookies,
		url,
		platform,
		request
	} = event;
	const redirectTo = getSafeLocalRedirect(
		url.searchParams.get('redirect'),
		url.origin,
		'/auth/login'
	);
	const isApiCall = url.searchParams.get('api') === 'true';
	const { user } = await safeGetSession();
	const userId = user?.id;
	const requestContext = getSecurityRequestContext(request);
	const securityEventOptions = getSecurityEventLogOptions(platform);

	try {
		// Sign out from Supabase
		const { error } = await supabase.auth.signOut({ scope: 'global' });

		if (error) {
			await logSecurityEvent(
				{
					eventType: 'auth.logout.failed',
					category: 'auth',
					outcome: 'failure',
					severity: 'low',
					actorType: userId ? 'user' : 'anonymous',
					actorUserId: userId ?? null,
					reason: error.message,
					...requestContext,
					metadata: {
						redirectTo,
						isApiCall,
						authProviderErrorCode: error.code,
						authProviderStatus: error.status
					}
				},
				securityEventOptions
			);
			await logRouteError(event, error, {
				operation: 'auth_logout_signout',
				userId,
				severity: 'warning',
				metadata: {
					redirectTo,
					isApiCall
				}
			});
		}

		// Clear all Supabase-related cookies
		const allCookies = cookies.getAll();

		// Filter and clear Supabase cookies
		const supabaseCookies = allCookies.filter(
			(cookie) =>
				cookie.name.startsWith('sb-') ||
				cookie.name.includes('supabase') ||
				cookie.name.includes('-auth-token')
		);

		// Clear each Supabase cookie
		for (const cookie of supabaseCookies) {
			// Primary deletion method
			cookies.delete(cookie.name, { path: '/' });

			// Fallback: Set to empty with immediate expiry
			cookies.set(cookie.name, '', {
				path: '/',
				expires: new Date(0),
				maxAge: 0,
				httpOnly: true,
				secure: true,
				sameSite: 'lax'
			});
		}

		// Verify cookies were cleared in development
		if (dev) {
			const remainingCookies = cookies.getAll();
			const hasSupabaseCookies = remainingCookies.some((c) => c.name.startsWith('sb-'));

			if (hasSupabaseCookies) {
				console.warn(
					'Warning: Some Supabase cookies may still remain:',
					remainingCookies.filter((c) => c.name.startsWith('sb-')).map((c) => c.name)
				);
			}
		}

		if (!error) {
			await logSecurityEvent(
				{
					eventType: 'auth.logout.succeeded',
					category: 'auth',
					outcome: 'success',
					severity: 'info',
					actorType: userId ? 'user' : 'anonymous',
					actorUserId: userId ?? null,
					...requestContext,
					metadata: {
						redirectTo,
						isApiCall
					}
				},
				securityEventOptions
			);
		}

		// For API calls, return JSON response
		if (isApiCall) {
			return ApiResponse.success({ redirectTo }, 'Logged out successfully');
		}

		// For regular calls, redirect
		throw redirect(303, redirectTo);
	} catch (error) {
		// If it's a redirect, re-throw it
		if (error instanceof Response) {
			throw error;
		}

		await logSecurityEvent(
			{
				eventType: 'auth.logout.error',
				category: 'auth',
				outcome: 'failure',
				severity: 'medium',
				actorType: userId ? 'user' : 'anonymous',
				actorUserId: userId ?? null,
				reason: error instanceof Error ? error.message : 'logout_error',
				...requestContext,
				metadata: {
					redirectTo,
					isApiCall
				}
			},
			securityEventOptions
		);

		if (isApiCall) {
			return routeErrorResponse(event, error, {
				operation: 'auth_logout',
				userId,
				message: 'Logout failed',
				status: HttpStatus.INTERNAL_SERVER_ERROR,
				code: ErrorCode.INTERNAL_ERROR,
				details: { redirectTo },
				metadata: {
					redirectTo,
					isApiCall
				}
			});
		}

		// Fallback redirect even on error
		throw redirect(303, redirectTo);
	}
};

// Also handle GET requests for direct navigation
export const GET: RequestHandler = async (event) => {
	// Delegate to POST handler
	return POST(event);
};
