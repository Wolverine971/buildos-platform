// apps/web/src/routes/api/onto/templates/by-type/[type_key]/+server.ts
/**
 * GET /api/onto/templates/[type_key]
 * Returns resolved template metadata (schema, FSM, inheritance chain, children)
 */

import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import {
	resolveTemplateWithClient,
	getAvailableTemplates
} from '$lib/services/ontology/template-resolver.service';

export const GET: RequestHandler = async ({ params, url, locals }) => {
	try {
		const { user } = await locals.safeGetSession();
		if (!user) {
			return ApiResponse.unauthorized('Authentication required');
		}

		const typeKey = params.type_key;
		if (!typeKey) {
			return ApiResponse.badRequest('Template type_key required');
		}

		const scopeParam = url.searchParams.get('scope') ?? undefined;
		const includeAbstract = url.searchParams.get('includeAbstract') === 'true';

		const supabase = locals.supabase;

		const resolved = await resolveTemplateWithClient(supabase, typeKey, scopeParam);

		// Find child templates (direct descendants)
		const { data: childRows, error: childError } = await supabase
			.from('onto_templates')
			.select('id, name, type_key, scope, status, is_abstract, metadata')
			.eq('parent_template_id', resolved.id)
			.order('name');

		if (childError) {
			console.error('[Ontology] Failed to fetch child templates:', childError);
			return ApiResponse.error(`Failed to fetch child templates: ${childError.message}`, 500);
		}

		// Optionally gather siblings within same scope for navigation
		const siblings =
			scopeParam && resolved.parent_template_id
				? await getAvailableTemplates(supabase, scopeParam, includeAbstract)
				: [];

		return ApiResponse.success({
			template: resolved,
			children: childRows ?? [],
			siblings: siblings.filter(
				(tpl) => tpl.parent_template_id === resolved.parent_template_id
			),
			is_admin: Boolean(user.is_admin)
		});
	} catch (err) {
		console.error('[Ontology] Template detail failed:', err);
		return ApiResponse.error(
			err instanceof Error ? err.message : 'Failed to resolve template',
			500
		);
	}
};
