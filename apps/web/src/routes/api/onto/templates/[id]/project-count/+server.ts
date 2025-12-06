// apps/web/src/routes/api/onto/templates/[id]/project-count/+server.ts
/**
 * GET /api/onto/templates/[id]/project-count
 * Get the count of projects using a template (for delete confirmation)
 */

import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { TemplateCrudService } from '$lib/services/ontology/template-crud.service';
import { createAdminSupabaseClient } from '$lib/supabase/admin';

export const GET: RequestHandler = async ({ params, locals }) => {
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

		// Use admin client to check project count
		const adminClient = createAdminSupabaseClient();

		const result = await TemplateCrudService.getTemplateProjectCount(adminClient, templateId);

		if (!result.success) {
			return ApiResponse.error(result.error || 'Failed to get project count', 500);
		}

		return ApiResponse.success(result.data);
	} catch (err) {
		console.error('[Ontology] Failed to get template project count:', err);
		return ApiResponse.internalError(err, 'Failed to get project count');
	}
};
