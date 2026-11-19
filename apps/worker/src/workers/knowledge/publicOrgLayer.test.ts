// apps/worker/src/workers/knowledge/publicOrgLayer.test.ts
// The public organization layer (tasker 168): filled only from the org's own site, read only by
// exact domain, never with contact details.
import { describe, expect, it } from 'vitest';
import { hostOf, isOwnSite, orgDomain, promoteOrgFacts, publicOrgFacts } from './publicOrgLayer';

const fact = (
	predicate: string,
	value: string,
	url: string | null,
	status = 'active',
	via: { created_via?: string; run_id?: string | null } = {}
) => ({
	id: `${predicate}-${value}`,
	predicate,
	label: predicate,
	value,
	entity: null,
	qualifiers: {},
	scope: 'private',
	status,
	confidence: 0.8,
	valid_from: null,
	valid_to: null,
	observed_at: '2026-11-17T00:00:00Z',
	created_via: via.created_via ?? 'enrichment',
	run_id: via.run_id === undefined ? 'run1' : via.run_id,
	sources: url
		? [
				{
					id: 's',
					type: 'web',
					url,
					title: 'page',
					quote: null,
					captured_at: '',
					scope: 'private'
				}
			]
		: []
});

const org = (facts: ReturnType<typeof fact>[]) =>
	({
		entity: { id: 'mine', kind: 'org', name: 'Secular Talk', scope: 'private' },
		facts
	}) as never;

describe('hosts', () => {
	it('reads the domain and recognizes subdomains as the same site', () => {
		expect(hostOf('https://www.Secular-Talk.com/about')).toBe('secular-talk.com');
		expect(isOwnSite('https://shop.secular-talk.com/x', 'secular-talk.com')).toBe(true);
		expect(isOwnSite('https://notsecular-talk.com/x', 'secular-talk.com')).toBe(false);
		expect(isOwnSite('https://en.wikipedia.org/wiki/Secular_Talk', 'secular-talk.com')).toBe(
			false
		);
	});

	it('never keys on a shared platform page or a deep link', () => {
		expect(
			orgDomain(org([fact('homepage', 'https://www.linkedin.com/company/acme', null)]))
		).toBeNull();
		expect(
			orgDomain(org([fact('homepage', 'https://acme.wixsite.com/home', null)]))
		).toBeNull();
		expect(orgDomain(org([fact('homepage', 'https://acme.com/team/bob', null)]))).toBeNull();
		expect(orgDomain(org([fact('homepage', 'https://acme.com/', null)]))).toBe('acme.com');
	});

	it('takes the domain only from an active homepage', () => {
		expect(orgDomain(org([fact('homepage', 'https://secular-talk.com', null)]))).toBe(
			'secular-talk.com'
		);
		expect(
			orgDomain(org([fact('homepage', 'https://secular-talk.com', null, 'suggested')]))
		).toBeNull();
	});
});

/** A minimal recorder of what the layer writes, answering reads from canned rows. */
function recordingDb(reads: Record<string, unknown> = {}) {
	const writes: Array<{ table: string; op: string; value: Record<string, unknown> }> = [];
	const db = {
		from(table: string) {
			let op = 'select';
			let value: Record<string, unknown> = {};
			const query: Record<string, unknown> = {
				select: () => query,
				eq: () => query,
				gte: () => query,
				limit: () => query,
				delete: () => ((op = 'delete'), query),
				insert: (v: Record<string, unknown>) => {
					op = 'insert';
					value = v;
					writes.push({ table, op, value: v });
					return query;
				},
				upsert: (v: Record<string, unknown>) => {
					op = 'upsert';
					value = v;
					writes.push({ table, op, value: v });
					return query;
				},
				maybeSingle: async () => ({
					data: op === 'select' ? (reads[table] ?? null) : { id: `${table}-id` },
					error: null
				}),
				single: async () => ({ data: { id: `${table}-id` }, error: null }),
				then: (resolve: (v: unknown) => void) =>
					resolve({
						data: op === 'select' ? (reads[`${table}[]`] ?? []) : null,
						error: null
					})
			};
			void value;
			return query;
		}
	};
	return { db: db as never, writes };
}

