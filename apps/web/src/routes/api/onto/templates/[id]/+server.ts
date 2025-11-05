// apps/web/src/routes/api/onto/templates/[id]/+server.ts
/**
 * PUT /api/onto/templates/[id] - Update template
 * DELETE /api/onto/templates/[id] - Delete/deprecate template
 */

import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { TemplateCrudService } from '$lib/services/ontology/template-crud.service';
import { createAdminSupabaseClient } from '$lib/supabase/admin';

export const PUT: RequestHandler = async ({ params, request, locals }) => {
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

		// Use admin client for template updates
		const adminClient = createAdminSupabaseClient();

		// Update template using service
		const result = await TemplateCrudService.updateTemplate(adminClient, {
			id: templateId,
			...body
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
			return ApiResponse.error(result.error || 'Failed to update template', 500);
		}

		return ApiResponse.success(result.data, 'Template updated successfully');
	} catch (err) {
		console.error('[Ontology] Failed to update template:', err);
		return ApiResponse.internalError(err, 'Failed to update template');
	}
};

export const DELETE: RequestHandler = async ({ params, locals }) => {
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

		// Use admin client for template deletion
		const adminClient = createAdminSupabaseClient();

		// Delete template using service
		const result = await TemplateCrudService.deleteTemplate(adminClient, templateId);

		if (!result.success) {
			if (result.validationErrors) {
				return ApiResponse.error(
					result.error || 'Cannot delete template',
					400,
					'DELETE_ERROR',
					{
						validationErrors: result.validationErrors
					}
				);
			}
			return ApiResponse.error(result.error || 'Failed to delete template', 500);
		}

		return ApiResponse.success(null, 'Template deleted successfully');
	} catch (err) {
		console.error('[Ontology] Failed to delete template:', err);
		return ApiResponse.internalError(err, 'Failed to delete template');
	}
};
