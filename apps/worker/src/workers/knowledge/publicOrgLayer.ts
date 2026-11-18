// apps/worker/src/workers/knowledge/publicOrgLayer.ts
//
// The public organization layer (tasker 168): verified, public facts about organizations,
// reused before paying for a web search. DJ's rule (2026-11-18): "only if it pertains to
// something a user is doing" — so nothing here is ever shown on its own. It is a cache that a
// user's own research reads from, and what it finds is copied into that user's own entry with
// its original web source.
//
//   Fill (promoteOrgFacts): after research on one of your organizations, facts you have accepted
//   whose source is the organization's OWN website (same host as its homepage) are written to a
//   public organization keyed by that domain. Only predicates the vocabulary already allows on a
//   public organization; never email or phone, never people (the database refuses both anyway).
//   Notes, imports, chat and task facts never qualify: they have no public web source.
//   Read (publicOrgFacts): before research on an organization whose homepage you know, the
//   public organization with that exact domain lends its fresh (< 180 days) facts. A same-name
//   match is never used: two "LA Industrial"s are two companies.
//
// Service-role only (the worker's client). No model calls, no web requests.

import type {
	KnowledgeDataClient,
	KnowledgeEntityDetail,
	KnowledgeWriteBatch
} from '@buildos/shared-agent-ops/knowledge';

/** Predicates a public organization may carry that a web page can state. */
export const PUBLIC_ORG_PREDICATES = [
	'alias',
	'description',
	'homepage',
	'profile_url',
	'address',
	'industry',
	'founded'
] as const;
const PROMOTABLE = new Set<string>(PUBLIC_ORG_PREDICATES);
const FRESH_DAYS = 180;

/** "https://www.Secular-Talk.com/about" → "secular-talk.com"; null for anything else. */
export function hostOf(url: string | null | undefined): string | null {
	if (!url) return null;
	try {
		const host = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
		return host.includes('.') ? host : null;
	} catch {
		return null;
	}
}

/** True when a page is on the organization's own site (its domain or a subdomain of it). */
export function isOwnSite(pageUrl: string | null | undefined, domain: string): boolean {
	const host = hostOf(pageUrl);
	return Boolean(host && (host === domain || host.endsWith(`.${domain}`)));
}

/** The domain of an organization entry's own (active) homepage fact. */
export function orgDomain(detail: Pick<KnowledgeEntityDetail, 'entity' | 'facts'>): string | null {
	if (detail.entity.kind !== 'org') return null;
	const homepage = detail.facts.find((f) => f.predicate === 'homepage' && f.status === 'active');
	return hostOf(homepage?.value ?? null);
}

type PublicFactRow = {
	id: string;
	predicate: string;
	value_text: string | null;
	qualifiers: Record<string, unknown> | null;
	updated_at: string;
	sources: Array<{ source: { url: string | null; title: string | null } | null }> | null;
};

/**
 * Fresh public facts for this organization's domain, as a batch on the user's own entry, and
 * which requested fields they already answer. Never throws (the cache is an optimization).
 */
export async function publicOrgFacts(
	db: KnowledgeDataClient,
	detail: Pick<KnowledgeEntityDetail, 'entity' | 'facts'>,
	fields: string[]
): Promise<{ batch: KnowledgeWriteBatch; covered: string[]; publicId: string | null }> {
	const empty = { batch: { entities: [], facts: [], sources: [] }, covered: [], publicId: null };
	try {
		const domain = orgDomain(detail);
		if (!domain || detail.entity.scope !== 'private') return empty;
		const { data: key } = await (db as any)
			.from('knowledge_entity_keys')
			.select('entity_id, entity:knowledge_entities!inner(id, kind, status, scope)')
			.eq('key_type', 'domain')
			.eq('key_value', domain)
			.eq('scope', 'public')
			.maybeSingle();
		const entity = key?.entity as { id: string; kind: string; status: string } | undefined;
		if (!entity || entity.kind !== 'org' || entity.status !== 'active') return empty;

		const since = new Date(Date.now() - FRESH_DAYS * 86_400_000).toISOString();
		const { data: rows } = await (db as any)
			.from('knowledge_facts')
			.select(
				'id, predicate, value_text, qualifiers, updated_at, sources:knowledge_fact_sources(source:knowledge_sources(url, title))'
			)
			.eq('entity_id', entity.id)
			.eq('scope', 'public')
			.eq('status', 'active')
			.gte('updated_at', since)
			.limit(50);

		const batch: KnowledgeWriteBatch = { entities: [], facts: [], sources: [] };
		const sourceRefs = new Map<string, string>();
		const covered = new Set<string>();
		for (const row of (rows ?? []) as PublicFactRow[]) {
			if (!PROMOTABLE.has(row.predicate) || !row.value_text) continue;
			const source = (row.sources ?? []).map((s) => s.source).find((s) => s?.url);
			if (!source?.url) continue;
			let ref = sourceRefs.get(source.url);
			if (!ref) {
				ref = `pub${sourceRefs.size}`;
				sourceRefs.set(source.url, ref);
				batch.sources!.push({
					ref,
					type: 'web',
					url: source.url,
					title: source.title ?? undefined,
					meta: { via: 'public_org_layer' }
				});
			}
			batch.facts.push({
				subject: detail.entity.id,
				predicate: row.predicate,
				value: row.value_text,
				qualifiers: row.qualifiers ?? undefined,
				sources: [ref]
			});
			covered.add(row.predicate);
		}
		return {
			batch,
			covered: fields.filter((field) => covered.has(field)),
			publicId: entity.id
		};
	} catch {
		return empty;
	}
}

