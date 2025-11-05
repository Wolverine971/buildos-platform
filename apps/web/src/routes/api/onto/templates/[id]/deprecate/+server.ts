// apps/web/src/routes/api/onto/templates/[id]/deprecate/+server.ts
/**
 * POST /api/onto/templates/[id]/deprecate - Deprecate template
 */

import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { TemplateCrudService } from '$lib/services/ontology/template-crud.service';
import { createAdminSupabaseClient } from '$lib/supabase/admin';

export const POST: RequestHandler = async ({ params, locals }) => {
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

		// Use admin client for template deprecation
		const adminClient = createAdminSupabaseClient();

		// Deprecate template using service
		const result = await TemplateCrudService.deprecateTemplate(adminClient, templateId);

		if (!result.success) {
			if (result.validationErrors) {
				return ApiResponse.error(
					result.error || 'Cannot deprecate template',
					400,
					'DEPRECATE_ERROR',
					{
						validationErrors: result.validationErrors
					}
				);
			}
			return ApiResponse.error(result.error || 'Failed to deprecate template', 500);
		}

		return ApiResponse.success(result.data, 'Template deprecated');
	} catch (err) {
		console.error('[Ontology] Failed to deprecate template:', err);
		return ApiResponse.internalError(err, 'Failed to deprecate template');
	}
};
