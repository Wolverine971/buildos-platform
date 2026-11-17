// packages/shared-agent-ops/src/knowledge/knowledge-store.test.ts
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { parseContactFile, planContactImport } from './contacts-import';
import { KnowledgeStore } from './knowledge-store';
import { normalizeKnowledgeName } from './normalize';

// ---------------------------------------------------------------------------
// A small in-memory stand-in for the PostgREST client: enough of the query builder for
// KnowledgeStore, with the generated columns and unique indexes the store relies on. It
// behaves like the service-role client (no RLS), so the store's own filtering is what's tested.

type Row = Record<string, any>;

const UNIQUE: Record<string, (row: Row) => string | null> = {
	knowledge_facts: (r) => `${r.dedupe_key}|${r.scope}|${r.owner_user_id}`,
	knowledge_entity_keys: (r) => `${r.key_type}|${r.key_value}|${r.scope}|${r.owner_user_id}`,
	knowledge_entities: (r) => (r.is_self ? `self|${r.owner_user_id}` : null),
	knowledge_fact_sources: (r) => `${r.fact_id}|${r.source_id}`,
	knowledge_record_links: (r) =>
		`${r.entity_id}|${r.owner_user_id}|${r.record_kind}|${r.record_id}`,
	knowledge_merge_candidates: (r) =>
		`${r.owner_user_id}|${[r.entity_a, r.entity_b].sort().join('|')}`
};

function withGenerated(table: string, row: Row): Row {
	const now = new Date().toISOString();
	const out: Row = { id: randomUUID(), created_at: now, updated_at: now, ...row };
	if (table === 'knowledge_entities') {
		out.status ??= 'active';
		out.is_self ??= false;
		out.summary ??= null;
		out.image_url ??= null;
		out.merged_into_id ??= null;
		out.owner_user_id ??= null;
		out.normalized_name = normalizeKnowledgeName(out.name);
	}
	if (table === 'knowledge_facts') {
		out.status ??= 'active';
		out.qualifiers ??= {};
		out.confidence ??= 0.8;
		out.observed_at ??= now;
		out.object_entity_id ??= null;
		out.value_text ??= null;
		out.run_id ??= null;
		out.dedupe_key = `${out.entity_id}|${out.predicate}|${out.object_entity_id ?? String(out.value_text).trim().toLowerCase()}`;
	}
	if (table === 'knowledge_sources') out.captured_at ??= now;
	return out;
}

