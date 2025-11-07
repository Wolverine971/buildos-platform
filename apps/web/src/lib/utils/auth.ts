// apps/web/src/lib/utils/auth.ts
import { browser } from '$app/environment';
import { createSupabaseBrowser } from '$lib/supabase';

export const LOGOUT_REDIRECT_STORAGE_KEY = 'buildos:auth:logout-redirect';

/**
 * Sign the current user out across browser and server contexts.
 * Relies on the root layout's auth listener to handle navigation and invalidation.
 */
export async function logout(redirectTo: string = '/auth/login'): Promise<void> {
	if (!browser) return;

	const supabase = createSupabaseBrowser();

	try {
		sessionStorage.setItem(LOGOUT_REDIRECT_STORAGE_KEY, redirectTo);
	} catch (error) {
		console.warn('Unable to persist logout redirect target', error);
	}

	try {
		await supabase.auth.signOut({ scope: 'global' });
	} catch (error) {
		console.error('Supabase signOut error', error);
	}

	try {
		await fetch(`/auth/logout?api=true&redirect=${encodeURIComponent(redirectTo)}`, {
			method: 'POST',
			credentials: 'include',
			headers: {
				'Content-Type': 'application/json',
				'Cache-Control': 'no-store',
				Pragma: 'no-cache'
			}
		});
	} catch (error) {
		console.warn('Failed to notify server during logout', error);
	}
}

/**
 * Force refresh browser and server auth state.
 * Useful for debugging or recovering from stale sessions.
 */
export async function forceAuthRefresh(): Promise<void> {
	if (!browser) return;

	const supabase = createSupabaseBrowser();

	try {
		await supabase.auth.refreshSession();
	} catch (error) {
		console.warn('Supabase session refresh failed', error);
	}

	try {
		await fetch('/api/health', {
			method: 'GET',
			credentials: 'include',
			cache: 'no-store',
			headers: {
				'Cache-Control': 'no-store',
				Pragma: 'no-cache'
			}
		});
	} catch (error) {
		console.warn('Health check request failed during auth refresh', error);
	}
}
