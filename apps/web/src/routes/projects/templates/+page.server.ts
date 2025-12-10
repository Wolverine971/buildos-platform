// apps/web/src/routes/projects/templates/+page.server.ts
/**
 * Server-side data loading for ontology templates browse page.
 */

import type { PageServerLoad } from './$types';
import { redirect, error } from '@sveltejs/kit';
import type { ResolvedTemplate } from '$lib/services/ontology/template-resolver.service';
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

	let templates: ResolvedTemplate[];
	let groupedByRealm: Record<string, ResolvedTemplate[]>;

	// Fetch filtered templates and all available filter options in parallel
	const [catalogResult, allFilterOptions] = await Promise.all([
		fetchTemplateCatalog(locals.supabase, {
			scope,
			realm,
			search,
			primitive: url.searchParams.get('primitive'),
			contexts,
			scales,
			stages,
			sort,
			direction
		}).catch((catalogError) => {
			console.error('[Ontology Templates] Failed to load templates:', catalogError);
			throw error(500, 'Failed to fetch templates');
		}),
		getAllFilterOptions(locals.supabase)
	]);

	templates = catalogResult.templates;
	groupedByRealm = catalogResult.groupedByRealm;

	// Group templates by scope for alternate view
	const byScope = templates.reduce(
		(acc, template) => {
			if (!acc[template.scope]) {
				acc[template.scope] = [];
			}
			acc[template.scope]!.push(template);
			return acc;
		},
		{} as Record<string, ResolvedTemplate[]>
	);

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
			realms: allFilterOptions.realms,
			scopes: allFilterOptions.scopes,
			facets: facetOptions
		},
		isAdmin: user.is_admin ?? false
	};
};

/**
 * Fetch all available scopes and realms from the database, independent of current filters.
 * This ensures filter dropdowns always show all available options.
 */
async function getAllFilterOptions(
	supabase: TypedSupabaseClient
): Promise<{ scopes: string[]; realms: string[] }> {
	// Fetch all unique scopes and realms from templates table
	const { data, error: queryError } = await supabase
		.from('onto_templates')
		.select('scope, metadata')
		.eq('status', 'active');

	if (queryError) {
		console.error('[Templates Page] Failed to fetch filter options:', queryError);
		return { scopes: [], realms: [] };
	}

	const scopes = new Set<string>();
	const realms = new Set<string>();

	for (const template of data ?? []) {
		if (template.scope) {
			scopes.add(template.scope);
		}
		const realm = (template.metadata as Record<string, unknown> | null)?.realm;
		if (typeof realm === 'string') {
			realms.add(realm);
		}
	}

	// Sort alphabetically for consistent display
	return {
		scopes: Array.from(scopes).sort(),
		realms: Array.from(realms).sort()
	};
}

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