class FakeDb {
	tables = new Map<string, Row[]>();
	rows(table: string): Row[] {
		if (!this.tables.has(table)) this.tables.set(table, []);
		return this.tables.get(table)!;
	}
	from(table: string) {
		return new FakeQuery(this, table);
	}
	async rpc(fn: string, args: Row) {
		if (fn === 'knowledge_search') {
			const viewer = args.p_viewer;
			const term = normalizeKnowledgeName(args.p_query);
			const visible = (r: Row) => r.scope === 'public' || r.owner_user_id === viewer;
			const hits = new Map<string, number>();
			for (const e of this.rows('knowledge_entities')) {
				if (visible(e) && e.status === 'active' && e.normalized_name.includes(term)) {
					hits.set(e.id, e.normalized_name === term ? 1 : 0.7);
				}
			}
			for (const f of this.rows('knowledge_facts')) {
				if (
					visible(f) &&
					['alias', 'email'].includes(f.predicate) &&
					String(f.value_text).toLowerCase().includes(term)
				) {
					hits.set(f.entity_id, Math.max(hits.get(f.entity_id) ?? 0, 0.7));
				}
			}
			const data = [...hits]
				.map(([id, score]) => ({
					e: this.rows('knowledge_entities').find((x) => x.id === id)!,
					score
				}))
				.filter(
					({ e }) => e && visible(e) && (!args.p_kinds || args.p_kinds.includes(e.kind))
				)
				.sort((a, b) => b.score - a.score)
				.map(({ e, score }) => ({
					entity_id: e.id,
					kind: e.kind,
					name: e.name,
					summary: e.summary,
					scope: e.scope,
					is_self: e.is_self,
					matched_on: 'name',
					score
				}));
			return { data, error: null };
		}
		if (fn === 'knowledge_list') {
			// Mirrors public.knowledge_list (20261117010000).
			const viewer = args.p_viewer;
			const live = (s: string) => ['active', 'suggested', 'disputed'].includes(s);
			const self = this.rows('knowledge_entities').find(
				(e) => e.owner_user_id === viewer && e.is_self
			);
			const objects = (predicate: string) =>
				new Set(
					this.rows('knowledge_facts')
						.filter(
							(f) =>
								self &&
								f.entity_id === self.id &&
								f.predicate === predicate &&
								f.owner_user_id === viewer &&
								live(f.status)
						)
						.map((f) => f.object_entity_id)
				);
			const known = objects('knows');
			const owned = objects('owns');
			const touched = new Set(
				this.rows('knowledge_facts')
					.filter((f) => f.owner_user_id === viewer)
					.flatMap((f) => [f.entity_id, f.object_entity_id].filter(Boolean))
			);
			let matched: Set<string> | null = null;
			if (args.p_query) {
				const hits = await this.rpc('knowledge_search', {
					p_query: args.p_query,
					p_viewer: viewer
				});
				matched = new Set((hits.data as Row[]).map((h) => h.entity_id));
			}
			const pool = this.rows('knowledge_entities').filter(
				(e) =>
					e.status === 'active' &&
					!e.is_self &&
					(e.owner_user_id === viewer || (e.scope === 'public' && touched.has(e.id))) &&
					(args.p_filter !== 'known' || known.has(e.id)) &&
					(args.p_filter !== 'owned' || owned.has(e.id)) &&
					(!matched || matched.has(e.id))
			);
			const filtered = pool.filter((e) => !args.p_kinds || args.p_kinds.includes(e.kind));
			const counts: Record<string, number> = {};
			for (const e of pool) counts[e.kind] = (counts[e.kind] ?? 0) + 1;
			return {
				data: {
					entities: filtered
						.slice(args.p_offset, args.p_offset + args.p_limit)
						.map((e) => ({
							id: e.id,
							kind: e.kind,
							name: e.name,
							summary: e.summary,
							scope: e.scope,
							is_self: false,
							image_url: e.image_url,
							updated_at: e.updated_at
						})),
					total: filtered.length,
					counts,
					known_count: [...known].filter((id) =>
						this.rows('knowledge_entities').some(
							(e) => e.id === id && e.status === 'active'
						)
					).length
				},
				error: null
			};
		}
		return { data: null, error: { message: `rpc ${fn} not faked` } };
	}
}

class FakeQuery implements PromiseLike<{ data: any; error: any }> {
	private op: 'select' | 'insert' | 'update' | 'delete' | 'upsert' = 'select';
	private filters: Array<(r: Row) => boolean> = [];
	private payload: Row[] = [];
	private patch: Row = {};
	private mode: 'many' | 'single' | 'maybe' = 'many';
	private orderBy: { col: string; asc: boolean } | null = null;
	private from_ = 0;
	private to_ = Infinity;
	private ignoreDuplicates = false;
	private embedSource = false;

	constructor(
		private db: FakeDb,
		private table: string
	) {}

	select(cols?: string) {
		if (this.op === 'select') this.op = 'select';
		if (cols?.includes('source:knowledge_sources')) this.embedSource = true;
		return this;
	}
	insert(rows: Row | Row[]) {
		this.op = 'insert';
		this.payload = Array.isArray(rows) ? rows : [rows];
		return this;
	}
	upsert(rows: Row | Row[], opts?: { ignoreDuplicates?: boolean }) {
		this.op = 'upsert';
		this.payload = Array.isArray(rows) ? rows : [rows];
		this.ignoreDuplicates = Boolean(opts?.ignoreDuplicates);
		return this;
	}
	update(patch: Row) {
		this.op = 'update';
		this.patch = patch;
		return this;
	}
	delete() {
		this.op = 'delete';
		return this;
	}
	eq(col: string, value: unknown) {
		this.filters.push((r) => r[col] === value);
		return this;
	}
	neq(col: string, value: unknown) {
		this.filters.push((r) => r[col] !== value);
		return this;
	}
	in(col: string, values: unknown[]) {
		this.filters.push((r) => values.includes(r[col]));
		return this;
	}
	or(expr: string) {
		const parts = expr.split(',').map((p) => p.split('.eq.'));
		this.filters.push((r) => parts.some(([col, value]) => String(r[col!]) === value));
		return this;
	}
	order(col: string, opts?: { ascending?: boolean }) {
		this.orderBy = { col, asc: opts?.ascending ?? true };
		return this;
	}
	range(from: number, to: number) {
		this.from_ = from;
		this.to_ = to;
		return this;
	}
	limit(n: number) {
		this.to_ = this.from_ + n - 1;
		return this;
	}
	single() {
		this.mode = 'single';
		return this;
	}
	maybeSingle() {
		this.mode = 'maybe';
		return this;
	}

