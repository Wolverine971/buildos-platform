// src/lib/utils/auth.ts
import { browser } from '$app/environment';

import { goto, invalidate, invalidateAll } from '$app/navigation';
import { createSupabaseBrowser } from '$lib/supabase';

export async function signOut(
	options: {
		redirectTo?: string;
		useServerEndpoint?: boolean;
		skipServerCall?: boolean;
		showToast?: boolean;
	} = {}
) {
	const {
		redirectTo = '/auth/login',
		useServerEndpoint = true,
		skipServerCall = false,
		showToast = true
	} = options;

	if (!browser) {
		console.warn('signOut called on server side');
		return;
	}

	try {
		console.log('Starting sign out process...');

		// Always try server endpoint first for proper cookie cleanup
		if (useServerEndpoint && !skipServerCall) {
			try {
				console.log('Attempting server-side logout...');

				const response = await fetch(
					`/auth/logout?api=true&redirect=${encodeURIComponent(redirectTo)}`,
					{
						method: 'POST',
						headers: {
							'Content-Type': 'application/json',
							'Cache-Control': 'no-cache',
							Pragma: 'no-cache'
						},
						credentials: 'include' // Ensure cookies are sent
					}
				);

				const result = await response.json();

				if (response.ok && result.success) {
					console.log('Server logout successful:', result);

					// Clear client-side Supabase instance
					const supabase = createSupabaseBrowser();
					await supabase.auth.signOut({ scope: 'local' });

					// Perform local cleanup
					await performLocalCleanup();

					// CRITICAL: Wait for server state to propagate
					await new Promise((resolve) => setTimeout(resolve, 200));

					// Force complete data refresh - this is the key!
					// Invalidate in a specific order to ensure auth state is cleared
					await invalidate('supabase:auth');
					await invalidate('app:auth');

					// Small delay to ensure invalidation completes
					await new Promise((resolve) => setTimeout(resolve, 100));

					// Now invalidate everything else
					await invalidateAll();

					// Another small delay before navigation
					await new Promise((resolve) => setTimeout(resolve, 100));

					// Navigate to the specified redirect location
					// Using replaceState and invalidateAll to force complete refresh
					await goto(result.redirectTo || redirectTo, {
						replaceState: true,
						invalidateAll: true
					});

					console.log('Logout and navigation completed');
					return;
				} else {
					console.warn('Server logout returned non-success:', result);
					throw new Error(result.error || `Server logout failed: ${response.status}`);
				}
			} catch (serverError) {
				console.warn('Server logout failed, falling back to client logout:', serverError);
				// Continue to client-side fallback
			}
		}

		// Fallback: Client-side logout
		console.log('Performing client-side logout fallback...');

		const supabase = createSupabaseBrowser();

		// Sign out from Supabase (both local and global)
		const { error } = await supabase.auth.signOut({ scope: 'global' });

		if (error) {
			console.error('Supabase signOut error:', error);
			// Continue with cleanup even if Supabase logout fails
		}

		// Comprehensive local cleanup
		await performLocalCleanup();

		// Try to hit the server logout endpoint directly to clear cookies
		try {
			await fetch('/auth/logout', {
				method: 'POST',
				credentials: 'include',
				headers: {
					'Cache-Control': 'no-cache'
				}
			});
		} catch (e) {
			console.warn('Failed to call server logout endpoint:', e);
		}

		// Wait for cleanup to propagate
		await new Promise((resolve) => setTimeout(resolve, 300));

		// Force complete data refresh
		await invalidate('supabase:auth');
		await invalidate('app:auth');
		await invalidateAll();

		// Wait before navigation
		await new Promise((resolve) => setTimeout(resolve, 200));

		// Navigate with forced invalidation
		await goto(redirectTo, {
			replaceState: true,
			invalidateAll: true
		});

		console.log('Client-side logout completed');
	} catch (error) {
		console.error('All logout methods failed:', error);

		// Last resort: force cleanup and hard redirect
		try {
			await performLocalCleanup();

			// Try one more server call to clear cookies
			await fetch('/auth/logout', {
				method: 'POST',
				credentials: 'include'
			}).catch(() => {});

			// Wait a bit
			await new Promise((resolve) => setTimeout(resolve, 500));

			// Force browser to clear auth state by reloading
			window.location.href = redirectTo;
		} catch (finalError) {
			console.error('Final fallback failed:', finalError);
			// Force page reload as absolute last resort
			window.location.href = redirectTo;
		}
	}
}

