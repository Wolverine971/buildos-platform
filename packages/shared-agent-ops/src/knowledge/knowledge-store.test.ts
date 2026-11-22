// packages/shared-agent-ops/src/knowledge/knowledge-store.test.ts
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { parseContactFile, planContactImport } from './contacts-import';
import {
	KNOWLEDGE_FOCUS_GUIDANCE,
	loadKnowledgeFocusBrief,
	renderKnowledgeFocusBlock,
	renderKnowledgeFocusBrief
} from './focus-brief';
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
	if (table === 'knowledge_merge_candidates') out.status ??= 'pending';
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
		if (fn === 'knowledge_merge_entities') {
			// The parts of public.knowledge_merge_entities these tests read.
			const merge = this.rows('knowledge_entities').find(
				(e) =>
					e.id === args.p_merge &&
					e.owner_user_id === args.p_viewer &&
					e.scope === 'private' &&
					e.status !== 'merged'
			);
			if (!merge)
				return {
					data: null,
					error: { code: '42501', message: 'You can only merge away your own entities' }
				};
			for (const table of ['knowledge_record_links', 'knowledge_mentions', 'knowledge_facts'])
				for (const r of this.rows(table))
					if (r.entity_id === args.p_merge) r.entity_id = args.p_keep;
			merge.status = 'merged';
			merge.merged_into_id = args.p_keep;
			return { data: { kept: args.p_keep, merged: args.p_merge }, error: null };
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
	is(col: string, value: unknown) {
		this.filters.push((r) => (r[col] ?? null) === value);
		return this;
	}
	or(expr: string) {
		// `col.eq.value` pairs, or `col.ilike."%phrase%"` (a quoted, case-insensitive contains).
		const tests = expr.split(/,(?=[a-z_]+\.(?:eq|ilike)\.)/).map((part) => {
			const like = /^([a-z_]+)\.ilike\."%(.*)%"$/.exec(part);
			if (like) {
				const needle = like[2]!.toLowerCase();
				return (r: Row) =>
					String(r[like[1]!] ?? '')
						.toLowerCase()
						.includes(needle);
			}
			const [col, value] = part.split('.eq.');
			return (r: Row) => String(r[col!]) === value;
		});
		this.filters.push((r) => tests.some((test) => test(r)));
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
					if (this.op === 'upsert') {
						// ON CONFLICT DO UPDATE: the given columns win, the rest stay.
						const existing = all.find((r) => key?.(r) === k)!;
						const given = (Array.isArray(this.payload) ? this.payload : [this.payload])[
							prepared.indexOf(row)
						]!;
						Object.assign(existing, given);
						accepted.push(existing);
						continue;
					}
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

	it('keeps one current value when an old value is restated (A, then B, then A)', async () => {
		const { db, store } = setup();
		const say = (value: string, subject: string | { ref: string }) =>
			store.record(
				{
					entities:
						typeof subject === 'string'
							? []
							: [{ ...subject, kind: 'person', name: 'Ana' }],
					facts: [
						{
							subject: typeof subject === 'string' ? subject : subject.ref,
							predicate: 'headline',
							value
						}
					]
				},
				{ via: 'manual' }
			);
		const first = await say('Teacher', { ref: 'ana' });
		const ana = first.entities[0]!.id;
		await say('Principal', ana);
		await say('Teacher', ana);
		const headlines = db.rows('knowledge_facts').filter((f) => f.predicate === 'headline');
		expect(headlines.map((f) => [f.value_text, f.status]).sort()).toEqual([
			['Principal', 'superseded'],
			['Teacher', 'active']
		]);
		expect(db.rows('knowledge_entities').find((e) => e.id === ana)!.summary).toBe('Teacher');
	});

	it('creates one entry when two writes name the same new person at once', async () => {
		const { db, store, alice } = setup();
		const other = new KnowledgeStore(db, alice);
		const batch = (task: string) => ({
			entities: [{ ref: 'louis', kind: 'person' as const, name: 'Louis Arnette' }],
			facts: [{ subject: 'louis', predicate: 'headline', value: `Mentioned in ${task}` }]
		});
		await Promise.all([
			store.record(batch('task 1'), { via: 'task' }),
			other.record(batch('task 2'), { via: 'task' })
		]);
		const louis = db.rows('knowledge_entities').filter((e) => e.name === 'Louis Arnette');
		expect(louis).toHaveLength(1);
	});

	it('keeps the current value when its replacement fails to save', async () => {
		const { db, store } = setup();
		const first = await store.record(
			{
				entities: [{ ref: 'ana', kind: 'person', name: 'Ana' }],
				facts: [{ subject: 'ana', predicate: 'headline', value: 'Teacher' }]
			},
			{ via: 'manual' }
		);
		const ana = first.entities[0]!.id;
		const from = db.from.bind(db);
		db.from = (table: string) => {
			const query = from(table);
			if (table !== 'knowledge_facts') return query;
			const insert = query.insert.bind(query);
			query.insert = (payload: unknown) => {
				insert(payload);
				return {
					select: () => ({
						then: (ok: any) =>
							ok({ data: null, error: { code: '22001', message: 'too long' } }),
						single: () => ({
							then: (ok: any) =>
								ok({ data: null, error: { code: '22001', message: 'too long' } })
						})
					})
				} as any;
			};
			return query;
		};
		const receipt = await store.record(
			{ entities: [], facts: [{ subject: ana, predicate: 'headline', value: 'Principal' }] },
			{ via: 'manual' }
		);
		db.from = from;
		expect(receipt.problems).toHaveLength(1);
		expect(receipt.facts.superseded).toBe(0);
		const headlines = db.rows('knowledge_facts').filter((f) => f.predicate === 'headline');
		expect(headlines.map((f) => [f.value_text, f.status])).toEqual([['Teacher', 'active']]);
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

	it('files a one-word name from a doc re-read under the same entry every time', async () => {
		const { db, alice, store } = setup();
		const craig = {
			entities: [{ ref: 'c', kind: 'person' as const, name: 'Craig' }],
			facts: []
		};
		await store.record(craig, { via: 'backfill' });
		// The document re-reader runs on every edit (tasker 167); it used to add a Craig each time.
		for (let i = 0; i < 3; i++) await store.record(craig, { via: 'system' });
		expect(people(db, alice)).toEqual(['Craig']);
	});

	it('never adds another copy when several same-name entries already exist', async () => {
		const { db, alice, store } = setup();
		const craig = {
			entities: [{ ref: 'c', kind: 'person' as const, name: 'Craig' }],
			facts: []
		};
		await store.record(craig, { via: 'backfill' });
		await store.record(craig, { via: 'chat' });
		const before = people(db, alice).length;
		const receipt = await store.record(craig, { via: 'system' });
		expect(people(db, alice)).toHaveLength(before);
		expect(receipt.entities[0]).toMatchObject({ matched: 'name' });
	});

	describe('merging by hand', () => {
		const person = (name: string) => ({
			entities: [{ ref: 'p', kind: 'person' as const, name }],
			facts: []
		});
		async function twoCraigs(store: KnowledgeStore) {
			const a = (await store.record(person('Craig'), { via: 'backfill' })).entities[0]!.id;
			// A chat naming "Craig" doesn't reuse a one-word name: a second Craig.
			const b = (await store.record(person('Craig'), { via: 'chat' })).entities[0]!.id;
			return { a, b };
		}

		it('offers same-name entries as one group, until you say they are different', async () => {
			const { db, alice, store } = setup();
			const { a, b } = await twoCraigs(store);
			await store.record(person('Dana Lee'), { via: 'chat' });
			expect(await store.listNameTwins()).toEqual([
				{ kind: 'person', name: 'Craig', ids: [a, b] }
			]);
			const pair = db
				.rows('knowledge_merge_candidates')
				.find((c) => c.owner_user_id === alice)!;
			await store.resolveMergeCandidate(pair.id, 'rejected');
			expect(await store.listNameTwins()).toEqual([]);
		});

		it('"Different people" on a same-name group keeps it from coming back', async () => {
			const { store } = setup();
			const { a, b } = await twoCraigs(store);
			const c = (await store.record(person('Craig'), { via: 'chat' })).entities[0]!.id;
			await store.markDifferent([a, b, c]);
			expect(await store.listNameTwins()).toEqual([]);
			// The pending "same person?" questions for those pairs are answered too.
			expect(await store.listMergeCandidates()).toEqual([]);
		});

		it('never shows another user their own twins', async () => {
			const { store, bobStore } = setup();
			await twoCraigs(store);
			expect(await bobStore.listNameTwins()).toEqual([]);
		});

		it('suggests keeping the entry with the most attached, and counts what moves', async () => {
			const { db, alice, store } = setup();
			const { a, b } = await twoCraigs(store);
			for (let i = 0; i < 3; i++)
				db.rows('knowledge_record_links').push({
					entity_id: b,
					owner_user_id: alice,
					record_kind: 'task',
					record_id: randomUUID()
				});
			db.rows('knowledge_mentions').push({ entity_id: a, owner_user_id: alice });
			const preview = await store.mergePreview([a, b]);
			expect(preview.suggested_keep).toBe(b);
			expect(preview.entries.map((e) => [e.id, e.links, e.mentions, e.mergeable])).toEqual([
				[a, 0, 1, true],
				[b, 3, 0, true]
			]);
		});

		it("can't preview someone else's entries", async () => {
			const { store, bobStore } = setup();
			const { a } = await twoCraigs(store);
			expect((await bobStore.mergePreview([a])).entries).toEqual([]);
		});

		it('folds several into one and reports the ones it could not', async () => {
			const { db, alice, store, bobStore } = setup();
			const { a, b } = await twoCraigs(store);
			const c = (await store.record(person('Craig'), { via: 'chat' })).entities[0]!.id;
			const bobs = (await bobStore.record(person('Craig Bob'), { via: 'chat' })).entities[0]!
				.id;
			const result = await store.mergeMany(a, [b, c, bobs, a]);
			expect(result.merged).toEqual([b, c]);
			expect(result.failed.map((f) => f.id)).toEqual([bobs]);
			const active = db
				.rows('knowledge_entities')
				.filter(
					(e) => e.owner_user_id === alice && e.kind === 'person' && e.status === 'active'
				);
			expect(active.map((e) => e.id)).toEqual([a]);
			expect(await store.listNameTwins()).toEqual([]);
		});
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

// ---------------------------------------------------------------------------
// Tasker 164, part A: know first, "Not this one", identity questions, circles.

describe('know first: anchors, circles, identity questions, Not this one', () => {
	async function codyWithWrongResearch() {
		const { db, alice, store } = setup();
		const taskId = randomUUID();
		db.rows('onto_tasks').push({
			id: taskId,
			title: 'Cody Shooting Complex site refresh',
			description:
				'Update codyshootingcomplex.org events page for the Cody Shooting Complex. Questions: range@codyshootingcomplex.org or 307-555-0142.'
		});
		const runId = randomUUID();
		const receipt = await store.record(
			{
				entities: [
					{ ref: 'cody', kind: 'org', name: 'Cody Shooting Complex' },
					{ ref: 'iowa', kind: 'place', name: 'Long Grove, IA' }
				],
				facts: [],
				links: [
					{
						entity: 'cody',
						record_kind: 'task',
						record_id: taskId,
						quote: 'Cody Shooting Complex site refresh'
					}
				]
			},
			{ via: 'task' }
		);
		const cody = receipt.entities.find((e) => e.ref === 'cody')!.id;
		// A research run that found the Iowa range.
		await store.record(
			{
				entities: [
					{ ref: 'cody', id: cody, kind: 'org', name: 'Cody Shooting Complex' },
					{ ref: 'town', kind: 'place', name: 'Long Grove, Iowa' }
				],
				sources: [
					{
						ref: 'p1',
						type: 'web',
						url: 'https://www.iowadnr.gov/places-to-go/cody',
						title: 'Cody Shooting Complex | Iowa DNR'
					}
				],
				facts: [
					{
						subject: 'cody',
						predicate: 'located_in',
						object: 'town',
						sources: ['p1'],
						quote: 'located near Long Grove, Iowa'
					},
					{
						subject: 'cody',
						predicate: 'industry',
						value: 'Shooting range',
						sources: ['p1'],
						quote: 'public shooting range'
					}
				]
			},
			{ via: 'enrichment', runId }
		);
		return { db, alice, store, cody, runId, taskId };
	}

	it('gathers anchors from the graph and linked work, blanking contact details', async () => {
		const { db, store, cody } = await codyWithWrongResearch();
		const { gatherKnowledgeAnchors } = await import('./anchors');
		const detail = (await store.getEntity(cody))!;
		const anchors = await gatherKnowledgeAnchors(store, db, detail, { circle: 'inner' });
		expect(anchors.domains).toEqual(['codyshootingcomplex.org']);
		expect(anchors.mentions[0]!.text).toContain('Cody Shooting Complex');
		expect(JSON.stringify(anchors)).not.toMatch(/307-555|range@/);
		expect(anchors.circle).toBe('inner');
	});

	it('"Not this one" retracts the run, hides what it alone created, and remembers the hint', async () => {
		const { db, store, cody, runId } = await codyWithWrongResearch();
		const result = await store.rejectResearchRun(cody, runId);
		expect(result.retracted).toBe(2);
		expect(result.hidden).toBe(1); // "Long Grove, Iowa" was only used by that run
		expect(result.hint).toMatchObject({
			label: 'not the Cody Shooting Complex in Long Grove, Iowa',
			domains: [],
			urls: ['https://www.iowadnr.gov/places-to-go/cody']
		});
		const facts = db.rows('knowledge_facts').filter((f) => f.entity_id === cody);
		expect(facts.every((f) => f.status === 'retracted')).toBe(true);
		expect((await store.listResearchHints(cody)).map((h) => h.label)).toEqual([
			'not the Cody Shooting Complex in Long Grove, Iowa'
		]);
		// The next research sees it as an anchor.
		const { gatherKnowledgeAnchors } = await import('./anchors');
		const anchors = await gatherKnowledgeAnchors(store, db, (await store.getEntity(cody))!);
		expect(anchors.not[0]!.urls).toContain('https://www.iowadnr.gov/places-to-go/cody');
	});

	it('"Not this one" brings back the headline and summary the wrong research replaced', async () => {
		const { db, store } = setup();
		const first = await store.record(
			{
				entities: [{ ref: 'sam', kind: 'person', name: 'Sam Rivera' }],
				facts: [{ subject: 'sam', predicate: 'headline', value: 'Chef in Baltimore' }]
			},
			{ via: 'task' }
		);
		const sam = first.entities[0]!.id;
		db.rows('knowledge_facts').find((f) => f.predicate === 'headline')!.created_at =
			'2026-01-01T00:00:00.000Z';
		const runId = randomUUID();
		await store.record(
			{
				entities: [],
				facts: [{ subject: sam, predicate: 'headline', value: 'Engineer at Palantir' }]
			},
			{ via: 'enrichment', runId }
		);
		const card = () => db.rows('knowledge_entities').find((e) => e.id === sam)!;
		expect(card().summary).toBe('Engineer at Palantir');

		await store.rejectResearchRun(sam, runId);
		const headlines = db.rows('knowledge_facts').filter((f) => f.predicate === 'headline');
		expect(headlines.map((f) => [f.value_text, f.status]).sort()).toEqual([
			['Chef in Baltimore', 'active'],
			['Engineer at Palantir', 'retracted']
		]);
		expect(card().summary).toBe('Chef in Baltimore');
	});

	it("never touches another user's research", async () => {
		const { db, cody, runId } = await codyWithWrongResearch();
		const bob = new KnowledgeStore(db, randomUUID());
		await expect(bob.rejectResearchRun(cody, runId)).rejects.toThrow('Entry not found');
	});

	it('files an identity question as a "same one?" pair, keeping the original on top', async () => {
		const { store, cody } = await codyWithWrongResearch();
		const { recordIdentityQuestion } = await import('./identity');
		const { otherEntityId, created } = await recordIdentityQuestion(store, {
			entityId: cody,
			kind: 'org',
			question:
				'Is Cody Shooting Complex, from your work, the same organization as the one in Long Grove, IA?',
			reason: 'Doesn’t fit what you know',
			candidate: {
				name: 'Cody Shooting Complex',
				facts: [{ predicate: 'description', value: 'Public range in Iowa' }]
			},
			via: 'chat'
		});
		expect(created).toBe(true);
		const [pair] = await store.listMergeCandidates();
		expect(pair).toMatchObject({ origin: 'identity', keep_id: cody });
		expect(pair!.question).toContain('Long Grove, IA');
		const other = (await store.getEntity(otherEntityId))!;
		expect(other.facts.map((f) => [f.predicate, f.status])).toEqual([
			['description', 'suggested']
		]);
	});

	it('resolves circles from signals and saves them, leaving ambiguous names unknown without a model', async () => {
		const { db, alice, store, cody } = await codyWithWrongResearch();
		await importLinkedIn(store);
		const sam = db.rows('knowledge_entities').find((e) => e.name === 'Sam Rivera')!.id;
		const { resolveCircles } = await import('./circles');
		const result = await resolveCircles(db, alice, [cody, sam], { decider: null });
		const byId = new Map(result.decisions.map((d) => [d.entityId, d]));
		expect(byId.get(sam)).toMatchObject({ circle: 'inner', source: 'signals' });
		expect(byId.get(cody)).toMatchObject({ circle: 'unknown', reason: 'model_unsure' });
		expect(result.ambiguous).toBe(1);
		expect(db.rows('knowledge_entities').find((e) => e.id === sam)).toMatchObject({
			circle: 'inner',
			circle_source: 'signals'
		});
		// "unknown" from a missing model is not stored, so the next run can still decide it.
		expect(
			db.rows('knowledge_entities').find((e) => e.id === cody)?.circle_source
		).toBeUndefined();
	});
});

describe('changing what an entry is', () => {
	// The Griffin case: a person read out of a list of companies and filed as an organization.
	async function griffinAsOrg(store: KnowledgeStore) {
		const receipt = await store.record(
			{
				entities: [
					{ ref: 'g', kind: 'org', name: 'Griffin Davis' },
					{ ref: 'k', kind: 'person', name: 'Krystal Ball' }
				],
				facts: [
					{ subject: 'g', predicate: 'founded', value: '2021' },
					{ subject: 'g', predicate: 'description', value: 'A warm follow-up' },
					{ subject: 'k', predicate: 'works_at', object: 'g' }
				]
			},
			{ via: 'chat' }
		);
		return receipt.entities.find((e) => e.name === 'Griffin Davis')!.id;
	}
	const statusOf = (db: FakeDb, predicate: string) =>
		db.rows('knowledge_facts').find((f) => f.predicate === predicate)!.status;

	it('makes an organization a person and retracts only what no longer fits', async () => {
		const { db, store } = setup();
		const id = await griffinAsOrg(store);
		db.rows('knowledge_entities').find((e) => e.id === id)!.enriched_at =
			'2026-11-22T01:46:30Z';

		const change = await store.changeEntityKind(id, 'person');

		expect(change).toMatchObject({ kind: 'person', previous_kind: 'org', retracted: 2 });
		const row = db.rows('knowledge_entities').find((e) => e.id === id)!;
		expect(row.kind).toBe('person');
		// Researched as a company: it counts as not researched once it is a person.
		expect(row.enriched_at).toBeNull();
		expect(statusOf(db, 'founded')).toBe('retracted'); // a person has no founding year
		expect(statusOf(db, 'works_at')).toBe('retracted'); // nobody works at a person
		expect(statusOf(db, 'description')).toBe('active');
	});

	it('names the same-name entry of the new kind and asks whether they are the same', async () => {
		const { db, alice, store } = setup();
		const id = await griffinAsOrg(store);
		const person = (
			await store.record(
				{ entities: [{ ref: 'p', kind: 'person', name: 'Griffin Davis' }], facts: [] },
				{ via: 'backfill' }
			)
		).entities[0]!.id;
		expect(person).not.toBe(id);

		const change = await store.changeEntityKind(id, 'person');

		expect(change.same_name).toEqual([{ id: person, name: 'Griffin Davis' }]);
		const question = db
			.rows('knowledge_merge_candidates')
			.find((c) => c.owner_user_id === alice && [c.entity_a, c.entity_b].includes(id));
		expect([question?.entity_a, question?.entity_b].sort()).toEqual([id, person].sort());
	});

	it('does nothing when the kind is already right', async () => {
		const { db, store } = setup();
		const id = await griffinAsOrg(store);
		const change = await store.changeEntityKind(id, 'org');
		expect(change).toMatchObject({ retracted: 0, same_name: [] });
		expect(statusOf(db, 'founded')).toBe('active');
	});

	it("refuses someone else's entry, the user's own entry, and unknown kinds", async () => {
		const { db, store, bobStore } = setup();
		const id = await griffinAsOrg(store);
		await expect(bobStore.changeEntityKind(id, 'person')).rejects.toMatchObject({
			code: 'NOT_FOUND'
		});
		expect(db.rows('knowledge_entities').find((e) => e.id === id)!.kind).toBe('org');
		const self = await store.ensureSelf();
		await expect(store.changeEntityKind(self, 'org')).rejects.toMatchObject({
			code: 'INVALID'
		});
		await expect(store.changeEntityKind(id, 'company' as never)).rejects.toMatchObject({
			code: 'INVALID'
		});
	});
});

describe('focus brief: everything known about one entry, before the chat starts', () => {
	// What production looked like on 2026-11-21: "Griffin Davis" filed as an organization from one
	// line in a context doc, while a separate person entry held the employer and the real work.
	async function griffinWorld() {
		const world = setup();
		const { db, alice, store } = world;
		const project = randomUUID();
		db.rows('onto_projects').push({ id: project, name: 'Wayne Strategies', deleted_at: null });
		const doc = (title: string, content: string) => {
			const id = randomUUID();
			db.rows('onto_documents').push({
				id,
				title,
				content,
				project_id: project,
				deleted_at: null,
				updated_at: '2026-11-20T00:00:00Z'
			});
			return id;
		};
		const contextDoc = doc(
			'Wayne Strategies Context',
			'Sequence: Murtech → Oceanetics → Cutlass; Griffin is a warm follow-up.'
		);
		const pitchDoc = doc(
			'Pitch Desk',
			'Griffin Davis produces Breaking Points. Reach him at griffin@breakingpoints.com about the story page.'
		);
		const unlinkedDoc = doc(
			'Email drafts',
			'Draft for Griffin Davis: following up on the Breaking Points story page sketch.'
		);
		const task = randomUUID();
		db.rows('onto_tasks').push({
			id: task,
			title: 'Follow up with Griffin Davis',
			description: 'Breaking Points story page',
			project_id: project,
			deleted_at: null,
			updated_at: '2026-11-19T00:00:00Z'
		});

		const org = (
			await store.record(
				{ entities: [{ ref: 'g', kind: 'org', name: 'Griffin Davis' }], facts: [] },
				{ via: 'chat' }
			)
		).entities[0]!.id;
		const saved = await store.record(
			{
				entities: [
					{ ref: 'p', kind: 'person', name: 'Griffin Davis' },
					{ ref: 'bp', kind: 'org', name: 'Breaking Points' }
				],
				facts: [{ subject: 'p', predicate: 'works_at', object: 'bp' }]
			},
			{ via: 'backfill' }
		);
		const person = saved.entities.find((e) => e.kind === 'person')!.id;
		expect(person).not.toBe(org);
		const link = (entity_id: string, record_kind: string, record_id: string, quote?: string) =>
			db.rows('knowledge_record_links').push({
				id: randomUUID(),
				entity_id,
				owner_user_id: alice,
				record_kind,
				record_id,
				quote: quote ?? null,
				created_via: 'system',
				created_at: '2026-11-18T00:00:00Z'
			});
		link(org, 'document', contextDoc, '…Cutlass; Griffin is a warm follow-up…');
		link(person, 'document', pitchDoc);
		link(person, 'task', task);
		return { ...world, org, person, contextDoc, pitchDoc, unlinkedDoc, task };
	}

	it('pulls in the same-name copy, its employer and its linked work', async () => {
		const { db, alice, store, org, person, pitchDoc, task } = await griffinWorld();
		const brief = (await loadKnowledgeFocusBrief(store, db, alice, org))!;

		expect(brief.entity).toMatchObject({ id: org, kind: 'org', name: 'Griffin Davis' });
		expect(brief.twins).toHaveLength(1);
		expect(brief.twins[0]).toMatchObject({ id: person, kind: 'person', why: 'same_name' });
		// The lead research never had: the copy says where he works.
		expect(brief.twins[0]!.facts).toEqual([
			expect.objectContaining({ predicate: 'works_at', value: 'Breaking Points' })
		]);
		expect(brief.records.map((r) => [r.id, r.via])).toEqual([
			[expect.any(String), 'linked'],
			[pitchDoc, 'twin'],
			[task, 'twin']
		]);
		expect(brief.projects).toEqual([
			expect.objectContaining({ name: 'Wayne Strategies', records: 3 })
		]);
	});

	it('never puts an email address or phone number from a record into the brief', async () => {
		const { db, alice, store, org } = await griffinWorld();
		const text = renderKnowledgeFocusBlock(
			(await loadKnowledgeFocusBrief(store, db, alice, org))!
		);
		expect(text).toContain('Griffin Davis produces Breaking Points');
		expect(text).not.toContain('griffin@breakingpoints.com');
		expect(text).toContain('[email]');
	});

	it('finds unlinked records by full name only when the client is user-scoped', async () => {
		const { db, alice, store, org, unlinkedDoc } = await griffinWorld();
		const without = (await loadKnowledgeFocusBrief(store, db, alice, org))!;
		expect(without.records.some((r) => r.id === unlinkedDoc)).toBe(false);

		const withText = (await loadKnowledgeFocusBrief(store, db, alice, org, {
			textSearch: true
		}))!;
		const found = withText.records.find((r) => r.id === unlinkedDoc)!;
		expect(found).toMatchObject({ via: 'text', title: 'Email drafts' });
		// Already-listed records are not repeated as text matches.
		expect(new Set(withText.records.map((r) => r.id)).size).toBe(withText.records.length);
	});

	it('renders the entry id, the copy, what is missing and how to work, within the budget', async () => {
		const { db, alice, store, org, person } = await griffinWorld();
		const text = renderKnowledgeFocusBlock(
			(await loadKnowledgeFocusBrief(store, db, alice, org, { textSearch: true }))!
		);
		expect(text).toContain(`entry id ${org}`);
		expect(text).toContain(`entry id ${person}`);
		expect(text).toContain('Probably the same one, saved separately');
		expect(text).toContain('Works at: Breaking Points');
		expect(text).toContain('Still missing:');
		expect(text).toContain('never researched');
		expect(text.endsWith(KNOWLEDGE_FOCUS_GUIDANCE)).toBe(true);
		expect(text.length).toBeLessThan(9_000 + KNOWLEDGE_FOCUS_GUIDANCE.length + 10);
	});

	it('opens by saying what the entry is, and gives a research model the leads without ids or chat wording', async () => {
		const { db, alice, store, org, person } = await griffinWorld();
		const brief = (await loadKnowledgeFocusBrief(store, db, alice, org, { textSearch: true }))!;
		const chat = renderKnowledgeFocusBlock(brief);
		expect(chat.startsWith("## This chat is about one entry in the user's knowledge graph")).toBe(
			true
		);
		expect(chat.indexOf('## In focus:')).toBeLessThan(chat.indexOf('## Your job in this chat'));

		const research = renderKnowledgeFocusBrief(brief, { audience: 'research' });
		expect(research.startsWith('Entry: Griffin Davis · filed as organization')).toBe(true);
		expect(research).toContain('Works at: Breaking Points');
		expect(research).toContain('Their details are leads about this entry');
		for (const noise of [org, person, 'entry id', 'opened this chat', 'tell the user'])
			expect(research).not.toContain(noise);
	});

	it("is empty for another user's entry and for ids that are not entries", async () => {
		const { db, bob, bobStore, org } = await griffinWorld();
		expect(await loadKnowledgeFocusBrief(bobStore, db, bob, org)).toBeNull();
		expect(await loadKnowledgeFocusBrief(bobStore, db, bob, 'not-an-id')).toBeNull();
	});
});