	then<A, B>(
		ok?: ((v: { data: any; error: any }) => A) | null,
		fail?: ((e: unknown) => B) | null
	) {
		return Promise.resolve(this.run()).then(ok, fail);
	}

	private run(): { data: any; error: any } {
		const all = this.db.rows(this.table);
		const match = (r: Row) => this.filters.every((f) => f(r));
		if (this.op === 'insert' || this.op === 'upsert') {
			const key = UNIQUE[this.table];
			const prepared = this.payload.map((r) => withGenerated(this.table, r));
			const taken = new Set(all.map((r) => key?.(r)).filter(Boolean));
			const accepted: Row[] = [];
			for (const row of prepared) {
				const k = key?.(row);
				if (k && taken.has(k)) {
					if (this.op === 'upsert' && this.ignoreDuplicates) continue;
					return { data: null, error: { code: '23505', message: 'duplicate key' } };
				}
				if (k) taken.add(k);
				accepted.push(row);
			}
			all.push(...accepted);
			return this.shape(accepted);
		}
		if (this.op === 'update') {
			const hit = all.filter(match);
			for (const r of hit) {
				Object.assign(r, this.patch);
				if (this.table === 'knowledge_entities' && this.patch.name)
					r.normalized_name = normalizeKnowledgeName(r.name);
			}
			return this.shape(hit);
		}
		if (this.op === 'delete') {
			const hit = all.filter(match);
			this.db.tables.set(
				this.table,
				all.filter((r) => !hit.includes(r))
			);
			return this.shape(hit);
		}
		let rows = all.filter(match);
		if (this.orderBy) {
			const { col, asc } = this.orderBy;
			rows = [...rows].sort(
				(a, b) => (a[col] < b[col] ? -1 : a[col] > b[col] ? 1 : 0) * (asc ? 1 : -1)
			);
		}
		rows = rows.slice(this.from_, this.to_ === Infinity ? undefined : this.to_ + 1);
		if (this.embedSource) {
			rows = rows.map((r) => ({
				...r,
				source: this.db.rows('knowledge_sources').find((s) => s.id === r.source_id) ?? null
			}));
		}
		return this.shape(rows.map((r) => ({ ...r })));
	}

	private shape(rows: Row[]) {
		if (this.mode === 'single') {
			return rows.length === 1
				? { data: rows[0], error: null }
				: { data: null, error: { code: 'PGRST116', message: 'not single' } };
		}
		if (this.mode === 'maybe') return { data: rows[0] ?? null, error: null };
		return { data: rows, error: null };
	}
}

// ---------------------------------------------------------------------------

const LINKEDIN = `First Name,Last Name,URL,Email Address,Company,Position,Connected On
Maya,Chen,https://www.linkedin.com/in/maya-chen,,Palantir,Deployment Strategist,03 Feb 2025
Sam,Rivera,https://www.linkedin.com/in/sam-rivera,sam@palantir.example,Palantir,Engineer,16 Nov 2026
Craig,,https://www.linkedin.com/in/craig-x,,Craig's Equipment,Owner,01 Jan 2024
`;

function setup() {
	const db = new FakeDb();
	const alice = randomUUID();
	const bob = randomUUID();
	db.rows('users').push({ id: alice, name: 'Alice Wayne' }, { id: bob, name: 'Bob' });
	return {
		db,
		alice,
		bob,
		store: new KnowledgeStore(db, alice),
		bobStore: new KnowledgeStore(db, bob)
	};
}

async function importLinkedIn(store: KnowledgeStore) {
	const parsed = parseContactFile('Connections.csv', LINKEDIN)!;
	const batch = planContactImport(parsed.contacts, { format: parsed.format, sourceRef: 'file' });
	batch.sources = [{ ref: 'file', type: 'import', title: 'Connections.csv' }];
	return store.record(batch, { via: 'import' });
}

