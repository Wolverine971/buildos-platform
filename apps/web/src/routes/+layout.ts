// apps/web/src/routes/+layout.ts
import { browser } from '$app/environment';
import { createSupabaseBrowser } from '$lib/supabase';
import { dev } from '$app/environment';
import { injectAnalytics } from '@vercel/analytics/sveltekit';

// Note: Speed Insights is injected in +layout.svelte with browser/dev guards
injectAnalytics({ mode: dev ? 'development' : 'production' });

export const load = async ({ data, depends }: { data: any; depends: (dep: string) => void }) => {
	depends('supabase:auth');

	// Pass through server data
	return {
		...data,
		// Create browser client if needed
		supabase: browser ? createSupabaseBrowser() : null
	};
};
