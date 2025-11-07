// apps/web/src/lib/services/ontology/template-catalog-meta.service.ts
/**
 * Helpers for progressive template catalog loading (scope → realm → domain/deliverable/variant).
 */

import type { TypedSupabaseClient } from '@buildos/supabase-client';

type RawTemplateRow = {
	id: string;
	name: string;
	type_key: string;
	scope: string;
	status: 'draft' | 'active' | 'deprecated';
	is_abstract: boolean;
	metadata: Record<string, unknown> | null;
	facet_defaults?: Record<string, unknown> | null;
};

export type ScopeCatalogMeta = {
	scope: string;
	summary: {
		total_templates: number;
		abstract_templates: number;
		concrete_templates: number;
	};
	realms: Array<{
		realm: string;
		template_count: number;
		exemplar_names: string[];
	}>;
};

export type CatalogCascade = {
	scope: string;
	realm: string;
	domains: Array<{ slug: string; label: string; template_count: number }>;
	deliverables: Array<{ slug: string; label: string; domains: string[] }>;
	variants: Array<{ slug: string; label: string; parent: string }>;
	templates: Array<{
		id: string;
		name: string;
		type_key: string;
		domain: string;
		deliverable: string;
		variant?: string;
		status: 'draft' | 'active' | 'deprecated';
		is_abstract: boolean;
		summary?: string;
		facet_defaults?: Record<string, unknown> | null;
	}>;
};

const SCOPE_SELECT_FIELDS =
	'id, name, type_key, scope, status, is_abstract, metadata, facet_defaults';

function getRealm(metadata: Record<string, unknown> | null): string {
	const realm = (metadata?.realm as string | undefined)?.trim();
	return realm && realm.length > 0 ? realm : 'unclassified';
}

function splitTypeKey(typeKey: string) {
	const [domain = '', deliverable = '', variant] = typeKey.split('.');
	return { domain, deliverable, variant };
}

export async function getScopeCatalogMeta(
	client: TypedSupabaseClient,
	scope: string
): Promise<ScopeCatalogMeta> {
	const { data, error } = await client
		.from('onto_templates')
		.select(SCOPE_SELECT_FIELDS)
		.eq('scope', scope);

	if (error) {
		throw new Error(`[CatalogMeta] Failed to load templates: ${error.message}`);
	}

	const realmMap = new Map<
		string,
		{
			template_count: number;
			exemplar_names: string[];
		}
	>();

	let abstractTemplates = 0;

	for (const row of (data ?? []) as RawTemplateRow[]) {
		if (row.is_abstract) {
			abstractTemplates += 1;
		}

		const realmKey = getRealm(row.metadata);
		const realmEntry = realmMap.get(realmKey) ?? {
			template_count: 0,
			exemplar_names: []
		};

		realmEntry.template_count += 1;

		if (realmEntry.exemplar_names.length < 3) {
			realmEntry.exemplar_names.push(row.name);
		}

		realmMap.set(realmKey, realmEntry);
	}

	const totalTemplates = data?.length ?? 0;

	return {
		scope,
		summary: {
			total_templates: totalTemplates,
			abstract_templates: abstractTemplates,
			concrete_templates: totalTemplates - abstractTemplates
		},
		realms: Array.from(realmMap.entries())
			.map(([realm, entry]) => ({
				realm,
				template_count: entry.template_count,
				exemplar_names: entry.exemplar_names
			}))
			.sort((a, b) => b.template_count - a.template_count)
	};
}

export async function getCatalogCascade(
	client: TypedSupabaseClient,
	scope: string,
	realm: string
): Promise<CatalogCascade> {
	const { data, error } = await client
		.from('onto_templates')
		.select(SCOPE_SELECT_FIELDS)
		.eq('scope', scope);

	if (error) {
		throw new Error(`[CatalogCascade] Failed to load templates: ${error.message}`);
	}

	const rows = ((data ?? []) as RawTemplateRow[]).filter(
		(row) => getRealm(row.metadata) === realm
	);

	const domainMap = new Map<string, { label: string; count: number }>();
	const deliverableMap = new Map<string, { label: string; domains: Set<string> }>();
	const variantEntries: Array<{ slug: string; label: string; parent: string }> = [];
	const templates: CatalogCascade['templates'] = [];

	for (const row of rows) {
		const { domain, deliverable, variant } = splitTypeKey(row.type_key);

		if (!domain) continue;

		domainMap.set(domain, {
			label: domain.replace(/_/g, ' '),
			count: (domainMap.get(domain)?.count ?? 0) + 1
		});

		if (deliverable) {
			const deliverableEntry = deliverableMap.get(deliverable) ?? {
				label: deliverable.replace(/_/g, ' '),
				domains: new Set<string>()
			};
			deliverableEntry.domains.add(domain);
			deliverableMap.set(deliverable, deliverableEntry);
		}

		if (variant) {
			variantEntries.push({
				slug: variant,
				label: variant.replace(/_/g, ' '),
				parent: `${domain}.${deliverable}`
			});
		}

		templates.push({
			id: row.id,
			name: row.name,
			type_key: row.type_key,
			domain,
			deliverable,
			variant,
			status: row.status,
			is_abstract: row.is_abstract,
			summary: (row.metadata?.description as string | undefined) ?? undefined,
			facet_defaults: row.facet_defaults ?? undefined
		});
	}

	return {
		scope,
		realm,
		domains: Array.from(domainMap.entries())
			.map(([slug, { label, count }]) => ({
				slug,
				label,
				template_count: count
			}))
			.sort((a, b) => b.template_count - a.template_count),
		deliverables: Array.from(deliverableMap.entries()).map(([slug, { label, domains }]) => ({
			slug,
			label,
			domains: Array.from(domains)
		})),
		variants: variantEntries,
		templates
	};
}
