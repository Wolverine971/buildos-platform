// packages/shared-agent-ops/src/knowledge/mention-sync.test.ts
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { askSimilarNames, syncRecordMentions } from './mention-sync';
import { KnowledgeStore } from './knowledge-store';
import { normalizeKnowledgeName } from './normalize';

// A small in-memory PostgREST stand-in (service-role: no RLS), with the merge function's
// effect on links, mentions and aliases.
type Row = Record<string, any>;

class Db {
	tables = new Map<string, Row[]>();
	rows(table: string) {
		if (!this.tables.has(table)) this.tables.set(table, []);
		return this.tables.get(table)!;
	}
	from(table: string) {
		return new Query(this, table);
	}
	async rpc(fn: string, args: Row) {
		if (fn !== 'knowledge_merge_entities') return { data: null, error: { message: 'no rpc' } };
		const keep = args.p_keep;
		const merge = args.p_merge;
		const entities = this.rows('knowledge_entities');
		const merged = entities.find((e) => e.id === merge)!;
		for (const l of this.rows('knowledge_record_links'))
			if (l.entity_id === merge) l.entity_id = keep;
		for (const m of this.rows('knowledge_mentions'))
			if (m.entity_id === merge) m.entity_id = keep;
		this.rows('knowledge_facts').push({
			id: randomUUID(),
			entity_id: keep,
			predicate: 'alias',
			value_text: merged.name,
			owner_user_id: merged.owner_user_id,
			created_via: 'manual',
			status: 'active'
		});
		merged.status = 'merged';
		merged.merged_into_id = keep;
		return { data: { kept: keep, merged: merge }, error: null };
	}
}

