// apps/web/src/routes/api/onto/templates/catalog-cascade/+server.ts
/**
 * GET /api/onto/templates/catalog-cascade?scope={scope}&realm={realm}
 * Returns domain/deliverable/variant lists plus lightweight template data.
 */

import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { getCatalogCascade } from '$lib/services/ontology/template-catalog-meta.service';

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
		const realm = url.searchParams.get('realm');

		if (!scope || !realm) {
			return ApiResponse.badRequest('scope and realm query params are required');
		}

		const cascade = await getCatalogCascade(locals.supabase, scope, realm);
		return ApiResponse.success(cascade);
	} catch (err) {
		console.error('[Ontology] catalog-cascade fetch failed:', err);
		return ApiResponse.internalError(err, 'Failed to load catalog cascade');
	}
};
