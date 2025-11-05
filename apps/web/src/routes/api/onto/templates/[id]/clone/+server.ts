// apps/web/src/routes/api/onto/templates/[id]/clone/+server.ts
/**
 * POST /api/onto/templates/[id]/clone - Clone a template
 */

import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { TemplateCrudService } from '$lib/services/ontology/template-crud.service';
import { createAdminSupabaseClient } from '$lib/supabase/admin';

export const POST: RequestHandler = async ({ params, request, locals }) => {
	try {
		const { user } = await locals.safeGetSession();
		if (!user) {
			return ApiResponse.unauthorized('Authentication required');
		}

		// Check admin permission
		if (!user.is_admin) {
			return ApiResponse.forbidden('Admin access required');
		}

		const templateId = params.id;
		if (!templateId) {
			return ApiResponse.badRequest('Template ID is required');
		}

		// Parse request body
		const body = await request.json();
		const { type_key: newTypeKey, name: newName } = body;

		if (!newTypeKey || !newName) {
			return ApiResponse.badRequest('Missing required fields: type_key, name');
		}

		// Use admin client for template cloning
		const adminClient = createAdminSupabaseClient();

		// Clone template using service
		const result = await TemplateCrudService.cloneTemplate(
			adminClient,
			templateId,
			newTypeKey,
			newName,
			user.id
		);

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
			return ApiResponse.error(result.error || 'Failed to clone template', 500);
		}

		return ApiResponse.created(result.data, 'Template cloned successfully');
	} catch (err) {
		console.error('[Ontology] Failed to clone template:', err);
		return ApiResponse.internalError(err, 'Failed to clone template');
	}
};
