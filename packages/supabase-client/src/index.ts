// packages/supabase-client/src/index.ts
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import {
	createBrowserClient as createSSRBrowserClient,
	createServerClient as createSSRServerClient
} from '@supabase/ssr';
import type { Database } from '@buildos/shared-types';

export type TypedSupabaseClient = SupabaseClient<Database>;

// Cookie types for SSR
export type CookieMethods = {
	name: string;
	value: string;
};

export type CookieMethodsServer = {
	getAll: () => CookieMethods[] | Promise<CookieMethods[]>;
	setAll?: (cookies: { name: string; value: string; options: any }[]) => void | Promise<void>;
};

/**
 * Create a Supabase client for server-side use with service role key (bypasses RLS)
 * Use this for background jobs, admin operations, and server scripts
 */
export function createServiceClient(): TypedSupabaseClient {
	const supabaseUrl = process.env.PUBLIC_SUPABASE_URL;
	const supabaseKey = process.env.PRIVATE_SUPABASE_SERVICE_KEY;

	if (!supabaseUrl || !supabaseKey) {
		throw new Error('Missing Supabase environment variables');
	}

	return createClient<Database>(supabaseUrl, supabaseKey, {
		auth: {
			autoRefreshToken: false,
			persistSession: false
		}
	});
}

/**
 * Create a Supabase browser client for SvelteKit/SSR applications
 * Use this in client-side components and browser contexts
 */
export function createSupabaseBrowser(
	supabaseUrl: string,
	supabaseAnonKey: string
): TypedSupabaseClient {
	if (!supabaseUrl || !supabaseAnonKey) {
		throw new Error('Missing public Supabase environment variables');
	}

	return createSSRBrowserClient<Database>(supabaseUrl, supabaseAnonKey, {
		auth: {
			flowType: 'pkce',
			autoRefreshToken: true,
			persistSession: true,
			detectSessionInUrl: true
		}
	}) as unknown as TypedSupabaseClient;
}

/**
 * Create a Supabase server client for SvelteKit/SSR server-side rendering
 * Use this in +page.server.ts, +layout.server.ts, and API routes
 */
export function createSupabaseServer(
	supabaseUrl: string,
	supabaseAnonKey: string,
	cookies: CookieMethodsServer
): TypedSupabaseClient {
	if (!supabaseUrl || !supabaseAnonKey) {
		throw new Error('Missing public Supabase environment variables');
	}

	return createSSRServerClient<Database>(supabaseUrl, supabaseAnonKey, {
		cookies,
		auth: {
			flowType: 'pkce',
			autoRefreshToken: false,
			persistSession: false,
			detectSessionInUrl: false
		}
	}) as unknown as TypedSupabaseClient;
}

/**
 * Create a custom Supabase client with provided credentials
 * Use this when you need full control over the client configuration
 */
export function createCustomClient(url: string, key: string): TypedSupabaseClient {
	return createClient<Database>(url, key);
}

/**
 * Helper function to get the correct base URL for redirects in SSR contexts
 * @param path Optional path to append to the base URL
 * @returns Full URL for redirect
 */
export function getRedirectURL(path: string = '', isDev: boolean = false): string {
	// Check if we're in a browser context
	if (typeof globalThis !== 'undefined' && 'window' in globalThis) {
		const win = (globalThis as any).window;
		return `${win.location.origin}${path}`;
	}

	// Server-side: use environment-specific base URL
	const baseUrl = isDev
		? 'http://localhost:5173' // Dev port
		: 'https://build-os.com'; // Production domain

	return `${baseUrl}${path}`;
}

// Re-export useful types
export type { Database } from '@buildos/shared-types';
export { createClient } from '@supabase/supabase-js';
