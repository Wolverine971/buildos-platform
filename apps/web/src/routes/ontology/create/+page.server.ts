// apps/web/src/routes/ontology/create/+page.server.ts
/**
 * Create Project - Server Load
 * Fetches templates for the guided form
 */

import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import type { Template } from '$lib/types/onto';
import type { TypedSupabaseClient } from '@buildos/supabase-client';
import { fetchTemplateCatalog } from '$lib/services/ontology/ontology-template-catalog.service';

type FacetValue = {
	facet_key: string;
	value: string;
	label: string;
	description: string | null;
	color: string | null;
};

export const load: PageServerLoad = async ({ locals }) => {
	const { user } = await locals.safeGetSession();
	if (!user) {
		throw error(401, 'Authentication required');
	}

	try {
		const [catalog, facetValues] = await Promise.all([
			fetchTemplateCatalog(locals.supabase, {
				scope: 'project',
				sort: 'name',
				direction: 'asc'
			}),
			getFacetValues(locals.supabase)
		]);

		const templates = catalog.templates;
		const grouped = groupTemplatesByRealm(templates);
		const facets = mapFacetValuesByKey(facetValues);

		return {
			templates,
			grouped,
			facets
		};
	} catch (catalogError) {
		console.error('[Create Project] Failed to load templates:', catalogError);
		return {
			templates: [],
			grouped: {},
			facets: {},
			error: 'Failed to load templates'
		};
	}
};

async function getFacetValues(supabase: TypedSupabaseClient): Promise<FacetValue[]> {
	const { data, error: facetError } = await supabase
		.from('onto_facet_values')
		.select('facet_key, value, label, description, color')
		.order('facet_key')
		.order('sort_order');

	if (facetError) {
		console.error('[Create Project] Failed to fetch facet taxonomy:', facetError);
		return [];
	}

	return (data as FacetValue[]) ?? [];
}

function groupTemplatesByRealm(templates: Template[]): Record<string, Template[]> {
	return templates.reduce(
		(acc, template) => {
			const realm = template.metadata?.realm ?? 'other';
			if (!acc[realm]) {
				acc[realm] = [];
			}
			acc[realm].push(template);
			return acc;
		},
		{} as Record<string, Template[]>
	);
}

function mapFacetValuesByKey(facetValues: FacetValue[]): Record<string, FacetValue[]> {
	return facetValues.reduce(
		(acc, facet) => {
			if (!acc[facet.facet_key]) {
				acc[facet.facet_key] = [];
			}
			acc[facet.facet_key]!.push(facet);
			return acc;
		},
		{} as Record<string, FacetValue[]>
	);
}

