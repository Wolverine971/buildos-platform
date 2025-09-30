// apps/web/src/lib/supabase/index.ts
import { browser, dev } from '$app/environment';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';
import {
	createSupabaseBrowser as createBrowser,
	createSupabaseServer as createServer,
	getRedirectURL as getRedirect,
	type CookieMethodsServer
} from '@buildos/supabase-client';

// Re-export helper function with SvelteKit-specific dev flag
export function getRedirectURL(path: string = '') {
	return getRedirect(path, dev);
}

// Re-export browser client creator with environment variables
export const createSupabaseBrowser = () =>
	createBrowser(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY);

// Re-export server client creator with environment variables
export const createSupabaseServer = (cookies: CookieMethodsServer) =>
	createServer(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY, cookies);

/** Default client instance (safe on both sides) */
export const supabase = browser ? createSupabaseBrowser() : null;
