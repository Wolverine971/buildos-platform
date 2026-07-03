// apps/web/src/routes/+layout.ts
import { browser, dev } from '$app/environment';
import { injectAnalytics } from '@vercel/analytics/sveltekit';
import type { LayoutLoad } from './$types';

// Note: Speed Insights is injected in +layout.svelte with browser/dev guards
injectAnalytics({ mode: dev ? 'development' : 'production' });

export const load: LayoutLoad = async ({ data, depends, url }) => {
	depends('supabase:auth');

	const shouldCreateBrowserClient = browser && (Boolean(data.user) || url.pathname !== '/');
	const supabase = shouldCreateBrowserClient
		? (await import('$lib/supabase')).createSupabaseBrowser()
		: null;

	// Pass through server data
	return {
		...data,
		supabase
	};
};
