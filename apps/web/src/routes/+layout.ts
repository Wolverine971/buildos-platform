// apps/web/src/routes/+layout.ts
import { browser } from '$app/environment';
import type { LayoutLoad } from './$types';

export const load: LayoutLoad = async ({ data, depends, url }) => {
	depends('supabase:auth');

	const shouldCreateBrowserClient =
		browser && (Boolean(data.user) || url.pathname.startsWith('/auth/'));
	const supabase = shouldCreateBrowserClient
		? (await import('$lib/supabase')).createSupabaseBrowser()
		: null;

	// Pass through server data
	return {
		...data,
		supabase
	};
};
