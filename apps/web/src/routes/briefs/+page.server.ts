// apps/web/src/routes/briefs/+page.server.ts

import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ parent, url }) => {
	const { user } = await parent();
	if (!user) {
		throw redirect(
			303,
			`/auth/login?redirect=${encodeURIComponent(url.pathname + url.search)}`
		);
	}

	// Only return minimal data needed for initial render
	// Don't fetch briefs here - we'll do it client-side with proper timezone
	return {
		user,
		// Parse URL params but don't fetch data yet
		initialDate: url.searchParams.get('date') || null,
		initialView: url.searchParams.get('view') || 'single'
	};
};