class Query implements PromiseLike<{ data: any; error: any }> {
	op = 'select';
	filters: Array<(r: Row) => boolean> = [];
	payload: Row[] = [];
	patch: Row = {};
	mode: 'many' | 'single' | 'maybe' = 'many';
	ignore = false;
	constructor(
		private db: Db,
		private table: string
	) {}
	select() {
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
		this.ignore = Boolean(opts?.ignoreDuplicates);
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
	eq(col: string, v: unknown) {
		this.filters.push((r) => r[col] === v);
		return this;
	}
	neq(col: string, v: unknown) {
		this.filters.push((r) => r[col] !== v);
		return this;
	}
	in(col: string, vs: unknown[]) {
		this.filters.push((r) => vs.includes(r[col]));
		return this;
	}
	or(expr: string) {
		const parts = expr.split(',').map((p) => p.split('.eq.'));
		this.filters.push((r) => parts.some(([c, v]) => String(r[c!]) === v));
		return this;
	}
	order() {
		return this;
	}
	range() {
		return this;
	}
	limit() {
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
	run() {
		const all = this.db.rows(this.table);
		const match = (r: Row) => this.filters.every((f) => f(r));
		if (this.op === 'insert' || this.op === 'upsert') {
			const added = this.payload.map((r) => {
				const row: Row = { id: randomUUID(), status: 'active', ...r };
				if (this.table === 'knowledge_entities') {
					row.normalized_name = normalizeKnowledgeName(row.name);
					row.merged_into_id ??= null;
					row.is_self ??= false;
					row.enriched_at ??= null;
				}
				return row;
			});
			const fresh =
				this.table === 'knowledge_record_links'
					? added.filter(
							(a) =>
								!all.some(
									(r) =>
										r.entity_id === a.entity_id &&
										r.record_id === a.record_id &&
										r.owner_user_id === a.owner_user_id
								)
						)
					: this.table === 'knowledge_merge_candidates'
						? added.filter(
								(a) =>
									!all.some(
										(r) =>
											[r.entity_a, r.entity_b].sort().join() ===
											[a.entity_a, a.entity_b].sort().join()
									)
							)
						: this.table === 'knowledge_mention_reads'
							? (() => {
									this.db.tables.set(
										this.table,
										all.filter(
											(r) => !added.some((a) => a.record_id === r.record_id)
										)
									);
									return added;
								})()
							: added;
			this.db.rows(this.table).push(...fresh);
			return this.shape(fresh);
		}
		if (this.op === 'update') {
			const hit = all.filter(match);
			for (const r of hit) Object.assign(r, this.patch);
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
		return this.shape(all.filter(match).map((r) => ({ ...r })));
	}
	shape(rows: Row[]) {
		if (this.mode === 'single')
			return rows.length === 1
				? { data: rows[0], error: null }
				: { data: null, error: { message: 'not single' } };
		if (this.mode === 'maybe') return { data: rows[0] ?? null, error: null };
		return { data: rows, error: null };
	}
}

const DOC_BEFORE =
	'## Vision\n\nWeb project for a pistol shooting client, referred by Phil Valeo from thecadretraining.com. Key decisions include the domain.';
const DOC_FIXED = DOC_BEFORE.replace('Phil Valeo', 'Phillip Velayo');

function setup() {
	const db = new Db();
	const user = randomUUID();
	const doc = randomUUID();
	const project = randomUUID();
	const person = (name: string, extra: Row = {}) => {
		const row: Row = {
			id: randomUUID(),
			kind: 'person',
			name,
			normalized_name: normalizeKnowledgeName(name),
			scope: 'private',
			owner_user_id: user,
			status: 'active',
			created_via: 'backfill',
			is_self: false,
			enriched_at: null,
			merged_into_id: null,
			circle: 'unknown',
			...extra
		};
		db.rows('knowledge_entities').push(row);
		return row;
	};
	db.rows('onto_documents').push({ id: doc, project_id: project });
	const link = (entity: Row, recordId: string, quote: string, kind = 'document') =>
		db.rows('knowledge_record_links').push({
			id: randomUUID(),
			entity_id: entity.id,
			owner_user_id: user,
			record_kind: kind,
			record_id: recordId,
			quote,
			created_via: 'backfill'
		});
	const record = {
		kind: 'document' as const,
		id: doc,
		title: 'Pistol client context',
		projectId: project
	};
	return { db, user, doc, project, person, link, record };
}

describe('syncRecordMentions', () => {
	it('Phil test: a spelling fix folds the reader-made entry into the corrected one', async () => {
		const { db, user, doc, person, link, record } = setup();
		const valeo = person('Phil Valeo');
		const velayo = person('Phillip Velayo', { circle: 'public' });
		link(
			valeo,
			doc,
			'…client, referred by Phil Valeo from thecadretraining.com. Key decisions…'
		);

		const dry = await syncRecordMentions(
			db,
			user,
			// The title comes first: the old quote must still be placed in the content.
			{
				record,
				fields: { title: 'Pistol client context', content: DOC_FIXED },
				reader: [],
				readerComplete: false
			},
			{ via: 'system', dryRun: true }
		);
		expect(dry.corrections).toEqual([
			expect.objectContaining({
				from: { id: valeo.id, name: 'Phil Valeo' },
				to: expect.objectContaining({ id: velayo.id, name: 'Phillip Velayo' }),
				action: 'fold',
				relation: 'spelling'
			})
		]);
		expect(db.rows('knowledge_mentions')).toHaveLength(0);
		expect(valeo.status).toBe('active');

		const live = await syncRecordMentions(
			db,
			user,
			{ record, fields: { content: DOC_FIXED }, reader: [], readerComplete: false },
			{ via: 'system' }
		);
		expect(live.corrections[0]!.action).toBe('fold');
		expect(valeo).toMatchObject({ status: 'merged', merged_into_id: velayo.id });
		expect(db.rows('knowledge_mentions')).toEqual([
			expect.objectContaining({
				entity_id: velayo.id,
				text: 'Phillip Velayo',
				made_by: 'reader',
				status: 'active'
			})
		]);
		expect(db.rows('knowledge_record_links').map((l) => l.entity_id)).toEqual([velayo.id]);
		expect(db.rows('knowledge_facts')).toEqual([
			expect.objectContaining({
				entity_id: velayo.id,
				predicate: 'alias',
				value_text: 'Phil Valeo'
			})
		]);
		expect(db.rows('knowledge_mention_reads')).toHaveLength(1);

		// A second read of the same text changes nothing.
		const again = await syncRecordMentions(
			db,
			user,
			{ record, fields: { content: DOC_FIXED }, reader: [], readerComplete: false },
			{ via: 'system' }
		);
		expect(again.counts).toMatchObject({ same: 1, edited: 0, added: 0 });
		expect(again.corrections).toEqual([]);

		// Another record that still says "Phil Valeo" files it under the survivor, never a
		// second "Phil Valeo".
		const receipt = await new KnowledgeStore(db, user).record(
			{ entities: [{ ref: 'a', kind: 'person', name: 'Phil Valeo' }], facts: [] },
			{ via: 'system' }
		);
		expect(receipt.entities[0]).toMatchObject({ id: velayo.id, matched: 'name' });
		expect(db.rows('knowledge_entities').filter((e) => e.name === 'Phil Valeo')).toHaveLength(
			1
		);
	});

	it('asks instead of folding when the user added details to the old entry', async () => {
		const { db, user, doc, person, link, record } = setup();
		const valeo = person('Phil Valeo');
		person('Phillip Velayo');
		db.rows('knowledge_facts').push({
			id: randomUUID(),
			entity_id: valeo.id,
			predicate: 'note',
			value_text: 'Met at the range',
			owner_user_id: user,
			created_via: 'manual',
			status: 'active'
		});
		link(
			valeo,
			doc,
			'…client, referred by Phil Valeo from thecadretraining.com. Key decisions…'
		);
		const report = await syncRecordMentions(
			db,
			user,
			{ record, fields: { content: DOC_FIXED }, reader: [], readerComplete: false },
			{ via: 'system' }
		);
		expect(report.corrections[0]).toMatchObject({
			action: 'ask',
			question: 'Is Phil Valeo the same person as Phillip Velayo?'
		});
		expect(valeo.status).toBe('active');
		expect(db.rows('knowledge_merge_candidates')).toHaveLength(1);
	});

	it('a deleted name loses its tag and link; a reader-only entry left with nothing is hidden', async () => {
		const { db, user, doc, person, link, record } = setup();
		const valeo = person('Phil Valeo');
		link(
			valeo,
			doc,
			'…client, referred by Phil Valeo from thecadretraining.com. Key decisions…'
		);
		await syncRecordMentions(
			db,
			user,
			{ record, fields: { content: DOC_BEFORE }, reader: [], readerComplete: false },
			{ via: 'system' }
		);
		expect(db.rows('knowledge_mentions')).toHaveLength(1);
		const cut = DOC_BEFORE.replace(', referred by Phil Valeo from thecadretraining.com', '');
		const report = await syncRecordMentions(
			db,
			user,
			{ record, fields: { content: cut }, reader: [], readerComplete: false },
			{ via: 'system' }
		);
		expect(report.deleted.map((d) => d.name)).toEqual(['Phil Valeo']);
		expect(report.linksRemoved.map((l) => l.name)).toEqual(['Phil Valeo']);
		expect(report.hidden.map((h) => h.name)).toEqual(['Phil Valeo']);
		expect(valeo).toMatchObject({ status: 'hidden', hidden_reason: 'orphan' });
		expect(db.rows('knowledge_mentions')).toHaveLength(0);
	});

	it('keeps an entry the user invested in, and a link the user made', async () => {
		const { db, user, doc, person, record } = setup();
		const valeo = person('Phil Valeo', { created_via: 'manual' });
		db.rows('knowledge_record_links').push({
			id: randomUUID(),
			entity_id: valeo.id,
			owner_user_id: user,
			record_kind: 'document',
			record_id: doc,
			quote: 'referred by Phil Valeo from thecadretraining.com',
			created_via: 'manual'
		});
		await syncRecordMentions(
			db,
			user,
			{ record, fields: { content: DOC_BEFORE }, reader: [], readerComplete: false },
			{ via: 'system' }
		);
		const report = await syncRecordMentions(
			db,
			user,
			{
				record,
				fields: { content: 'Nothing about anyone.' },
				reader: [],
				readerComplete: true
			},
			{ via: 'system' }
		);
		expect(report.linksRemoved).toEqual([]);
		expect(report.hidden).toEqual([]);
		expect(valeo.status).toBe('active');
	});

	it('a task re-read drops reader links to names the reader no longer reports', async () => {
		const { db, user, person, link } = setup();
		const task = randomUUID();
		const vallejo = person('Phil Vallejo');
		link(vallejo, task, 'Phil Vallejo', 'task');
		const report = await syncRecordMentions(
			db,
			user,
			{
				record: { kind: 'task', id: task, title: 'Ship rifle', projectId: null },
				fields: { title: 'Ship the rifle for the build', description: '' },
				reader: [],
				readerComplete: true
			},
			{ via: 'task', askSimilar: false }
		);
		expect(report.linksRemoved.map((l) => l.name)).toEqual(['Phil Vallejo']);
		expect(report.hidden.map((h) => h.name)).toEqual(['Phil Vallejo']);
	});
});

describe('askSimilarNames', () => {
	it('groups spelling variants and asks each about the fullest name, once', async () => {
		const { db, user, doc, person, link } = setup();
		const velayo = person('Phil Velayo');
		const phillip = person('Phillip Velayo');
		const vallejo = person('Phil Vallejo', { circle: 'inner' });
		const phil = person('Phil');
		person('John Smith');
		person('Jane Smith');
		link(velayo, doc, 'Phil Velayo');
		link(phillip, doc, 'Phillip Velayo');
		link(phil, doc, 'Phil');

		const asked = await askSimilarNames(db, user, {});
		const pairs = asked.map((q) => `${q.other.name} → ${q.keep.name}`).sort();
		expect(pairs).toEqual([
			'Phil Vallejo → Phillip Velayo',
			'Phil Velayo → Phillip Velayo',
			'Phil → Phillip Velayo'
		]);
		expect(db.rows('knowledge_merge_candidates')).toHaveLength(3);
		expect(asked.find((q) => q.other.id === vallejo.id)?.question).toBe(
			'Is Phil Vallejo the same person as Phillip Velayo?'
		);

		// Asked once: a second pass files nothing new and says so.
		const again = await askSimilarNames(db, user, {});
		expect(again.every((q) => q.alreadyAsked)).toBe(true);
		expect(db.rows('knowledge_merge_candidates')).toHaveLength(3);
	});

	it('does not ask about a one-word name that could be several people', async () => {
		const { db, user, doc, person, link } = setup();
		const phil = person('Phil');
		const a = person('Phil Velayo');
		const b = person('Phil Jackson');
		link(phil, doc, 'Phil');
		link(a, doc, 'Phil Velayo');
		link(b, doc, 'Phil Jackson');
		const asked = await askSimilarNames(db, user, { dryRun: true });
		expect(asked).toEqual([]);
	});
});
