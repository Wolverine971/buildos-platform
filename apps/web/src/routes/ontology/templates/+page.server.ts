// apps/web/src/routes/ontology/templates/+page.server.ts
/**
 * Server-side data loading for ontology templates browse page
 * Fetches template catalog via API endpoint
 */

import type { PageServerLoad } from './$types';
import { redirect, error } from '@sveltejs/kit';
import type { Template } from '$lib/types/onto';
import type { TypedSupabaseClient } from '@buildos/supabase-client';

type FacetValue = {
	facet_key: string;
	value: string;
	label: string;
	description: string | null;
	color: string | null;
};

export const load: PageServerLoad = async ({ url, locals, fetch }) => {
	// Check authentication
	const { user } = await locals.safeGetSession();

	if (!user) {
		throw redirect(302, '/auth/login');
	}

	// Get filter parameters from URL
	const scope = url.searchParams.get('scope');
	const realm = url.searchParams.get('realm');
	const search = url.searchParams.get('search');
	const contexts = url.searchParams.getAll('context');
	const scales = url.searchParams.getAll('scale');
	const stages = url.searchParams.getAll('stage');
	const sort = url.searchParams.get('sort') ?? 'name';
	const direction = url.searchParams.get('direction') ?? 'asc';
	const detailParam = url.searchParams.get('detail');

	// Build API URL with query parameters
	const apiParams = new URLSearchParams();
	if (scope) apiParams.set('scope', scope);
	if (realm) apiParams.set('realm', realm);
	if (search) apiParams.set('search', search);
	contexts.forEach((value) => apiParams.append('context', value));
	scales.forEach((value) => apiParams.append('scale', value));
	stages.forEach((value) => apiParams.append('stage', value));
	if (sort) apiParams.set('sort', sort);
	if (direction) apiParams.set('direction', direction);

	const apiUrl = `/api/onto/templates${apiParams.toString() ? '?' + apiParams.toString() : ''}`;

	// Fetch templates via API endpoint (following BuildOS pattern)
	const response = await fetch(apiUrl);

	if (!response.ok) {
		console.error('[Ontology Templates] API fetch failed:', response.statusText);
		throw error(500, 'Failed to fetch templates');
	}

	const { templates, grouped } = await response.json();

	// Group templates by scope for alternate view
	const byScope = (templates as Template[]).reduce(
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
	const uniqueRealms = Array.from(
		new Set((templates as Template[]).map((t) => t.metadata?.realm ?? 'other'))
	);
	const uniqueScopes = Array.from(new Set((templates as Template[]).map((t) => t.scope)));

	const facets = await getFacetValues(locals.supabase);
	const facetOptions = mapFacetValuesByKey(facets);

	return {
		templates: templates as Template[],
		grouped: grouped as Record<string, Template[]>,
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
		isAdmin: user.is_admin ?? false // For showing admin-only features
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
