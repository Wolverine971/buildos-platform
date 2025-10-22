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
 *
 * ⚠️ WARNING: This client bypasses Row Level Security (RLS) policies
 * Only use in secure server-side contexts where the caller is trusted.
 *
 * **Use this for:**
 * - Background worker jobs (brief generation, SMS processing, etc.)
 * - Webhook handlers (Stripe, Twilio, etc.)
 * - Cron jobs and scheduled tasks
 * - Admin operations that need to access all user data
 * - Server scripts and batch operations
 *
 * **DO NOT use this for:**
 * - User-facing API endpoints (use createSupabaseServer instead)
 * - Client-side code (use createSupabaseBrowser instead)
 * - Any context where user input controls the query
 *
 * @returns TypedSupabaseClient configured with service role key
 * @throws Error if SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars are missing
 *
 * @example
 * ```typescript
 * // In a background worker
 * const supabase = createServiceClient();
 * await supabase.from('daily_briefs').insert({ ... });
 *
 * // In a webhook handler
 * const supabase = createServiceClient();
 * await supabase.from('users').update({ subscription_status: 'active' });
 * ```
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
 *
 * This client uses the anonymous (public) key and is safe for client-side use.
 * Authentication and RLS policies are properly enforced.
 *
 * **Use this for:**
 * - Client-side Svelte components (interactive, reactive code)
 * - Browser context where you have the public key
 * - Real-time subscriptions and realtime updates
 * - User-initiated queries that respect RLS policies
 *
 * **DO NOT use this for:**
 * - Server-side rendering contexts (use createSupabaseServer instead)
 * - Background jobs or workers (use createServiceClient instead)
 * - Operations that need to bypass RLS
 *
 * @param supabaseUrl Public Supabase URL
 * @param supabaseAnonKey Public anonymous key for the Supabase project
 * @returns TypedSupabaseClient configured with anonymous key and browser auth settings
 * @throws Error if URL or anonKey are not provided
 *
 * @example
 * ```typescript
 * // In a Svelte component
 * import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';
 * import { createSupabaseBrowser } from '@buildos/supabase-client';
 *
 * const supabase = createSupabaseBrowser(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY);
 * const { data: tasks } = await supabase.from('tasks').select('*');
 * ```
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
 *
 * This client uses the anonymous key with cookie-based auth persistence.
 * RLS policies are enforced based on the authenticated user's session.
 * Perfect for SvelteKit server-side contexts where you need user auth.
 *
 * **Use this for:**
 * - SvelteKit +page.server.ts load functions
 * - SvelteKit +layout.server.ts load functions
 * - API routes (+server.ts) that need authenticated user context
 * - User-initiated server-side operations (form submissions, etc.)
 * - Any SSR context where you have cookies and session info
 *
 * **DO NOT use this for:**
 * - Background jobs or workers (use createServiceClient instead)
 * - Client-side code (use createSupabaseBrowser instead)
 * - Operations that need to bypass RLS
 *
 * @param supabaseUrl Public Supabase URL
 * @param supabaseAnonKey Public anonymous key for the Supabase project
 * @param cookies SvelteKit cookies object for session persistence
 * @returns TypedSupabaseClient configured for server-side SSR usage
 * @throws Error if URL or anonKey are not provided
 *
 * @example
 * ```typescript
 * // In a +page.server.ts load function
 * import { createSupabaseServer } from '@buildos/supabase-client';
 *
 * export const load: PageServerLoad = async ({ locals, cookies }) => {
 *   const supabase = createSupabaseServer(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY, {
 *     getAll: () => cookies.getAll(),
 *     setAll: (cookiesToSet) => {
 *       cookiesToSet.forEach(({ name, value, options }) => {
 *         cookies.set(name, value, { ...options, path: '/' });
 *       });
 *     }
 *   });
 *
 *   const { data: projects } = await supabase.from('projects').select('*');
 *   return { projects };
 * };
 * ```
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
