// apps/web/src/lib/utils/auth.ts
import { browser } from '$app/environment';
import { clearOnboardingDrafts } from '$lib/utils/onboarding-state';

export const LOGOUT_REDIRECT_STORAGE_KEY = 'buildos:auth:logout-redirect';
const PUSH_DEACTIVATION_TIMEOUT_MS = 1500;

type BrowserSupabase = ReturnType<typeof import('$lib/supabase').createSupabaseBrowser>;

/**
 * Stop this browser's push notifications for the signed-out account: deactivate
 * its push_subscriptions row and drop the browser subscription, so the next
 * account on this device neither receives them nor sees push as already on.
 * Uses getRegistration() rather than `ready`, which never settles when no
 * service worker was registered.
 */
async function deactivateThisDevicePush(supabase: BrowserSupabase): Promise<void> {
	if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
	const registration = await navigator.serviceWorker.getRegistration();
	const subscription = await registration?.pushManager?.getSubscription();
	if (!subscription) return;

	const { error } = await supabase
		.from('push_subscriptions')
		.update({ is_active: false })
		.eq('endpoint', subscription.endpoint);
	if (error) {
		console.warn('Failed to deactivate push subscription on logout', error);
	}
	await subscription.unsubscribe();
}

/**
 * Sign the current user out across browser and server contexts.
 * Relies on the root layout's auth listener to handle navigation and invalidation.
 */
export async function logout(redirectTo: string = '/auth/login'): Promise<void> {
	if (!browser) return;
	clearOnboardingDrafts();

	const { createSupabaseBrowser } = await import('$lib/supabase');
	const supabase = createSupabaseBrowser();

	try {
		sessionStorage.setItem(LOGOUT_REDIRECT_STORAGE_KEY, redirectTo);
	} catch (error) {
		console.warn('Unable to persist logout redirect target', error);
	}

	// Must run while the session is still valid (RLS on push_subscriptions), and
	// must never hold up sign-out.
	await Promise.race([
		deactivateThisDevicePush(supabase).catch((error) =>
			console.warn('Unable to deactivate push notifications for this device', error)
		),
		new Promise<void>((resolve) => setTimeout(resolve, PUSH_DEACTIVATION_TIMEOUT_MS))
	]);

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

	const { createSupabaseBrowser } = await import('$lib/supabase');
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
