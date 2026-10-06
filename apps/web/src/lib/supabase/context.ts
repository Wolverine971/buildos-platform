// apps/web/src/lib/supabase/context.ts
import { getContext } from 'svelte';
import { browser } from '$app/environment';
import { createSupabaseBrowser } from './index';

export type BrowserSupabaseClient = ReturnType<typeof createSupabaseBrowser>;

/**
 * The browser Supabase client for a component. Call during component init (it reads context).
 *
 * The root layout provides the `supabase` context only when a client exists at first load, and
 * context can't be set later. A visitor who opens a public page signed out and then signs in
 * keeps that layout, so pages they reach afterwards have no context. Fall back to the browser
 * client: `createBrowserClient` keeps one client per tab, the same one `+layout.ts` creates.
 * Returns null during SSR or when the public env is missing.
 */
export function getSupabaseContext(): BrowserSupabaseClient | null {
	const fromContext = getContext<BrowserSupabaseClient | null | undefined>('supabase');
	if (fromContext) return fromContext;
	if (!browser) return null;
	try {
		return createSupabaseBrowser();
	} catch {
		return null;
	}
}