describe('KnowledgeStore.record', () => {
	it('imports contacts as private people the user knows, with one org per company', async () => {
		const { db, alice, store } = setup();
		const receipt = await importLinkedIn(store);
		expect(receipt.problems).toEqual([]);
		const entities = db.rows('knowledge_entities');
		expect(entities.every((e) => e.scope === 'private' && e.owner_user_id === alice)).toBe(
			true
		);
		expect(entities.find((e) => e.is_self)?.name).toBe('Alice Wayne');
		expect(
			entities
				.filter((e) => e.kind === 'org')
				.map((e) => e.name)
				.sort()
		).toEqual(["Craig's Equipment", 'Palantir']);
		const knows = db.rows('knowledge_facts').filter((f) => f.predicate === 'knows');
		expect(knows).toHaveLength(3);
		expect(db.rows('knowledge_fact_sources').length).toBeGreaterThan(0);
		// LinkedIn and email identify people; an email value also became a key.
		const keyTypes = db
			.rows('knowledge_entity_keys')
			.map((k) => `${k.key_type}:${k.key_value}`);
		expect(keyTypes).toContain('linkedin:in/sam-rivera');
		expect(keyTypes).toContain('email:sam@palantir.example');
		expect(entities.find((e) => e.name === 'Sam Rivera')?.summary).toBe('Engineer at Palantir');
	});

	it('lands a re-import on the same people and facts', async () => {
		const { db, store } = setup();
		await importLinkedIn(store);
		const before = db.rows('knowledge_entities').length;
		const factsBefore = db.rows('knowledge_facts').length;
		const receipt = await importLinkedIn(store);
		expect(db.rows('knowledge_entities').length).toBe(before);
		expect(db.rows('knowledge_facts').length).toBe(factsBefore);
		expect(receipt.facts.added).toBe(0);
		expect(
			receipt.entities.filter((e) => e.ref !== 'self').every((e) => e.matched !== 'created')
		).toBe(true);
	});

	it('reuses a full-name person but only suggests a merge for a single-word name', async () => {
		const { db, store } = setup();
		await importLinkedIn(store);
		const receipt = await store.record(
			{
				entities: [
					{ ref: 'sam', kind: 'person', name: 'sam rivera' },
					{ ref: 'craig', kind: 'person', name: 'Craig' }
				],
				facts: [{ subject: 'sam', predicate: 'phone', value: '410-555-0101' }]
			},
			{ via: 'chat' }
		);
		expect(receipt.entities.find((e) => e.ref === 'sam')?.matched).toBe('name');
		expect(receipt.entities.find((e) => e.ref === 'craig')?.matched).toBe('created');
		expect(receipt.merge_candidates).toBe(1);
		expect(
			db.rows('knowledge_entities').filter((e) => e.normalized_name === 'craig')
		).toHaveLength(2);
		const phone = db.rows('knowledge_facts').find((f) => f.predicate === 'phone');
		expect(phone?.value_text).toBe('+14105550101');
		expect(db.rows('knowledge_entity_keys').some((k) => k.key_type === 'phone')).toBe(true);
	});

	it('never lets enrichment overwrite a single-valued fact the user recorded', async () => {
		const { db, store } = setup();
		const first = await store.record(
			{
				entities: [{ ref: 'acme', kind: 'org', name: 'Acme' }],
				facts: [{ subject: 'acme', predicate: 'homepage', value: 'acme.example' }]
			},
			{ via: 'manual' }
		);
		const acmeId = first.entities[0]!.id;
		const enriched = await store.record(
			{
				entities: [],
				facts: [
					{ subject: acmeId, predicate: 'homepage', value: 'https://acme-corp.example' }
				]
			},
			{ via: 'enrichment' }
		);
		expect(enriched.facts.suggested).toBe(1);
		const homepages = db.rows('knowledge_facts').filter((f) => f.predicate === 'homepage');
		expect(homepages.map((f) => [f.value_text, f.status]).sort()).toEqual([
			['https://acme-corp.example', 'suggested'],
			['https://acme.example', 'active']
		]);
		// A user correction does replace it.
		const corrected = await store.record(
			{
				entities: [],
				facts: [{ subject: acmeId, predicate: 'homepage', value: 'https://acme.co' }]
			},
			{ via: 'manual' }
		);
		expect(corrected.facts.superseded).toBe(1);
	});

	it('keeps one current value when a batch brings several for a single-valued detail', async () => {
		const { db, store } = setup();
		await store.record(
			{
				entities: [{ ref: 'tim', kind: 'person', name: 'Tim Ferriss' }],
				facts: [
					{
						subject: 'tim',
						predicate: 'headline',
						value: 'Angel Investor',
						confidence: 0.6
					},
					{
						subject: 'tim',
						predicate: 'headline',
						value: 'Author and podcaster',
						confidence: 0.9
					},
					{
						subject: 'tim',
						predicate: 'headline',
						value: 'Author of The 4-Hour Workweek'
					}
				]
			},
			{ via: 'enrichment' }
		);
		const headlines = db.rows('knowledge_facts').filter((f) => f.predicate === 'headline');
		expect(headlines.map((f) => [f.value_text, f.status]).sort()).toEqual([
			['Angel Investor', 'suggested'],
			['Author and podcaster', 'active'],
			['Author of The 4-Hour Workweek', 'suggested']
		]);
	});

	it('rejects facts that do not fit the vocabulary', async () => {
		const { store } = setup();
		const receipt = await store.record(
			{
				entities: [
					{ ref: 'p', kind: 'person', name: 'Pat Example' },
					{ ref: 'q', kind: 'person', name: 'Quinn Example' }
				],
				facts: [
					{ subject: 'p', predicate: 'works_at', object: 'q' },
					{ subject: 'p', predicate: 'email', value: 'nope' },
					{ subject: 'p', predicate: 'invented', value: 'x' }
				]
			},
			{ via: 'mcp' }
		);
		expect(receipt.facts.added).toBe(0);
		expect(receipt.problems.map((p) => p.message)).toEqual([
			'works_at cannot point at a person.',
			'"nope" is not a valid email for email.',
			'Unknown predicate "invented".'
		]);
	});
});

