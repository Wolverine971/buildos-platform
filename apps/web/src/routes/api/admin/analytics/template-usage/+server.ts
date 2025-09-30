// apps/web/src/routes/api/admin/analytics/template-usage/+server.ts
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';

export const GET: RequestHandler = async ({ locals: { supabase, safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) {
		return ApiResponse.unauthorized();
	}

	if (!user?.is_admin) {
		return ApiResponse.forbidden('Admin access required');
	}

	try {
		// Get project template usage
		const { data: projectUsage, error } = await supabase.from('project_daily_briefs').select(`
                template_id,
                project_brief_templates (
                    name
                )
            `);

		if (error) {
			return ApiResponse.databaseError(error);
		}

		// Count usage
		const templateCounts: Record<string, { name: string; count: number; type: string }> = {};

		// Process project templates
		projectUsage?.forEach((usage) => {
			const templateName = usage.project_brief_templates?.name || 'Default Project Template';
			const key = `project_${usage.template_id || 'default'}`;

			if (!templateCounts[key]) {
				templateCounts[key] = { name: templateName, count: 0, type: 'project' };
			}
			templateCounts[key].count++;
		});

		// Convert to array and sort by usage
		const templateStats = Object.values(templateCounts)
			.map((template) => ({
				template_name: template.name,
				usage_count: template.count,
				template_type: template.type
			}))
			.sort((a, b) => b.usage_count - a.usage_count);

		return ApiResponse.success(templateStats);
	} catch (error) {
		console.error('Error fetching template usage:', error);
		return ApiResponse.internalError(error, 'Failed to fetch template usage');
	}
};
