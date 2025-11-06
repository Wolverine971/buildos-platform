// apps/web/src/routes/ontology/templates/+page.server.ts
/**
 * Server-side data loading for ontology templates browse page.
 */

import type { PageServerLoad } from './$types';
import { redirect, error } from '@sveltejs/kit';
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

export const load: PageServerLoad = async ({ url, locals }) => {
	const { user } = await locals.safeGetSession();

	if (!user) {
		throw redirect(302, '/auth/login');
	}

	// Collect filter parameters from URL
	const scope = url.searchParams.get('scope');
	const realm = url.searchParams.get('realm');
	const search = url.searchParams.get('search');
	const contexts = url.searchParams.getAll('context');
	const scales = url.searchParams.getAll('scale');
	const stages = url.searchParams.getAll('stage');
	const sort = url.searchParams.get('sort') ?? 'name';
	const directionParam = url.searchParams.get('direction');
	const direction = directionParam && directionParam.toLowerCase() === 'desc' ? 'desc' : 'asc';
	const detailParam = url.searchParams.get('detail');

	let templates: Template[];
	let groupedByRealm: Record<string, Template[]>;

	try {
		const result = await fetchTemplateCatalog(locals.supabase, {
			scope,
			realm,
			search,
			primitive: url.searchParams.get('primitive'),
			contexts,
			scales,
			stages,
			sort,
			direction
		});

		templates = result.templates;
		groupedByRealm = result.groupedByRealm;
	} catch (catalogError) {
		console.error('[Ontology Templates] Failed to load templates:', catalogError);
		throw error(500, 'Failed to fetch templates');
	}

	// Group templates by scope for alternate view
	const byScope = templates.reduce(
		(acc, template) => {
			if (!acc[template.scope]) {
				acc[template.scope] = [];
			}
			acc[template.scope]!.push(template);
			return acc;
		},
		{} as Record<string, Template[]>
	);

	// Get unique realms and scopes for filter options
	const uniqueRealms = Array.from(new Set(templates.map((t) => t.metadata?.realm ?? 'other')));
	const uniqueScopes = Array.from(new Set(templates.map((t) => t.scope)));

	const facets = await getFacetValues(locals.supabase);
	const facetOptions = mapFacetValuesByKey(facets);

	return {
		templates,
		grouped: groupedByRealm,
		byScope,
		currentFilters: {
			scope,
			realm,
			search,
			contexts,
			scales,
			stages,
			sort,
			direction,
			detail: detailParam
		},
		filterOptions: {
			realms: uniqueRealms,
			scopes: uniqueScopes,
			facets: facetOptions
		},
		isAdmin: user.is_admin ?? false
	};
};

async function getFacetValues(supabase: TypedSupabaseClient): Promise<FacetValue[]> {
	const { data, error: facetError } = await supabase
		.from('onto_facet_values')
		.select('facet_key, value, label, description, color')
		.order('facet_key')
		.order('sort_order');

	if (facetError) {
		console.error('[Templates Page] Failed to fetch facet taxonomy:', facetError);
		return [];
	}

	return (data as FacetValue[]) ?? [];
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
