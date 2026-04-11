// apps/web/src/routes/admin/security/+page.server.ts
import type { PageServerLoad } from './$types';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import {
	getAdminSecurityAnalysis,
	parseSecurityTimeframe
} from '$lib/server/admin-security-analysis';

export const load: PageServerLoad = async ({ url }) => {
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
