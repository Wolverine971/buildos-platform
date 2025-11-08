// apps/web/src/routes/api/onto/templates/catalog-meta/+server.ts
/**
 * GET /api/onto/templates/catalog-meta?scope={scope}
 * Returns realm-level summaries for a given scope (progressive loading step 1).
 */

import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { getScopeCatalogMeta } from '$lib/services/ontology/template-catalog-meta.service';

export const GET: RequestHandler = async ({ url, locals }) => {
	try {
		const { user } = await locals.safeGetSession();
		if (!user) {
			return ApiResponse.unauthorized('Authentication required');
		}

		if (!user.is_admin) {
			return ApiResponse.forbidden('Admin access required');
		}

		const scope = url.searchParams.get('scope');
		if (!scope) {
			return ApiResponse.badRequest('scope query param is required');
		}

		const meta = await getScopeCatalogMeta(locals.supabase, scope);
		return ApiResponse.success(meta);
	} catch (err) {
		console.error('[Ontology] catalog-meta fetch failed:', err);
		return ApiResponse.internalError(err, 'Failed to load catalog metadata');
	}
};