describe('KnowledgeStore privacy', () => {
	it("keeps one user's private entities, facts and search out of another user's view", async () => {
		const { db, store, bobStore } = setup();
		await importLinkedIn(store);
		const sam = db.rows('knowledge_entities').find((e) => e.name === 'Sam Rivera')!;
		expect(await bobStore.getEntity(sam.id)).toBeNull();
		expect(await bobStore.search('sam')).toEqual([]);
		expect((await bobStore.loadEntities([sam.id])).size).toBe(0);
		expect((await bobStore.list()).total).toBe(0);
		// Bob cannot attach facts to Alice's entity by id.
		const receipt = await bobStore.record(
			{ entities: [], facts: [{ subject: sam.id, predicate: 'note', value: 'hi' }] },
			{ via: 'chat' }
		);
		expect(receipt.facts.added).toBe(0);
		expect(receipt.problems[0]!.message).toContain('Unknown subject');
	});

	it('shows a public entity to everyone but private facts about it only to their owner', async () => {
		const { db, alice, store, bobStore } = setup();
		const karp = {
			id: randomUUID(),
			kind: 'org',
			name: 'Palantir Public',
			scope: 'public',
			owner_user_id: null
		};
		db.rows('knowledge_entities').push({
			...karp,
			status: 'active',
			is_self: false,
			summary: null,
			image_url: null,
			merged_into_id: null,
			normalized_name: 'palantir public'
		});
		await store.record(
			{
				entities: [],
				facts: [{ subject: karp.id, predicate: 'phone', value: '+1 410 555 0100' }]
			},
			{ via: 'manual' }
		);
		const fact = db.rows('knowledge_facts').find((f) => f.predicate === 'phone')!;
		expect(fact).toMatchObject({ scope: 'private', owner_user_id: alice });
		expect((await store.getEntity(karp.id))!.facts).toHaveLength(1);
		expect((await bobStore.getEntity(karp.id))!.facts).toHaveLength(0);
	});
});

describe('KnowledgeStore reads', () => {
	it('answers "who do I know at Palantir" with paths and coverage', async () => {
		const { store } = setup();
		await importLinkedIn(store);
		const result = await store.query({
			start: { search: 'Palantir', kinds: ['org'] },
			follow: [{ predicate: 'works_at', direction: 'in', kinds: ['person'] }],
			where: { known_by_me: true },
			fields: ['email', 'profile_url']
		});
		expect(result.start_count).toBe(1);
		expect(result.rows.map((r) => r.entity.name).sort()).toEqual(['Maya Chen', 'Sam Rivera']);
		const maya = result.rows.find((r) => r.entity.name === 'Maya Chen')!;
		expect(maya.path[0]).toMatchObject({
			predicate: 'works_at',
			direction: 'in',
			qualifiers: { title: 'Deployment Strategist' }
		});
		expect(result.coverage.email).toEqual({ known: 1, missing: 1 });
		expect(result.coverage.profile_url).toEqual({ known: 2, missing: 0 });
	});

	it('loads an org card with the people who work there and the import as their source', async () => {
		const { db, store } = setup();
		await importLinkedIn(store);
		const palantir = db.rows('knowledge_entities').find((e) => e.name === 'Palantir')!;
		const detail = (await store.getEntity(palantir.id))!;
		expect(detail.incoming.map((f) => [f.label, f.entity?.name]).sort()).toEqual([
			['People', 'Maya Chen'],
			['People', 'Sam Rivera']
		]);
		const sam = db.rows('knowledge_entities').find((e) => e.name === 'Sam Rivera')!;
		const samDetail = (await store.getEntity(sam.id))!;
		expect(samDetail.known_by_me).toBe(true);
		expect(samDetail.facts.find((f) => f.predicate === 'works_at')?.sources[0]).toMatchObject({
			type: 'import',
			title: 'Connections.csv'
		});
	});

	it('lists people I know with per-kind counts', async () => {
		const { store } = setup();
		await importLinkedIn(store);
		const known = await store.list({ filter: 'known' });
		expect(known.total).toBe(3);
		expect(known.counts).toEqual({ person: 3 });
		expect(known.known_count).toBe(3);
		const all = await store.list();
		expect(all.counts).toEqual({ person: 3, org: 2 });
	});
});

