// apps/web/src/routes/+layout.ts
import { browser } from '$app/environment';
import { createSupabaseBrowser } from '$lib/supabase';
import { injectSpeedInsights } from '@vercel/speed-insights/sveltekit';
import { dev } from '$app/environment';
import { injectAnalytics } from '@vercel/analytics/sveltekit';

injectSpeedInsights();
injectAnalytics({ mode: dev ? 'development' : 'production' });

export const load = async ({ data, depends }) => {
	depends('supabase:auth');

	// Pass through server data
	return {
		...data,
		// Create browser client if needed
		supabase: browser ? createSupabaseBrowser() : null
	};
};
