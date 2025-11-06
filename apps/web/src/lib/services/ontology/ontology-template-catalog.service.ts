// apps/web/src/lib/services/ontology/ontology-template-catalog.service.ts
/**
 * Shared logic for fetching and filtering ontology template catalogs.
 */

import type { TypedSupabaseClient } from '@buildos/supabase-client';
import type { Template } from '$lib/types/onto';
import {
	getTextDocumentTemplates,
	getAvailableTemplates
} from '$lib/services/ontology/template-resolver.service';

export type TemplateCatalogDirection = 'asc' | 'desc';

export interface TemplateCatalogParams {
	scope?: string | null;
	realm?: string | null;
	search?: string | null;
	primitive?: string | null;
	contexts?: string[];
	scales?: string[];
	stages?: string[];
	sort?: string | null;
	direction?: TemplateCatalogDirection | null;
}

export interface TemplateCatalogResult {
	templates: Template[];
	groupedByRealm: Record<string, Template[]>;
}

export async function fetchTemplateCatalog(
	client: TypedSupabaseClient,
	{
		scope,
		realm,
		search,
		primitive,
		contexts = [],
		scales = [],
		stages = [],
		sort = 'name',
		direction = 'asc'
	}: TemplateCatalogParams
): Promise<TemplateCatalogResult> {
	let templates: Template[] = [];
	const normalizedDirection: TemplateCatalogDirection =
		(direction ?? 'asc').toLowerCase() === 'desc' ? 'desc' : 'asc';

	if (primitive === 'TEXT_DOCUMENT' && scope === 'output') {
		templates = await getTextDocumentTemplates(client);
	} else if (scope) {
		templates = await getAvailableTemplates(client, scope, false);

		if (realm) {
			templates = templates.filter((t) => t.metadata?.realm === realm);
		}

		if (contexts.length) {
			const contextSet = new Set(contexts);
			templates = templates.filter((t) =>
				contextSet.has((t.facet_defaults?.context as string | undefined) ?? '')
			);
		}

		if (scales.length) {
			const scaleSet = new Set(scales);
			templates = templates.filter((t) =>
				scaleSet.has((t.facet_defaults?.scale as string | undefined) ?? '')
			);
		}

		if (stages.length) {
			const stageSet = new Set(stages);
			templates = templates.filter((t) =>
				stageSet.has((t.facet_defaults?.stage as string | undefined) ?? '')
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
		const { data, error } = await client.rpc('get_template_catalog', {
			p_scope: scope ?? undefined,
			p_realm: realm ?? undefined,
			p_search: search ?? undefined
		});

		if (error) {
			throw new Error(error.message);
		}

		templates = (data ?? []) as Template[];
	}

	const sorted = sortTemplates(templates, sort ?? 'name', normalizedDirection);
	const groupedByRealm = sorted.reduce(
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

	return {
		templates: sorted,
		groupedByRealm
	};
}

export function sortTemplates(
	templates: Template[],
	sort: string,
	direction: TemplateCatalogDirection
): Template[] {
	const sorted = [...templates];
	const factor = direction === 'desc' ? -1 : 1;

	const getValue = (template: Template) => {
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
		if (aValue === bValue) return 0;
		return aValue > bValue ? factor : -factor;
	});

	return sorted;
}