async function performLocalCleanup() {
	if (!browser) return;

	try {
		// Clear all Supabase-related storage
		const keysToRemove: string[] = [];

		// Collect localStorage keys
		for (let i = 0; i < localStorage.length; i++) {
			const key = localStorage.key(i);
			if (key && isAuthRelatedKey(key)) {
				keysToRemove.push(key);
			}
		}

		// Remove localStorage items
		keysToRemove.forEach((key) => {
			try {
				localStorage.removeItem(key);
				console.log('Removed localStorage key:', key);
			} catch (err) {
				console.warn('Failed to remove localStorage key:', key, err);
			}
		});

		// Clear sessionStorage
		const sessionKeysToRemove: string[] = [];

		for (let i = 0; i < sessionStorage.length; i++) {
			const key = sessionStorage.key(i);
			if (key && isAuthRelatedKey(key)) {
				sessionKeysToRemove.push(key);
			}
		}

		sessionKeysToRemove.forEach((key) => {
			try {
				sessionStorage.removeItem(key);
				console.log('Removed sessionStorage key:', key);
			} catch (err) {
				console.warn('Failed to remove sessionStorage key:', key, err);
			}
		});

		// Clear any indexed DB (Supabase might use it)
		if ('indexedDB' in window && window.indexedDB.databases) {
			try {
				const databases = await window.indexedDB.databases();
				for (const db of databases) {
					if (db.name?.includes('supabase') || db.name?.includes('auth')) {
						indexedDB.deleteDatabase(db.name);
						console.log('Deleted IndexedDB:', db.name);
					}
				}
			} catch (err) {
				console.warn('Failed to clear IndexedDB:', err);
			}
		}

		// Clear cookies accessible from JavaScript
		document.cookie.split(';').forEach((cookie) => {
			const eqPos = cookie.indexOf('=');
			const name = eqPos > -1 ? cookie.substr(0, eqPos).trim() : cookie.trim();
			if (isAuthRelatedKey(name)) {
				// Try to delete cookie with various path combinations
				const paths = ['/', '/auth', '/api', ''];
				const domains = [
					window.location.hostname,
					`.${window.location.hostname}`,
					'',
					'localhost'
				];

				paths.forEach((path) => {
					domains.forEach((domain) => {
						const cookieString = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=${path}; domain=${domain}; secure; samesite=lax`;
						document.cookie = cookieString;
						// Also try without domain
						document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=${path}; secure; samesite=lax`;
						// Try without secure flag for local development
						document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=${path}`;
					});
				});
				console.log('Attempted to clear cookie:', name);
			}
		});
	} catch (error) {
		console.error('Error during local cleanup:', error);
	}
}

function isAuthRelatedKey(key: string): boolean {
	const authPatterns = [
		'supabase',
		'sb-',
		'auth',
		'token',
		'session',
		'user',
		'login',
		'oauth',
		'refresh',
		'access',
		'provider'
	];

	const lowerKey = key.toLowerCase();
	return authPatterns.some((pattern) => lowerKey.includes(pattern));
}

// Simplified logout function for most use cases
export async function logout(redirectTo: string = '/auth/login') {
	return signOut({ redirectTo, showToast: true });
}

// Quick logout without server call (for situations where server might be unavailable)
export async function quickLogout(redirectTo: string = '/auth/login') {
	return signOut({ redirectTo, skipServerCall: true, useServerEndpoint: false });
}

// Force logout with hard refresh (nuclear option)
export async function forceLogout(redirectTo: string = '/auth/login') {
	if (!browser) return;

	try {
		// Try server logout with no waiting
		fetch('/auth/logout', {
			method: 'POST',
			credentials: 'include',
			headers: {
				'Cache-Control': 'no-cache',
				Pragma: 'no-cache'
			}
		}).catch(() => {});

		// Clear everything locally immediately
		await performLocalCleanup();

		// Don't wait, just reload
		window.location.href = redirectTo;
	} catch (error) {
		console.error('Force logout error:', error);
		window.location.href = redirectTo;
	}
}

// Force server state refresh
export async function forceAuthRefresh() {
	if (!browser) return;

	try {
		// Hit a simple endpoint to force server to check cookies
		await fetch('/api/health', {
			method: 'GET',
			credentials: 'include',
			headers: {
				'Cache-Control': 'no-cache',
				Pragma: 'no-cache'
			}
		});

		// Invalidate all auth-related data
		await invalidate('supabase:auth');
		await invalidate('app:auth');
		await invalidateAll();
	} catch (error) {
		console.error('Force auth refresh error:', error);
	}
}

// Check if user is authenticated
export async function checkAuthStatus() {
	if (!browser) return { isAuthenticated: false, user: null };

	try {
		const supabase = createSupabaseBrowser();
		const {
			data: { session },
			error
		} = await supabase.auth.getSession();

		if (error) {
			console.error('Error checking auth status:', error);
			return { isAuthenticated: false, user: null };
		}

		return {
			isAuthenticated: !!session,
			user: session?.user || null,
			session
		};
	} catch (error) {
		console.error('Failed to check auth status:', error);
		return { isAuthenticated: false, user: null };
	}
}