describe('promoteOrgFacts', () => {
	it('writes only own-site, public-safe facts to a public org keyed by its domain', async () => {
		const { db, writes } = recordingDb();
		const written = await promoteOrgFacts(
			db,
			org([
				fact('homepage', 'https://secular-talk.com', 'https://secular-talk.com/'),
				fact('description', 'A daily politics show', 'https://secular-talk.com/about'),
				fact('industry', 'Media', 'https://en.wikipedia.org/wiki/Secular_Talk'),
				fact('email', 'kyle@secular-talk.com', 'https://secular-talk.com/contact'),
				fact('founded', '2008', 'https://secular-talk.com/about', 'suggested'),
				// typed in through chat/MCP with a made-up "own site" URL: never promoted
				fact('address', '1 Fake St', 'https://secular-talk.com/contact', 'active', {
					created_via: 'mcp',
					run_id: null
				}),
				// an earlier run's fact: only this run's findings are promoted
				fact('alias', 'ST', 'https://secular-talk.com/', 'active', { run_id: 'older' }),
				// borrowed from the public layer in this run: not re-promoted
				fact('profile_url', 'https://secular-talk.com/links', 'https://secular-talk.com/')
			]),
			{
				runId: 'run1',
				borrowed: [{ predicate: 'profile_url', value: 'https://secular-talk.com/links' }]
			}
		);
		expect(written).toBe(2);
		const facts = writes.filter((w) => w.table === 'knowledge_facts').map((w) => w.value);
		expect(facts.map((f) => f.predicate).sort()).toEqual(['description', 'homepage']);
		expect(facts.every((f) => f.scope === 'public' && !('owner_user_id' in f))).toBe(true);
		expect(writes.find((w) => w.table === 'knowledge_entity_keys')?.value).toMatchObject({
			key_type: 'domain',
			key_value: 'secular-talk.com',
			scope: 'public'
		});
	});

	it('writes nothing without a homepage to anchor the domain', async () => {
		const { db, writes } = recordingDb();
		expect(
			await promoteOrgFacts(
				db,
				org([fact('description', 'x', 'https://secular-talk.com/')]),
				{
					runId: 'run1'
				}
			)
		).toBe(0);
		expect(writes).toEqual([]);
	});
});

describe('publicOrgFacts', () => {
	it('lends fresh public facts for the exact domain and says which fields they answer', async () => {
		const { db } = recordingDb({
			knowledge_entity_keys: {
				entity_id: 'pub',
				entity: { id: 'pub', kind: 'org', status: 'active', scope: 'public' }
			},
			'knowledge_facts[]': [
				{
					id: 'p1',
					predicate: 'description',
					value_text: 'A daily politics show',
					qualifiers: {},
					updated_at: '2026-11-01T00:00:00Z',
					sources: [{ source: { url: 'https://secular-talk.com/about', title: 'About' } }]
				},
				{
					id: 'p2',
					predicate: 'email',
					value_text: 'should-never-be-here@example.test',
					qualifiers: {},
					updated_at: '2026-11-01T00:00:00Z',
					sources: [{ source: { url: 'https://secular-talk.com/contact', title: null } }]
				}
			]
		});
		const lent = await publicOrgFacts(
			db,
			org([fact('homepage', 'https://secular-talk.com', null)]),
			['description', 'email']
		);
		expect(lent.covered).toEqual(['description']);
		expect(lent.batch.facts).toEqual([
			expect.objectContaining({ subject: 'mine', predicate: 'description' })
		]);
		expect(lent.batch.sources?.[0]).toMatchObject({
			type: 'web',
			url: 'https://secular-talk.com/about'
		});
	});

	it('lends nothing to an org whose homepage is unknown (never by name)', async () => {
		const { db } = recordingDb();
		const lent = await publicOrgFacts(db, org([]), ['description']);
		expect(lent.batch.facts).toEqual([]);
	});
});
