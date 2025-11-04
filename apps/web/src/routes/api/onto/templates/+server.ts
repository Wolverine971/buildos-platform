// apps/web/src/routes/api/onto/templates/+server.ts
/**
 * GET /api/onto/templates
 * Fetch active ontology templates for discovery with optional filters
 */

import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import {
	getTextDocumentTemplates,
	getAvailableTemplates
} from '$lib/services/ontology/template-resolver.service';
import type { Template } from '$lib/types/onto';

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
		const direction =
			(url.searchParams.get('direction') ?? 'asc').toLowerCase() === 'desc' ? 'desc' : 'asc';

		let templates: any[];

		const supabase = locals.supabase;

		// If requesting text documents specifically, use the specialized function
		if (primitive === 'TEXT_DOCUMENT' && scope === 'output') {
			templates = await getTextDocumentTemplates(supabase);
		} else if (scope) {
			// Get all templates for a scope (non-abstract by default)
			templates = await getAvailableTemplates(supabase, scope, false);

			// Apply additional filters
			if (realm) {
				templates = templates.filter((t) => t.metadata?.realm === realm);
			}

			if (contexts.length) {
				templates = templates.filter((t) =>
					contexts.includes((t.facet_defaults?.context as string | undefined) ?? '')
				);
			}

			if (scales.length) {
				templates = templates.filter((t) =>
					scales.includes((t.facet_defaults?.scale as string | undefined) ?? '')
				);
			}

			if (stages.length) {
				templates = templates.filter((t) =>
					stages.includes((t.facet_defaults?.stage as string | undefined) ?? '')
				);
			}

			if (primitive) {
				templates = templates.filter((t) => t.metadata?.primitive === primitive);
			}

			if (search) {
				const searchLower = search.toLowerCase();
				templates = templates.filter(
					(t) =>
						t.name.toLowerCase().includes(searchLower) ||
						t.type_key.toLowerCase().includes(searchLower) ||
						(t.metadata?.description &&
							t.metadata.description.toLowerCase().includes(searchLower))
				);
			}
		} else {
			// No scope specified - fall back to RPC
			const supabase = locals.supabase;
			const { data, error: rpcError } = await supabase.rpc('get_template_catalog', {
				p_scope: scope ?? undefined,
				p_realm: realm ?? undefined,
				p_search: search ?? undefined
			});

			if (rpcError) {
				console.error('[Ontology] Failed to fetch templates via RPC:', rpcError);
				return ApiResponse.error(`Failed to fetch templates: ${rpcError.message}`, 500);
			}

			templates = (data ?? []) as Template[];
		}

		const sorted = sortTemplates(templates, sort, direction);

		const grouped = sorted.reduce(
			(acc, template) => {
				const templateRealm = template.metadata?.realm ?? 'other';
				if (!acc[templateRealm]) {
					acc[templateRealm] = [];
				}
				acc[templateRealm].push(template);
				return acc;
			},
			{} as Record<string, Template[]>
		);

		return ApiResponse.success({
			templates: sorted,
			grouped,
			count: sorted.length
		});
	} catch (err) {
		console.error('[Ontology] Failed to fetch templates:', err);
		return ApiResponse.error(
			err instanceof Error ? err.message : 'Failed to fetch templates',
			500
		);
	}
};

function sortTemplates(templates: any[], sort: string, direction: 'asc' | 'desc') {
	const sorted = [...templates];
	const factor = direction === 'desc' ? -1 : 1;

	const getValue = (template: any) => {
		switch (sort) {
			case 'type_key':
				return template.type_key ?? '';
			case 'realm':
				return template.metadata?.realm ?? '';
			case 'scope':
				return template.scope ?? '';
			case 'status':
				return template.status ?? '';
			case 'name':
			default:
				return template.name ?? '';
		}
	};

	sorted.sort((a, b) => {
		const aValue = getValue(a);
		const bValue = getValue(b);

		if (typeof aValue === 'number' && typeof bValue === 'number') {
			return (aValue - bValue) * factor;
		}

		const aString = String(aValue).toLowerCase();
		const bString = String(bValue).toLowerCase();

		if (aString === bString) return 0;
		return aString > bString ? factor : -factor;
	});

	return sorted;
}
