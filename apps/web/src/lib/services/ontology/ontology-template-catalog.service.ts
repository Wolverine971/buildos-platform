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
import type { ResolvedTemplate } from '$lib/services/ontology/template-resolver.service';

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
	templates: ResolvedTemplate[];
	groupedByRealm: Record<string, ResolvedTemplate[]>;
}

const getMetadataString = (template: ResolvedTemplate, key: string): string | undefined =>
	template.metadata?.[key] as string | undefined;

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
	let templates: ResolvedTemplate[] = [];
	const normalizedDirection: TemplateCatalogDirection =
		(direction ?? 'asc').toLowerCase() === 'desc' ? 'desc' : 'asc';

	// Normalize empty strings to null for proper filtering
	const normalizedScope = scope?.trim() || null;
	const normalizedRealm = realm?.trim() || null;
	const normalizedSearch = search?.trim() || null;
	const normalizedPrimitive = primitive?.trim() || null;

	if (normalizedPrimitive === 'TEXT_DOCUMENT' && normalizedScope === 'output') {
		templates = await getTextDocumentTemplates(client);
	} else if (normalizedScope) {
		templates = await getAvailableTemplates(client, normalizedScope, false);
	} else {
		// No scope filter - fetch all active templates via RPC
		const { data, error } = await client.rpc('get_template_catalog', {
			p_scope: normalizedScope ?? undefined,
			p_realm: normalizedRealm ?? undefined,
			p_search: normalizedSearch ?? undefined
		});

		if (error) {
			throw new Error(error.message);
		}

		templates = ((data ?? []) as Template[]).map(
			(template) =>
				({
					...template,
					inheritance_chain: []
				}) as unknown as ResolvedTemplate
		);
	}

	// Apply filters consistently for all code paths
	if (normalizedRealm) {
		templates = templates.filter((t) => getMetadataString(t, 'realm') === normalizedRealm);
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

	if (normalizedPrimitive) {
		templates = templates.filter(
			(t) => getMetadataString(t, 'primitive') === normalizedPrimitive
		);
	}

	if (normalizedSearch) {
		const searchLower = normalizedSearch.toLowerCase();
		templates = templates.filter((t) => {
			const description = getMetadataString(t, 'description');
			const matchesDescription =
				typeof description === 'string' && description.toLowerCase().includes(searchLower);

			return (
				t.name.toLowerCase().includes(searchLower) ||
				t.type_key.toLowerCase().includes(searchLower) ||
				matchesDescription
			);
		});
	}

	const sorted = sortTemplates(templates, sort ?? 'name', normalizedDirection);
	const groupedByRealm = sorted.reduce(
		(acc, template) => {
			const templateRealm = getMetadataString(template, 'realm') ?? 'other';
			if (!acc[templateRealm]) {
				acc[templateRealm] = [];
			}
			acc[templateRealm].push(template);
			return acc;
		},
		{} as Record<string, ResolvedTemplate[]>
	);

	return {
		templates: sorted,
		groupedByRealm
	};
}

export function sortTemplates(
	templates: ResolvedTemplate[],
	sort: string,
	direction: TemplateCatalogDirection
): ResolvedTemplate[] {
	const sorted = [...templates];
	const factor = direction === 'desc' ? -1 : 1;

	const getValue = (template: ResolvedTemplate) => {
		switch (sort) {
			case 'type_key':
				return template.type_key ?? '';
			case 'realm':
				return getMetadataString(template, 'realm') ?? '';
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