// Regressions from the 2026-11-17 adversarial review.
async function importFile(store: KnowledgeStore, name: string, text: string) {
	const parsed = parseContactFile(name, text)!;
	const batch = planContactImport(parsed.contacts, { format: parsed.format, sourceRef: 'file' });
	batch.sources = [{ ref: 'file', type: 'import', title: name }];
	return store.record(batch, { via: 'import' });
}
const people = (db: FakeDb, owner: string) =>
	db
		.rows('knowledge_entities')
		.filter((e) => e.kind === 'person' && !e.is_self && e.owner_user_id === owner)
		.map((e) => e.name)
		.sort();

describe('KnowledgeStore identity', () => {
	const SHARED_LINE = [
		'BEGIN:VCARD\nVERSION:3.0\nFN:Jane Smith\nTEL;TYPE=HOME:(410) 555-0100\nBDAY:1960-01-01\nEND:VCARD',
		'BEGIN:VCARD\nVERSION:3.0\nFN:John Smith\nTEL;TYPE=HOME:(410) 555-0100\nBDAY:1958-12-25\nEND:VCARD'
	].join('\n');

	it('keeps two people who share a home phone apart, across re-imports', async () => {
		const { db, alice, store } = setup();
		await importFile(store, 'a.vcf', SHARED_LINE);
		await importFile(store, 'a.vcf', SHARED_LINE);
		expect(people(db, alice)).toEqual(['Jane Smith', 'John Smith']);
		const birthdays = db
			.rows('knowledge_facts')
			.filter((f) => f.predicate === 'birthday' && f.status === 'active');
		expect(birthdays).toHaveLength(2);
	});

	it('treats the same contact twice in one file as one person', async () => {
		const { db, alice, store } = setup();
		await importFile(
			store,
			'b.vcf',
			'BEGIN:VCARD\nVERSION:3.0\nFN:Pat Lee\nEMAIL:pat@x.com\nEND:VCARD\nBEGIN:VCARD\nVERSION:3.0\nFN:Pat Lee\nEMAIL:pat@x.com\nTEL:+1 410 555 0199\nEND:VCARD'
		);
		expect(people(db, alice)).toEqual(['Pat Lee']);
	});

	it('re-imports a one-word contact onto the same entry', async () => {
		const { db, alice, store } = setup();
		const card = 'BEGIN:VCARD\nVERSION:3.0\nFN:Plumber\nTEL:555-0123\nEND:VCARD';
		for (let i = 0; i < 3; i++) await importFile(store, 'c.vcf', card);
		expect(people(db, alice)).toEqual(['Plumber']);
		expect(db.rows('knowledge_merge_candidates')).toHaveLength(0);
	});

	it('never folds two LinkedIn profiles with the same name into one person', async () => {
		const { db, alice, store } = setup();
		// Already mentioned in a task, without a profile.
		await store.record(
			{ entities: [{ ref: 'a', kind: 'person', name: 'John Smith' }], facts: [] },
			{ via: 'task' }
		);
		const csv = `First Name,Last Name,URL,Email Address,Company,Position,Connected On
John,Smith,https://www.linkedin.com/in/john-smith-1,,Acme,CEO,01 Jan 2024
John,Smith,https://www.linkedin.com/in/john-smith-2,,Globex,Intern,01 Jan 2024
Ann,Bee,https://www.linkedin.com/in/ann-100%-bee,,Acme,CTO,01 Jan 2024
`;
		await importFile(store, 'Connections.csv', csv);
		await importFile(store, 'Connections.csv', csv);
		expect(people(db, alice)).toEqual(['Ann Bee', 'John Smith', 'John Smith']);
	});
});
