// apps/web/src/routes/auth/logout/+server.ts
import { json, redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { dev } from '$app/environment';

export const POST: RequestHandler = async ({ locals: { supabase }, cookies, url }) => {
	const redirectTo = url.searchParams.get('redirect') || '/auth/login';
	const isApiCall = url.searchParams.get('api') === 'true';

	try {
		// Sign out from Supabase
		const { error } = await supabase.auth.signOut({ scope: 'global' });

		if (error) {
			console.error('Supabase signOut error:', error);
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

		// For API calls, return JSON response
		if (isApiCall) {
			return json({
				success: true,
				redirectTo,
				message: 'Logged out successfully'
			});
		}

		// For regular calls, redirect
		throw redirect(303, redirectTo);
	} catch (error) {
		// If it's a redirect, re-throw it
		if (error instanceof Response) {
			throw error;
		}

		console.error('Logout error:', error);

		if (isApiCall) {
			return json(
				{
					success: false,
					error: 'Logout failed',
					redirectTo
				},
				{ status: 500 }
			);
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
