// src/lib/supabase/index.ts
import { createBrowserClient, createServerClient } from '@supabase/ssr';
import { browser, dev } from '$app/environment';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';

import type { Database } from '$lib/database.types';

// Helper function to get the correct base URL for redirects
export function getRedirectURL(path: string = '') {
	if (browser) {
		return `${window.location.origin}${path}`;
	}

	// Server-side: use SvelteKit's built-in dev flag
	const baseUrl = dev
		? 'http://localhost:5173' // Your dev port
		: 'https://build-os.com'; // Your production domain

	return `${baseUrl}${path}`;
}

export const createSupabaseBrowser = () =>
	createBrowserClient<Database>(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY, {
		auth: {
			flowType: 'pkce',
			autoRefreshToken: true,
			persistSession: true,
			detectSessionInUrl: true
		}
	});

export const createSupabaseServer = (cookies: {
	getAll: () => import('@supabase/ssr').Cookie[];
	setAll?: (c: import('@supabase/ssr').Cookie[]) => void;
}) =>
	createServerClient<Database>(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY, {
		cookies,
		auth: {
			flowType: 'pkce',
			autoRefreshToken: false,
			persistSession: false,
			detectSessionInUrl: false
		}
	});

/** Default (safe on both sides) */
export const supabase = browser ? createSupabaseBrowser() : null;
