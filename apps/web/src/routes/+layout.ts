// apps/web/src/routes/+layout.ts
import { browser } from '$app/environment';
import type { LayoutLoad } from './$types';

export const load: LayoutLoad = async ({ data, depends }) => {
	depends('supabase:auth');

	// Auth forms use server endpoints/actions, which set the session cookies before
	// navigating with invalidateAll. Load the SDK once that navigation returns a user,
	// rather than making every signed-out form wait for it before hydration.
	const shouldCreateBrowserClient = browser && Boolean(data.user);
	const supabase = shouldCreateBrowserClient
		? (await import('$lib/supabase')).createSupabaseBrowser()
		: null;

	// Pass through server data
	return {
		...data,
		supabase
	};
};