/**
 * Copy what this user's research confirmed from the organization's own site into the public
 * layer. Returns how many facts were written. Never throws.
 */
export async function promoteOrgFacts(
	db: KnowledgeDataClient,
	detail: Pick<KnowledgeEntityDetail, 'entity' | 'facts'>
): Promise<number> {
	try {
		const domain = orgDomain(detail);
		if (!domain || detail.entity.scope !== 'private') return 0;
		const own = detail.facts.filter(
			(fact) =>
				fact.status === 'active' &&
				PROMOTABLE.has(fact.predicate) &&
				typeof fact.value === 'string' &&
				fact.value.trim() &&
				(fact.sources ?? []).some(
					(source) => source.type === 'web' && isOwnSite(source.url, domain)
				)
		);
		if (!own.length) return 0;

		const publicId = await ensurePublicOrg(db, detail.entity.name, domain);
		if (!publicId) return 0;
		let written = 0;
		for (const fact of own) {
			const source = (fact.sources ?? []).find(
				(s) => s.type === 'web' && isOwnSite(s.url, domain)
			)!;
			const { data: sourceRow } = await (db as any)
				.from('knowledge_sources')
				.insert({
					scope: 'public',
					source_type: 'web',
					url: source.url,
					title: source.title ?? null
				})
				.select('id')
				.single();
			const { data: factRow } = await (db as any)
				.from('knowledge_facts')
				.upsert(
					{
						entity_id: publicId,
						predicate: fact.predicate,
						value_text: String(fact.value).slice(0, 4000),
						qualifiers: fact.qualifiers ?? {},
						scope: 'public',
						status: 'active',
						confidence: 0.9,
						created_via: 'enrichment',
						updated_at: new Date().toISOString()
					},
					{ onConflict: 'dedupe_key,scope,owner_user_id' }
				)
				.select('id')
				.maybeSingle();
			if (factRow?.id && sourceRow?.id) {
				await (db as any)
					.from('knowledge_fact_sources')
					.upsert(
						{ fact_id: factRow.id, source_id: sourceRow.id },
						{ onConflict: 'fact_id,source_id', ignoreDuplicates: true }
					);
				written++;
			}
		}
		return written;
	} catch (error) {
		console.warn(
			'[knowledge] public org promotion skipped',
			error instanceof Error ? error.message : String(error)
		);
		return 0;
	}
}

async function ensurePublicOrg(
	db: KnowledgeDataClient,
	name: string,
	domain: string
): Promise<string | null> {
	const { data: existing } = await (db as any)
		.from('knowledge_entity_keys')
		.select('entity_id')
		.eq('key_type', 'domain')
		.eq('key_value', domain)
		.eq('scope', 'public')
		.maybeSingle();
	if (existing?.entity_id) return existing.entity_id as string;
	const { data: created, error } = await (db as any)
		.from('knowledge_entities')
		.insert({
			kind: 'org',
			name: name.slice(0, 300),
			scope: 'public',
			created_via: 'enrichment'
		})
		.select('id')
		.single();
	if (error || !created?.id) return null;
	const { error: keyError } = await (db as any).from('knowledge_entity_keys').insert({
		entity_id: created.id,
		key_type: 'domain',
		key_value: domain,
		scope: 'public'
	});
	if (keyError) {
		// Another research run claimed the domain first: use theirs, drop ours.
		await (db as any).from('knowledge_entities').delete().eq('id', created.id);
		const { data: winner } = await (db as any)
			.from('knowledge_entity_keys')
			.select('entity_id')
			.eq('key_type', 'domain')
			.eq('key_value', domain)
			.eq('scope', 'public')
			.maybeSingle();
		return (winner?.entity_id as string | undefined) ?? null;
	}
	return created.id as string;
}
