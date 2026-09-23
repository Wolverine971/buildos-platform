// apps/web/src/routes/admin/security/+page.server.ts
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import {
	getAdminSecurityAnalysis,
	parseSecurityTimeframe
} from '$lib/server/admin-security-analysis';

export const load: PageServerLoad = async ({ url, locals }) => {
	// Checked here too: a __data.json request can skip the admin layout's load.
	if (!locals.user?.is_admin) throw error(403, 'Admin access required');

	const timeframe = parseSecurityTimeframe(url.searchParams.get('timeframe'));

	try {
		const supabase = createAdminSupabaseClient();
		const analysis = await getAdminSecurityAnalysis(supabase, timeframe);

		return {
			analysis,
			timeframe
		};
	} catch (error) {
		console.error('[Admin Security] Failed to load security analysis', error);
		return {
			analysis: null,
			timeframe,
			loadError: error instanceof Error ? error.message : 'Failed to load security analysis'
		};
	}
};
