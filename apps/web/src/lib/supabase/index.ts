/**
 * Supabase Client Factory for BuildOS Web App
 *
 * This module exports Supabase client creators configured with the correct environment variables.
 * Choose the right client type based on your context:
 *
 * ## Decision Tree
 *
 * **Am I in a Svelte component (.svelte file)?**
 * → Use `createSupabaseBrowser()` or the `supabase` global
 *
 * **Am I in a +page.server.ts, +layout.server.ts, or API route (+server.ts)?**
 * → Use `createSupabaseServer(cookies)`
 *
 * **Am I in a background worker or webhook handler?**
 * → Use `createAdminSupabaseClient()` from ./admin.ts
 *
 * ## Client Comparison
 *
 * | Client | Key Type | RLS | Auth | Use Case |
 * |--------|----------|-----|------|----------|
 * | createSupabaseBrowser() | Anonymous (public) | ✅ Enforced | User session | Svelte components |
 * | createSupabaseServer() | Anonymous (public) | ✅ Enforced | User session | Server load functions, API routes |
 * | createAdminSupabaseClient() | Service Role | ❌ Bypassed | None | Workers, webhooks, cron jobs |
 *
 * ## Security Notes
 *
 * - **Never** use createAdminSupabaseClient() with user input
 * - **Always** use createSupabaseServer() for authenticated API routes
 * - **Always** validate webhook signatures before using admin client
 * - The `supabase` global is a browser-only singleton - check `if (supabase)` in SSR contexts
 *
 * @see createAdminSupabaseClient in ./admin.ts for service role usage
 * @see @buildos/supabase-client package for implementation details
 */

import { browser, dev } from '$app/environment';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';
import {
	createSupabaseBrowser as createBrowser,
	createSupabaseServer as createServer,
	getRedirectURL as getRedirect,
	type CookieMethodsServer
} from '@buildos/supabase-client';

/**
 * Get the redirect URL for OAuth callbacks in dev or production
 * @param path Optional path to append (e.g., '/auth/callback')
 * @returns Full URL for redirects
 */
export function getRedirectURL(path: string = '') {
	return getRedirect(path, dev);
}

/**
 * Create a browser Supabase client with public environment variables
 * Safe for use in Svelte components - enforces RLS and user authentication
 *
 * @returns TypedSupabaseClient configured for browser usage
 */
export const createSupabaseBrowser = () =>
	createBrowser(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY);

/**
 * Create a server Supabase client with proper cookie handling for SSR
 * Use in +page.server.ts, +layout.server.ts, and API routes with user context
 *
 * @param cookies SvelteKit cookies object for session persistence
 * @returns TypedSupabaseClient configured for server-side rendering
 */
export const createSupabaseServer = (cookies: CookieMethodsServer) =>
	createServer(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY, cookies);

/**
 * Default browser client instance (only available in browser context)
 *
 * ⚠️ Always check if this is null before using in SSR contexts:
 * ```typescript
 * import { supabase } from '$lib/supabase';
 * if (supabase) {
 *   // Browser context
 * }
 * ```
 */
export const supabase = browser ? createSupabaseBrowser() : null;
