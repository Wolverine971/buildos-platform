// apps/web/src/routes/api/onto/templates/+server.ts
/**
 * GET /api/onto/templates - Fetch active ontology templates (existing)
 * POST /api/onto/templates - Create new template (NEW)
 */

import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { fetchTemplateCatalog } from '$lib/services/ontology/ontology-template-catalog.service';
import { TemplateCrudService } from '$lib/services/ontology/template-crud.service';
import { createAdminSupabaseClient } from '$lib/supabase/admin';

export const GET: RequestHandler = async ({ url, locals }) => {
	try {
		const { user } = await locals.safeGetSession();
		if (!user) {
			return ApiResponse.unauthorized('Authentication required');
		}

		const scope = url.searchParams.get('scope');
		const realm = url.searchParams.get('realm');
		const search = url.searchParams.get('search');
		const primitive = url.searchParams.get('primitive'); // e.g., "TEXT_DOCUMENT"
		const contexts = url.searchParams.getAll('context');
		const scales = url.searchParams.getAll('scale');
		const stages = url.searchParams.getAll('stage');
		const sort = url.searchParams.get('sort') ?? 'name';
		const directionParam = url.searchParams.get('direction');
		const direction =
			directionParam && directionParam.toLowerCase() === 'desc' ? 'desc' : 'asc';

		const { templates, groupedByRealm } = await fetchTemplateCatalog(locals.supabase, {
			scope,
			realm,
			search,
			primitive,
			contexts,
			scales,
			stages,
			sort,
			direction
		});

		return ApiResponse.success({
			templates,
			grouped: groupedByRealm,
			count: templates.length
		});
	} catch (err) {
		console.error('[Ontology] Failed to fetch templates:', err);
		return ApiResponse.error(
			err instanceof Error ? err.message : 'Failed to fetch templates',
			500
		);
	}
};

export const POST: RequestHandler = async ({ request, locals }) => {
	try {
		const { user } = await locals.safeGetSession();
		if (!user) {
			return ApiResponse.unauthorized('Authentication required');
		}

		// Check admin permission
		if (!user.is_admin) {
			return ApiResponse.forbidden('Admin access required');
		}

		// Parse request body
		const body = await request.json();

		// Validate required fields
		if (!body.type_key || !body.name || !body.scope) {
			return ApiResponse.badRequest('Missing required fields: type_key, name, scope');
		}

		// Use admin client for template creation
		const adminClient = createAdminSupabaseClient();

		// Create template using service
		const result = await TemplateCrudService.createTemplate(adminClient, {
			...body,
			created_by: user.id
		});

		if (!result.success) {
			if (result.validationErrors) {
				return ApiResponse.error(
					result.error || 'Validation failed',
					400,
					'VALIDATION_ERROR',
					{
						validationErrors: result.validationErrors
					}
				);
			}
			return ApiResponse.error(result.error || 'Failed to create template', 500);
		}

		return ApiResponse.created(result.data, 'Template created successfully');
	} catch (err) {
		console.error('[Ontology] Failed to create template:', err);
		return ApiResponse.internalError(err, 'Failed to create template');
	}
};
