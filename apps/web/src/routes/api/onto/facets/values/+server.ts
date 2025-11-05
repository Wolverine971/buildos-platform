// apps/web/src/routes/api/onto/facets/values/+server.ts
/**
 * GET /api/onto/facets/values - Load facet taxonomy values
 */

import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';

export const GET: RequestHandler = async ({ locals }) => {
	try {
		const { user } = await locals.safeGetSession();
		if (!user) {
			return ApiResponse.unauthorized('Authentication required');
		}

		const supabase = locals.supabase;

		// Fetch all facet values from taxonomy
		const { data, error } = await supabase
			.from('onto_facet_values')
			.select('facet_key, value, label, description, color, sort_order')
			.order('facet_key')
			.order('sort_order');

		if (error) {
			console.error('[Facets] Failed to fetch facet values:', error);
			return ApiResponse.error('Failed to fetch facet values', 500);
		}

		return ApiResponse.success(data || []);
	} catch (err) {
		console.error('[Facets] Error fetching facet values:', err);
		return ApiResponse.internalError(err, 'Failed to fetch facet values');
	}
};
