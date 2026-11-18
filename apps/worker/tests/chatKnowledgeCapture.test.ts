// apps/worker/tests/chatKnowledgeCapture.test.ts
//
// Chat wrap-up → knowledge graph (tasker 164). Canned gate and model replies, the real
// KnowledgeStore over an in-memory stand-in for PostgREST, and the web Undo helper over the
// same data: no database, no model, no search.
/* eslint-disable require-await -- in-memory fakes satisfy async ports without I/O */
import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import type { JevDecider } from '@buildos/smart-llm';
import { type KnowledgeAnchors, normalizeKnowledgeName } from '@buildos/shared-agent-ops/knowledge';
import {
	type ChatKnowledgeInput,
	type ChatKnowledgePorts,
	type ChatKnowledgeReceipt,
	runChatKnowledgeCapture
} from '../src/workers/chat/checkpoint/knowledgeCapture';
import type {
	KnowledgeIdentityDecision,
	ResolveKnowledgeIdentity
} from '../src/workers/chat/checkpoint/knowledgeIdentity';
import {
	labelMessages,
	validateChatKnowledge,
	webPagesFromToolResult
} from '../src/workers/chat/checkpoint/knowledgePrompt';
import {
	type CheckpointCapturePorts,
	runChatCheckpointCapture
} from '../src/workers/chat/checkpoint/checkpointCapture';
import {
	readChatKnowledgeReceipt,
	undoChatKnowledgeCapture
} from '../../web/src/lib/server/knowledge/chat-capture-undo';

// ---------------------------------------------------------------------------
// In-memory PostgREST stand-in (service role: no RLS), enough for KnowledgeStore and capture.

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
		out.created_via ??= 'manual';
		out.normalized_name = normalizeKnowledgeName(out.name);
	}
	if (table === 'knowledge_facts') {
		out.status ??= 'active';
		out.qualifiers ??= {};
		out.confidence ??= 0.8;
		out.object_entity_id ??= null;
		out.value_text ??= null;
		out.created_via ??= 'manual';
		out.dedupe_key = `${out.entity_id}|${out.predicate}|${out.object_entity_id ?? String(out.value_text).trim().toLowerCase()}`;
	}
	if (table === 'knowledge_sources') out.meta ??= {};
	return out;
}

class FakeDb {
	tables = new Map<string, Row[]>();
	rows(table: string): Row[] {
		if (!this.tables.has(table)) this.tables.set(table, []);
		return this.tables.get(table)!;
	}
	seed(table: string, row: Row): Row {
		const full = withGenerated(table, row);
		this.rows(table).push(full);
		return full;
	}
	from(table: string) {
		return new FakeQuery(this, table);
	}
	async rpc(fn: string) {
		return { data: null, error: { message: `rpc ${fn} not faked` } };
	}
}

class FakeQuery implements PromiseLike<{ data: any; error: any }> {
	private op: 'select' | 'insert' | 'update' | 'delete' | 'upsert' = 'select';
	private filters: Array<(r: Row) => boolean> = [];
	private payload: Row[] = [];
	private patch: Row = {};
	private mode: 'many' | 'single' | 'maybe' = 'many';
	private from_ = 0;
	private to_ = Infinity;
	private ignoreDuplicates = false;

	constructor(
		private db: FakeDb,
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
	is(col: string, value: unknown) {
		this.filters.push((r) => (r[col] ?? null) === value);
		return this;
	}
	in(col: string, values: unknown[]) {
		this.filters.push((r) => values.includes(r[col]));
		return this;
	}
	contains(col: string, value: Row) {
		this.filters.push((r) =>
			Object.entries(value).every(([key, expected]) => r[col]?.[key] === expected)
		);
		return this;
	}
	or(expr: string) {
		const parts = expr.split(',').map((p) => p.split('.eq.'));
		this.filters.push((r) => parts.some(([col, value]) => String(r[col!]) === value));
		return this;
	}
	order() {
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
	then<A = { data: any; error: any }, B = never>(
		ok?: ((v: { data: any; error: any }) => A | PromiseLike<A>) | null,
		fail?: ((e: unknown) => B | PromiseLike<B>) | null
	): PromiseLike<A | B> {
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
			for (const r of hit) Object.assign(r, this.patch);
			return this.shape(hit);
		}
		if (this.op === 'delete') {
			const hit = all.filter(match);
			this.db.tables.set(
				this.table,
				all.filter((r) => !hit.includes(r))
			);
			// Cascades the capture relies on.
			if (this.table === 'knowledge_sources') {
				const gone = new Set(hit.map((r) => r.id));
				this.db.tables.set(
					'knowledge_fact_sources',
					this.db.rows('knowledge_fact_sources').filter((c) => !gone.has(c.source_id))
				);
			}
			if (this.table === 'knowledge_entities') {
				const gone = new Set(hit.map((r) => r.id));
				this.db.tables.set(
					'knowledge_facts',
					this.db
						.rows('knowledge_facts')
						.filter((f) => !gone.has(f.entity_id) && !gone.has(f.object_entity_id))
				);
				this.db.tables.set(
					'knowledge_record_links',
					this.db.rows('knowledge_record_links').filter((l) => !gone.has(l.entity_id))
				);
				this.db.tables.set(
					'knowledge_merge_candidates',
					this.db
						.rows('knowledge_merge_candidates')
						.filter((m) => !gone.has(m.entity_a) && !gone.has(m.entity_b))
				);
			}
			return this.shape(hit);
		}
		const rows = all
			.filter(match)
			.slice(this.from_, this.to_ === Infinity ? undefined : this.to_ + 1);
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
// Fixtures

const USER = '11111111-1111-4111-8111-111111111111';
const SESSION = '22222222-2222-4222-8222-222222222222';
const OLD = '2026-01-01T00:00:00.000Z';

function message(id: string, role: 'user' | 'assistant', content: string, minute: number) {
	return {
		id,
		role,
		content,
		created_at: `2026-11-17T15:${String(minute).padStart(2, '0')}:00.000Z`
	};
}

function db(): FakeDb {
	const fake = new FakeDb();
	fake.rows('users').push({ id: USER, name: 'DJ' });
	return fake;
}

type Choice = { choice: string; probabilities: Record<string, number> };
/** What the identity check's model answers for every claim (null: the call fails). */
type IdentityAnswers = { match: Choice; prominence?: Choice } | null;

const choice = (option: string, p: number, other: string): Choice => ({
	choice: option,
	probabilities: { [option]: p, [other]: 1 - p }
});
const SAME: IdentityAnswers = { match: choice('same', 0.8, 'unclear') };

/** One decider for the gate and the identity check, as in production (one Jev client). */
function gate(
	pSome: number,
	identityAnswers: IdentityAnswers = SAME
): JevDecider & { decide: ReturnType<typeof vi.fn> } {
	return {
		decide: vi.fn(async (request: { questions: Record<string, unknown> }) => {
			const keys = Object.keys(request.questions);
			if (keys.includes('entity_knowledge')) {
				return {
					ok: true,
					answers: {
						entity_knowledge: {
							type: 'choice',
							choice: pSome >= 0.5 ? 'some' : 'none',
							probabilities: { some: pSome, none: 1 - pSome },
							confidence: 0.9
						}
					},
					receipt: { costUsd: 0.0001 },
					rawResponse: null
				};
			}
			if (!identityAnswers)
				return { ok: false, error: 'jev_timeout', receipt: { costUsd: 0 } };
			const answers: Record<string, unknown> = {};
			for (const key of keys) {
				const answer = key.endsWith('_prominence')
					? (identityAnswers.prominence ?? choice('ordinary', 0.9, 'prominent'))
					: identityAnswers.match;
				answers[key] = { type: 'choice', confidence: 0.9, ...answer };
			}
			return { ok: true, answers, receipt: { costUsd: 0.0002 }, rawResponse: null };
		})
	} as never;
}

/** Anchors for an existing entry, as gatherKnowledgeAnchors would return them. */
function anchorsFor(row: Row, extra: Partial<KnowledgeAnchors> = {}): KnowledgeAnchors {
	return {
		entityId: row.id,
		name: row.name,
		kind: row.kind,
		circle: 'unknown',
		knownByMe: false,
		domains: [],
		urls: [],
		facts: [],
		employer: null,
		employerDomain: null,
		people: [],
		places: [],
		mentions: [],
		not: [],
		...extra
	};
}

function ports(
	fake: FakeDb,
	reply: unknown,
	pSome = 0.9,
	options: { identity?: IdentityAnswers; anchors?: KnowledgeAnchors[] } = {}
) {
	const completeJson = vi.fn(async () => reply);
	const decider = gate(pSome, options.identity === undefined ? SAME : options.identity);
	const value: ChatKnowledgePorts = {
		db: fake,
		decider,
		completeJson,
		// Anchors come from the fixture, not from reading the graph.
		loadAnchors: async ({ entityIds }) =>
			new Map(
				(options.anchors ?? [])
					.filter((a) => entityIds.includes(a.entityId))
					.map((a) => [a.entityId, a])
			)
	};
	return { ports: value, completeJson, decider };
}

function input(
	messages: ChatKnowledgeInput['newMessages'],
	webPages: ChatKnowledgeInput['webPages'] = []
): ChatKnowledgeInput {
	return {
		session: { id: SESSION, userId: USER, title: 'Harbor Lane intro' },
		newMessages: messages,
		priorMessages: [],
		webPages,
		throughMessageId: messages[messages.length - 1]!.id
	};
}

const entity = (fake: FakeDb, name: string) =>
	fake.rows('knowledge_entities').find((row) => row.name === name);
const factsOf = (fake: FakeDb, entityId: string) =>
	fake.rows('knowledge_facts').filter((row) => row.entity_id === entityId);

// ---------------------------------------------------------------------------

describe('chat knowledge capture', () => {
	it('a retry after the checkpoint failed to save returns the full receipt, Undo data included', async () => {
		const fake = db();
		const messages = [
			message(
				'm-1',
				'user',
				'My friend Dana Whitfield is the COO at Harbor Lane Logistics.',
				1
			),
			message('m-2', 'assistant', 'Noted.', 2)
		];
		const { ports: p, decider } = ports(fake, {
			entities: [
				{ ref: 'e1', kind: 'person', name: 'Dana Whitfield' },
				{ ref: 'e2', kind: 'org', name: 'Harbor Lane Logistics' }
			],
			facts: [
				{
					subject: 'e1',
					predicate: 'works_at',
					object: 'e2',
					message: 'm1',
					quote: 'Dana Whitfield is the COO at Harbor Lane Logistics',
					from: 'user'
				}
			]
		});

		const first = (await runChatKnowledgeCapture(p, input(messages)))!;
		expect(first.created_entity_ids).toHaveLength(2);
		expect(first.link_ids.length).toBeGreaterThan(0);
		const calls = decider.decide.mock.calls.length;

		const retry = (await runChatKnowledgeCapture(p, input(messages)))!;
		expect(retry).toEqual(first);
		expect(decider.decide.mock.calls.length).toBe(calls); // nothing paid again
	});

	it('captures what the user said about someone: role, employer, how they know them', async () => {
		const fake = db();
		const messages = [
			message(
				'm-1',
				'user',
				'My friend Dana Whitfield just took over as COO at Harbor Lane Logistics. I want to pitch her on the routing tool.',
				1
			),
			message('m-2', 'assistant', 'Congrats to Dana! Want me to draft a short note?', 2)
		];
		const { ports: p } = ports(fake, {
			entities: [
				{ ref: 'e1', kind: 'person', name: 'Dana Whitfield' },
				{ ref: 'e2', kind: 'org', name: 'Harbor Lane Logistics' }
			],
			facts: [
				{
					subject: 'e1',
					predicate: 'works_at',
					object: 'e2',
					qualifiers: { title: 'COO', current: true },
					message: 'm1',
					quote: 'Dana Whitfield just took over as COO at Harbor Lane Logistics',
					from: 'user'
				},
				{
					subject: 'me',
					predicate: 'knows',
					object: 'e1',
					qualifiers: { via: 'friend' },
					message: 'm1',
					quote: 'My friend Dana Whitfield',
					from: 'user'
				}
			]
		});

		const receipt = (await runChatKnowledgeCapture(p, input(messages)))!;

		expect(receipt.status).toBe('written');
		expect(receipt.fact_ids).toHaveLength(2);
		const dana = entity(fake, 'Dana Whitfield')!;
		const harbor = entity(fake, 'Harbor Lane Logistics')!;
		expect(dana).toMatchObject({
			kind: 'person',
			scope: 'private',
			owner_user_id: USER,
			created_via: 'chat'
		});
		const worksAt = factsOf(fake, dana.id).find((f) => f.predicate === 'works_at')!;
		expect(worksAt).toMatchObject({
			object_entity_id: harbor.id,
			status: 'active',
			created_via: 'chat',
			scope: 'private'
		});
		expect(worksAt.qualifiers).toMatchObject({ title: 'COO' });
		const self = fake.rows('knowledge_entities').find((row) => row.is_self)!;
		expect(factsOf(fake, self.id)).toEqual([
			expect.objectContaining({
				predicate: 'knows',
				object_entity_id: dana.id,
				status: 'active'
			})
		]);
		// The chat is the source, with the user's exact words.
		const chatSource = fake.rows('knowledge_sources').find((s) => s.source_type === 'chat')!;
		expect(chatSource).toMatchObject({
			record_id: SESSION,
			title: 'Harbor Lane intro',
			scope: 'private'
		});
		expect(fake.rows('knowledge_fact_sources')).toContainEqual(
			expect.objectContaining({
				fact_id: worksAt.id,
				source_id: chatSource.id,
				quote: 'Dana Whitfield just took over as COO at Harbor Lane Logistics'
			})
		);
		// Both entries link back to this chat.
		expect(
			fake
				.rows('knowledge_record_links')
				.map((l) => [l.entity_id, l.record_kind, l.record_id])
		).toEqual(
			expect.arrayContaining([
				[dana.id, 'chat_session', SESSION],
				[harbor.id, 'chat_session', SESSION]
			])
		);
		expect(receipt.entities.find((e) => e.id === dana.id)).toMatchObject({
			facts: 2,
			created: true
		});
	});

	it('captures a fact web search found, keeping the page URL; a new entry with no anchors gets it as a suggestion', async () => {
		const fake = db();
		const page = {
			url: 'https://harborlane.example/about',
			title: 'About Harbor Lane Logistics'
		};
		const messages = [
			message('m-1', 'user', 'Can you look up Harbor Lane Logistics for me?', 1),
			message(
				'm-2',
				'assistant',
				'I found their About page: Harbor Lane Logistics is headquartered in Baltimore, and their site is harborlane.example.',
				2
			)
		];
		const { ports: p } = ports(fake, {
			entities: [
				{ ref: 'e1', kind: 'org', name: 'Harbor Lane Logistics' },
				{ ref: 'e2', kind: 'place', name: 'Baltimore' }
			],
			facts: [
				{
					subject: 'e1',
					predicate: 'homepage',
					value: 'https://harborlane.example',
					message: 'm2',
					quote: 'their site is harborlane.example',
					from: 'web',
					web: 'w1'
				},
				{
					subject: 'e1',
					predicate: 'located_in',
					object: 'e2',
					message: 'm2',
					quote: 'Harbor Lane Logistics is headquartered in Baltimore',
					from: 'web',
					web: 'w1'
				},
				// Cites a page this chat never returned: dropped.
				{
					subject: 'e1',
					predicate: 'industry',
					value: 'freight',
					message: 'm2',
					quote: 'Harbor Lane Logistics is headquartered',
					from: 'web',
					web: 'w4'
				}
			]
		});

		const receipt = (await runChatKnowledgeCapture(p, input(messages, [page])))!;

		expect(receipt.fact_ids).toHaveLength(2);
		expect(receipt.dropped).toContainEqual(
			expect.objectContaining({
				predicate: 'industry',
				reason: 'web fact cites no page from this chat'
			})
		);
		const harbor = entity(fake, 'Harbor Lane Logistics')!;
		const homepage = factsOf(fake, harbor.id).find((f) => f.predicate === 'homepage')!;
		// Nothing confirms this is the user's Harbor Lane yet: a suggestion with its source.
		expect(homepage).toMatchObject({
			status: 'suggested',
			confidence: 0.7,
			created_via: 'chat'
		});
		const webSource = fake.rows('knowledge_sources').find((s) => s.source_type === 'web')!;
		expect(webSource).toMatchObject({ url: page.url, title: page.title, scope: 'private' });
		expect(
			fake
				.rows('knowledge_fact_sources')
				.filter((c) => c.fact_id === homepage.id)
				.map((c) => c.source_id)
		).toContain(webSource.id);
	});

	it('skips names mentioned in passing: the gate stops it before the model call', async () => {
		const fake = db();
		const messages = [
			message('m-1', 'user', 'Chris said the deck looks fine. Moving on to the budget.', 1),
			message('m-2', 'assistant', 'Great, let us look at the budget.', 2)
		];
		const { ports: p, completeJson, decider } = ports(fake, { entities: [], facts: [] }, 0.08);

		const receipt = (await runChatKnowledgeCapture(p, input(messages)))!;

		expect(decider.decide).toHaveBeenCalledOnce();
		expect(completeJson).not.toHaveBeenCalled();
		expect(receipt).toMatchObject({
			status: 'nothing',
			fact_ids: [],
			gate: { ran: true, p_some: 0.08 }
		});
		expect(fake.rows('knowledge_entities')).toHaveLength(0);
	});

	it('writes nothing for a named entity with no kept fact, and drops quotes not in the chat', async () => {
		const fake = db();
		const messages = [
			message(
				'm-1',
				'user',
				'Had coffee with Priya Natarajan today, she mentioned the conference.',
				1
			),
			message('m-2', 'assistant', 'Sounds like a good chat.', 2)
		];
		const { ports: p } = ports(fake, {
			entities: [
				{ ref: 'e1', kind: 'person', name: 'Priya Natarajan' },
				{ ref: 'e2', kind: 'org', name: 'Stripe' }
			],
			facts: [
				// The quote was never said.
				{
					subject: 'e1',
					predicate: 'works_at',
					object: 'e2',
					message: 'm1',
					quote: 'Priya Natarajan works at Stripe',
					from: 'user'
				},
				// A user fact citing the assistant's message.
				{
					subject: 'e1',
					predicate: 'note',
					value: 'good chat',
					message: 'm2',
					quote: 'Sounds like a good chat.',
					from: 'user'
				}
			]
		});

		const receipt = (await runChatKnowledgeCapture(p, input(messages)))!;

		expect(receipt.status).toBe('nothing');
		expect(receipt.dropped.map((d) => d.reason)).toEqual(
			expect.arrayContaining([
				'name not in the chat',
				'quote not in the message',
				'user fact cites a non-user message'
			])
		);
		expect(fake.rows('knowledge_entities')).toHaveLength(0);
		expect(fake.rows('knowledge_facts')).toHaveLength(0);
	});

	it('keeps contact details private: only from the user, never in the receipt', async () => {
		const fake = db();
		const page = { url: 'https://people.example/dana', title: 'Dana Whitfield' };
		const messages = [
			message('m-1', 'user', "Dana Whitfield's cell is 410-555-0182, save that for me.", 1),
			message(
				'm-2',
				'assistant',
				'Saved. A directory page also lists Dana Whitfield at 443-555-0199.',
				2
			)
		];
		const { ports: p } = ports(fake, {
			entities: [{ ref: 'e1', kind: 'person', name: 'Dana Whitfield' }],
			facts: [
				{
					subject: 'e1',
					predicate: 'phone',
					value: '410-555-0182',
					qualifiers: { label: 'cell' },
					message: 'm1',
					quote: "Dana Whitfield's cell is 410-555-0182",
					from: 'user'
				},
				{
					subject: 'e1',
					predicate: 'phone',
					value: '443-555-0199',
					message: 'm2',
					quote: 'lists Dana Whitfield at 443-555-0199',
					from: 'web',
					web: 'w1'
				}
			]
		});

		const receipt = (await runChatKnowledgeCapture(p, input(messages, [page])))!;

		const dana = entity(fake, 'Dana Whitfield')!;
		const phones = factsOf(fake, dana.id).filter((f) => f.predicate === 'phone');
		expect(phones).toHaveLength(1);
		expect(phones[0]).toMatchObject({ scope: 'private', owner_user_id: USER });
		expect(phones[0]!.value_text).toContain('4105550182');
		expect(receipt.dropped).toContainEqual(
			expect.objectContaining({ predicate: 'phone', reason: 'only from the user' })
		);
		// No web source was recorded for a dropped person contact detail.
		expect(fake.rows('knowledge_sources').map((s) => s.source_type)).toEqual(['chat']);
		expect(JSON.stringify(receipt)).not.toMatch(/0182|0199|410-555|443-555/);
	});

	it('Undo takes back only what this capture added and puts replaced values back', async () => {
		const fake = db();
		// Before the chat: Dana and Harbor Lane are already in the graph.
		const dana = fake.seed('knowledge_entities', {
			kind: 'person',
			name: 'Dana Whitfield',
			scope: 'private',
			owner_user_id: USER,
			created_via: 'import',
			summary: 'VP Operations at Harbor Lane',
			created_at: OLD
		});
		const harbor = fake.seed('knowledge_entities', {
			kind: 'org',
			name: 'Harbor Lane Logistics',
			scope: 'private',
			owner_user_id: USER,
			created_via: 'task',
			created_at: OLD
		});
		const oldHeadline = fake.seed('knowledge_facts', {
			entity_id: dana.id,
			predicate: 'headline',
			value_text: 'VP Operations at Harbor Lane',
			scope: 'private',
			owner_user_id: USER,
			created_via: 'import',
			created_at: OLD
		});
		const industry = fake.seed('knowledge_facts', {
			entity_id: harbor.id,
			predicate: 'industry',
			value_text: 'freight logistics',
			scope: 'private',
			owner_user_id: USER,
			created_via: 'task',
			created_at: OLD
		});
		// Saved from an earlier chat.
		const oldWorksAt = fake.seed('knowledge_facts', {
			entity_id: dana.id,
			predicate: 'works_at',
			object_entity_id: harbor.id,
			scope: 'private',
			owner_user_id: USER,
			created_via: 'chat',
			created_at: OLD
		});

		const messages = [
			message(
				'm-1',
				'user',
				'Dana Whitfield is now COO at Harbor Lane Logistics, and Marcus Bell runs sales there.',
				1
			),
			message('m-2', 'assistant', 'Noted both.', 2)
		];
		const { ports: p } = ports(fake, {
			entities: [
				{ ref: 'e1', kind: 'person', name: 'Dana Whitfield' },
				{ ref: 'e2', kind: 'org', name: 'Harbor Lane Logistics' },
				{ ref: 'e3', kind: 'person', name: 'Marcus Bell' }
			],
			facts: [
				{
					subject: 'e1',
					predicate: 'headline',
					value: 'COO at Harbor Lane Logistics',
					message: 'm1',
					quote: 'Dana Whitfield is now COO at Harbor Lane Logistics',
					from: 'user'
				},
				// Already known: gains a citation, isn't "added".
				{
					subject: 'e1',
					predicate: 'works_at',
					object: 'e2',
					message: 'm1',
					quote: 'Dana Whitfield is now COO at Harbor Lane Logistics',
					from: 'user'
				},
				{
					subject: 'e3',
					predicate: 'works_at',
					object: 'e2',
					qualifiers: { title: 'Head of Sales' },
					message: 'm1',
					quote: 'Marcus Bell runs sales there',
					from: 'user'
				}
			]
		});

		const receipt = (await runChatKnowledgeCapture(p, input(messages)))!;
		const marcus = entity(fake, 'Marcus Bell')!;
		expect(receipt.fact_ids).toHaveLength(2);
		expect(receipt.created_entity_ids).toEqual([marcus.id]);
		expect(fake.rows('knowledge_facts').find((f) => f.id === oldHeadline.id)!.status).toBe(
			'superseded'
		);
		expect(fake.rows('knowledge_entities').find((e) => e.id === dana.id)!.summary).toBe(
			'COO at Harbor Lane Logistics'
		);

		// The receipt survives the round trip through chat_capture_checkpoints.details.
		const stored = readChatKnowledgeReceipt(
			JSON.parse(JSON.stringify({ knowledge: receipt }))
		)!;
		const outcome = await undoChatKnowledgeCapture({
			admin: fake,
			userId: USER,
			receipt: stored
		});

		expect(outcome).toBe('retracted');
		const facts = new Map(fake.rows('knowledge_facts').map((f) => [f.id, f]));
		expect(facts.get(oldHeadline.id)!.status).toBe('active');
		expect(facts.get(industry.id)!.status).toBe('active');
		expect(facts.get(oldWorksAt.id)!.status).toBe('active');
		const newHeadline = fake
			.rows('knowledge_facts')
			.find((f) => f.value_text === 'COO at Harbor Lane Logistics')!;
		expect(newHeadline.status).toBe('retracted');
		// Entries that existed stay; the one the capture created is gone with its facts.
		expect(entity(fake, 'Dana Whitfield')!.summary).toBe('VP Operations at Harbor Lane');
		expect(entity(fake, 'Harbor Lane Logistics')).toBeDefined();
		expect(entity(fake, 'Marcus Bell')).toBeUndefined();
		// Its sources and chat links are gone; the old works_at lost only this capture's citation.
		expect(fake.rows('knowledge_sources')).toHaveLength(0);
		expect(fake.rows('knowledge_record_links')).toHaveLength(0);
		expect(
			fake.rows('knowledge_fact_sources').filter((c) => c.fact_id === oldWorksAt.id)
		).toHaveLength(0);
	});

	it('a retried checkpoint rebuilds the receipt instead of paying again', async () => {
		const fake = db();
		const messages = [
			message('m-1', 'user', 'Marcus Bell runs sales at Harbor Lane Logistics.', 1),
			message('m-2', 'assistant', 'Got it.', 2)
		];
		const reply = {
			entities: [
				{ ref: 'e1', kind: 'person', name: 'Marcus Bell' },
				{ ref: 'e2', kind: 'org', name: 'Harbor Lane Logistics' }
			],
			facts: [
				{
					subject: 'e1',
					predicate: 'works_at',
					object: 'e2',
					message: 'm1',
					quote: 'Marcus Bell runs sales at Harbor Lane Logistics',
					from: 'user'
				}
			]
		};
		const first = ports(fake, reply);
		const written = (await runChatKnowledgeCapture(first.ports, input(messages)))!;
		const again = ports(fake, reply);
		const retried = (await runChatKnowledgeCapture(again.ports, input(messages)))!;

		expect(again.completeJson).not.toHaveBeenCalled();
		expect(again.decider.decide).not.toHaveBeenCalled();
		expect(retried.fact_ids).toEqual(written.fact_ids);
		expect(retried.source_ids).toEqual(written.source_ids);
	});

	it('a first name alone reuses the one entry with that name, otherwise is skipped', async () => {
		const fake = db();
		const louis = fake.seed('knowledge_entities', {
			kind: 'person',
			name: 'Louis',
			scope: 'private',
			owner_user_id: USER,
			created_via: 'task',
			created_at: OLD
		});
		const messages = [
			message(
				'm-1',
				'user',
				'Louis is now running LA Industrial Services, and Sam is his new partner there.',
				1
			),
			message('m-2', 'assistant', 'Noted.', 2)
		];
		const { ports: p } = ports(fake, {
			entities: [
				{ ref: 'e1', kind: 'person', name: 'Louis' },
				{ ref: 'e2', kind: 'org', name: 'LA Industrial Services' },
				{ ref: 'e3', kind: 'person', name: 'Sam' }
			],
			facts: [
				{
					subject: 'e1',
					predicate: 'works_at',
					object: 'e2',
					message: 'm1',
					quote: 'Louis is now running LA Industrial Services',
					from: 'user'
				},
				{
					subject: 'e3',
					predicate: 'works_at',
					object: 'e2',
					message: 'm1',
					quote: 'Sam is his new partner there',
					from: 'user'
				}
			]
		});

		const receipt = (await runChatKnowledgeCapture(p, input(messages)))!;

		expect(factsOf(fake, louis.id).map((f) => f.predicate)).toEqual(['works_at']);
		expect(entity(fake, 'Sam')).toBeUndefined();
		expect(receipt.skipped_entities).toEqual([{ name: 'Sam', reason: 'first name only' }]);
	});

	it('a custom identity resolver is used in place of the store matching', async () => {
		const fake = db();
		const known = fake.seed('knowledge_entities', {
			kind: 'person',
			name: 'Dana W.',
			scope: 'private',
			owner_user_id: USER,
			created_via: 'import',
			created_at: OLD
		});
		const messages = [
			message('m-1', 'user', 'Dana Whitfield moved to Baltimore last month.', 1),
			message('m-2', 'assistant', 'Noted.', 2)
		];
		const { ports: p } = ports(fake, {
			entities: [
				{ ref: 'e1', kind: 'person', name: 'Dana Whitfield' },
				{ ref: 'e2', kind: 'place', name: 'Baltimore' }
			],
			facts: [
				{
					subject: 'e1',
					predicate: 'located_in',
					object: 'e2',
					message: 'm1',
					quote: 'Dana Whitfield moved to Baltimore',
					from: 'user'
				}
			]
		});
		p.resolveIdentity = vi.fn(async ({ candidates }: Parameters<ResolveKnowledgeIdentity>[0]) =>
			candidates.map(
				(c): KnowledgeIdentityDecision =>
					c.name === 'Dana Whitfield'
						? { ref: c.ref, action: 'use', entityId: known.id }
						: { ref: c.ref, action: 'default' }
			)
		);

		await runChatKnowledgeCapture(p, input(messages));

		expect(p.resolveIdentity).toHaveBeenCalledWith(
			expect.objectContaining({
				candidates: expect.arrayContaining([
					expect.objectContaining({
						name: 'Dana Whitfield',
						evidence: ['Dana Whitfield moved to Baltimore']
					})
				])
			})
		);
		expect(factsOf(fake, known.id).map((f) => f.predicate)).toEqual(['located_in']);
		expect(entity(fake, 'Dana Whitfield')).toBeUndefined();
	});
});

describe('identity check on claims about existing entries', () => {
	function seedJev(fake: FakeDb) {
		return fake.seed('knowledge_entities', {
			kind: 'person',
			name: 'Jev Ramos',
			scope: 'private',
			owner_user_id: USER,
			created_via: 'import',
			created_at: OLD
		});
	}
	const innerCircle = (row: Row) =>
		anchorsFor(row, {
			circle: 'inner',
			knownByMe: true,
			facts: ['Works at: Cadre Collective'],
			employer: 'Cadre Collective'
		});
	const claimReply = (quote: string, orgName: string, title?: string) => ({
		entities: [
			{ ref: 'e1', kind: 'person', name: 'Jev Ramos' },
			{ ref: 'e2', kind: 'org', name: orgName }
		],
		facts: [
			{
				subject: 'e1',
				predicate: 'works_at',
				object: 'e2',
				...(title ? { qualifiers: { title } } : {}),
				message: 'm1',
				quote,
				from: 'user'
			}
		]
	});

	it('a prominent claim about an inner-circle name files a question and writes no fact', async () => {
		const fake = db();
		const jev = seedJev(fake);
		const messages = [
			message('m-1', 'user', 'Funny thing, Jev Ramos is in leadership at Amazon now.', 1),
			message('m-2', 'assistant', 'Wow, noted.', 2)
		];
		const { ports: p } = ports(
			fake,
			claimReply('Jev Ramos is in leadership at Amazon', 'Amazon', 'leadership'),
			0.9,
			{
				identity: {
					match: choice('unclear', 0.7, 'same'),
					prominence: choice('prominent', 0.9, 'ordinary')
				},
				anchors: [innerCircle(jev)]
			}
		);

		const receipt = (await runChatKnowledgeCapture(p, input(messages)))!;

		expect(factsOf(fake, jev.id)).toHaveLength(0);
		expect(receipt.saved_facts).toBe(0);
		expect(receipt.identity).toMatchObject({ checked: 1, asked: 1 });
		expect(receipt.questions).toHaveLength(1);
		const question = receipt.questions[0]!;
		expect(question.question).toMatch(/^Is Jev Ramos, someone you know, the same person/);
		// The other identity holds the claim as a suggestion, paired with Jev for review.
		const other = fake
			.rows('knowledge_entities')
			.find((e) => e.id === question.other_entity_id)!;
		expect(other).toMatchObject({ name: 'Jev Ramos', created_via: 'chat' });
		expect(factsOf(fake, other.id)).toEqual([
			expect.objectContaining({ predicate: 'works_at', status: 'suggested' })
		]);
		expect(fake.rows('knowledge_merge_candidates')).toEqual([
			expect.objectContaining({ origin: 'identity', question: question.question })
		]);
		expect(receipt.created_entity_ids).toContain(other.id);

		// Undo takes back the question too: the other entry, its suggestion and the pair.
		const stored = readChatKnowledgeReceipt(
			JSON.parse(JSON.stringify({ knowledge: receipt }))
		)!;
		await undoChatKnowledgeCapture({ admin: fake, userId: USER, receipt: stored });
		expect(fake.rows('knowledge_entities').find((e) => e.id === other.id)).toBeUndefined();
		expect(fake.rows('knowledge_merge_candidates')).toHaveLength(0);
		expect(entity(fake, 'Jev Ramos')!.id).toBe(jev.id);
		expect(entity(fake, 'Amazon')).toBeUndefined();
	});

	it('an ordinary claim about the same person is written', async () => {
		const fake = db();
		const jev = seedJev(fake);
		const messages = [
			message('m-1', 'user', 'Jev Ramos just joined Baltimore Bike Works as ops lead.', 1),
			message('m-2', 'assistant', 'Noted.', 2)
		];
		const { ports: p, decider } = ports(
			fake,
			claimReply(
				'Jev Ramos just joined Baltimore Bike Works as ops lead',
				'Baltimore Bike Works',
				'ops lead'
			),
			0.9,
			{ identity: SAME, anchors: [innerCircle(jev)] }
		);

		const receipt = (await runChatKnowledgeCapture(p, input(messages)))!;

		expect(decider.decide).toHaveBeenCalledTimes(2); // gate + one identity call
		expect(receipt.questions).toHaveLength(0);
		expect(factsOf(fake, jev.id)).toEqual([
			expect.objectContaining({ predicate: 'works_at', status: 'active' })
		]);
		expect(receipt.saved_facts).toBe(1);
	});

	it('the model being down never blocks capture: the claim is written', async () => {
		const fake = db();
		const jev = seedJev(fake);
		const messages = [
			message('m-1', 'user', 'Jev Ramos is in leadership at Amazon now.', 1),
			message('m-2', 'assistant', 'Noted.', 2)
		];
		const { ports: p } = ports(
			fake,
			claimReply('Jev Ramos is in leadership at Amazon', 'Amazon', 'leadership'),
			0.9,
			{ identity: null, anchors: [innerCircle(jev)] }
		);

		const receipt = (await runChatKnowledgeCapture(p, input(messages)))!;

		expect(receipt.questions).toHaveLength(0);
		expect(factsOf(fake, jev.id)).toEqual([expect.objectContaining({ predicate: 'works_at' })]);
	});

	it('personal details the user typed never raise a question', async () => {
		const fake = db();
		const jev = seedJev(fake);
		const messages = [
			message('m-1', 'user', 'Jev Ramos has a new email, jev@ramos.example.', 1),
			message('m-2', 'assistant', 'Saved.', 2)
		];
		const { ports: p, decider } = ports(
			fake,
			{
				entities: [{ ref: 'e1', kind: 'person', name: 'Jev Ramos' }],
				facts: [
					{
						subject: 'e1',
						predicate: 'email',
						value: 'jev@ramos.example',
						message: 'm1',
						quote: 'Jev Ramos has a new email, jev@ramos.example',
						from: 'user'
					}
				]
			},
			0.9,
			{ identity: { match: choice('different', 0.95, 'same') }, anchors: [innerCircle(jev)] }
		);

		const receipt = (await runChatKnowledgeCapture(p, input(messages)))!;

		expect(decider.decide).toHaveBeenCalledTimes(1); // gate only: rules settled it
		expect(receipt.questions).toHaveLength(0);
		expect(factsOf(fake, jev.id)).toEqual([expect.objectContaining({ predicate: 'email' })]);
	});

	it('a claim about a different one with the same name goes to a new entry', async () => {
		const fake = db();
		const cody = fake.seed('knowledge_entities', {
			kind: 'org',
			name: 'Cody Shooting Complex',
			scope: 'private',
			owner_user_id: USER,
			created_via: 'task',
			created_at: OLD
		});
		const messages = [
			message(
				'm-1',
				'user',
				"Dana Ruiz runs the Iowa Cody Shooting Complex. The Iowa Cody Shooting Complex's website is codyiowa.example, not ours.",
				1
			),
			message('m-2', 'assistant', 'Got it.', 2)
		];
		const { ports: p } = ports(
			fake,
			{
				entities: [
					{ ref: 'e1', kind: 'org', name: 'Cody Shooting Complex' },
					{ ref: 'e2', kind: 'person', name: 'Dana Ruiz' }
				],
				facts: [
					{
						subject: 'e2',
						predicate: 'works_at',
						object: 'e1',
						message: 'm1',
						quote: 'Dana Ruiz runs the Iowa Cody Shooting Complex',
						from: 'user'
					},
					{
						subject: 'e1',
						predicate: 'homepage',
						value: 'https://codyiowa.example',
						message: 'm1',
						quote: "Cody Shooting Complex's website is codyiowa.example",
						from: 'user'
					}
				]
			},
			0.9,
			{
				anchors: [
					anchorsFor(cody, {
						domains: ['codyshootingcomplex.org'],
						not: [
							{
								label: 'Not the one in Iowa',
								domains: ['codyiowa.example'],
								urls: []
							}
						]
					})
				]
			}
		);

		const receipt = (await runChatKnowledgeCapture(p, input(messages)))!;

		expect(factsOf(fake, cody.id)).toHaveLength(0);
		const twins = fake
			.rows('knowledge_entities')
			.filter((e) => e.name === 'Cody Shooting Complex');
		expect(twins).toHaveLength(2);
		const other = twins.find((e) => e.id !== cody.id)!;
		expect(factsOf(fake, other.id)).toEqual([
			expect.objectContaining({ predicate: 'homepage' })
		]);
		expect(receipt.identity.different).toBe(1);
		expect(receipt.created_entity_ids).toContain(other.id);
		// The chat's other mention of that name (as Dana's employer) lands on the same new entry.
		const dana = fake.rows('knowledge_entities').find((e) => e.name === 'Dana Ruiz')!;
		expect(factsOf(fake, dana.id)).toEqual([
			expect.objectContaining({ predicate: 'works_at', object_entity_id: other.id })
		]);
		expect(receipt.entities.map((e) => e.id)).toContain(other.id);
	});

	it('skips a name the user already has on two entries instead of adding a third', async () => {
		const fake = db();
		for (const via of ['task', 'chat'])
			fake.seed('knowledge_entities', {
				kind: 'org',
				name: 'Cody Shooting Complex',
				scope: 'private',
				owner_user_id: USER,
				created_via: via,
				created_at: OLD
			});
		const messages = [
			message('m-1', 'user', 'Cody Shooting Complex opens at 9 on Saturdays.', 1),
			message('m-2', 'assistant', 'Noted.', 2)
		];
		const { ports: p } = ports(fake, {
			entities: [{ ref: 'e1', kind: 'org', name: 'Cody Shooting Complex' }],
			facts: [
				{
					subject: 'e1',
					predicate: 'description',
					value: 'Opens at 9 on Saturdays',
					message: 'm1',
					quote: 'Cody Shooting Complex opens at 9 on Saturdays',
					from: 'user'
				}
			]
		});

		const receipt = (await runChatKnowledgeCapture(p, input(messages)))!;

		expect(receipt.skipped_entities).toEqual([
			{ name: 'Cody Shooting Complex', reason: 'several entries with this name' }
		]);
		expect(
			fake.rows('knowledge_entities').filter((e) => e.name === 'Cody Shooting Complex')
		).toHaveLength(2);
	});

	it('web facts: suggested for an entry nothing anchors, active for one the graph anchors', async () => {
		const fake = db();
		const bare = fake.seed('knowledge_entities', {
			kind: 'org',
			name: 'Tidewater Analytics',
			scope: 'private',
			owner_user_id: USER,
			created_via: 'task',
			created_at: OLD
		});
		const known = fake.seed('knowledge_entities', {
			kind: 'org',
			name: 'Harbor Lane Logistics',
			scope: 'private',
			owner_user_id: USER,
			created_via: 'task',
			created_at: OLD
		});
		const page = {
			url: 'https://example.org/companies',
			title: 'Maryland logistics companies'
		};
		const messages = [
			message('m-1', 'user', 'Look up Tidewater Analytics and Harbor Lane Logistics.', 1),
			message(
				'm-2',
				'assistant',
				'Tidewater Analytics works in data consulting. Harbor Lane Logistics works in freight brokerage.',
				2
			)
		];
		const { ports: p } = ports(
			fake,
			{
				entities: [
					{ ref: 'e1', kind: 'org', name: 'Tidewater Analytics' },
					{ ref: 'e2', kind: 'org', name: 'Harbor Lane Logistics' }
				],
				facts: [
					{
						subject: 'e1',
						predicate: 'industry',
						value: 'data consulting',
						message: 'm2',
						quote: 'Tidewater Analytics works in data consulting',
						from: 'web',
						web: 'w1'
					},
					{
						subject: 'e2',
						predicate: 'industry',
						value: 'freight brokerage',
						message: 'm2',
						quote: 'Harbor Lane Logistics works in freight brokerage',
						from: 'web',
						web: 'w1'
					}
				]
			},
			0.9,
			{
				anchors: [
					anchorsFor(bare),
					anchorsFor(known, { domains: ['harborlane.example'], places: ['Baltimore'] })
				]
			}
		);

		await runChatKnowledgeCapture(p, input(messages, [page]));

		expect(factsOf(fake, bare.id)).toEqual([
			expect.objectContaining({ predicate: 'industry', status: 'suggested' })
		]);
		expect(factsOf(fake, known.id)).toEqual([
			expect.objectContaining({ predicate: 'industry', status: 'active' })
		]);
	});
});

describe('chat knowledge validation', () => {
	it('keeps a paraphrased value only as a suggestion', () => {
		const newMessages = labelMessages(
			[message('m-1', 'user', 'Rod Chamberlin is a partner at Magnum Wealth these days.', 1)],
			'm'
		);
		const result = validateChatKnowledge(
			{
				entities: [{ ref: 'e1', kind: 'person', name: 'Rod Chamberlin' }],
				facts: [
					{
						subject: 'e1',
						predicate: 'headline',
						value: 'Managing Partner, Magnum Wealth Advisors',
						message: 'm1',
						quote: 'Rod Chamberlin is a partner at Magnum Wealth',
						from: 'user'
					}
				]
			},
			{ newMessages, priorMessages: [], webPages: [] }
		);
		expect(result.facts).toEqual([
			expect.objectContaining({ predicate: 'headline', status: 'suggested' })
		]);
	});

	it('reads page URLs and titles from stored web tool results', () => {
		expect(
			webPagesFromToolResult({
				results: [{ url: 'https://a.example/', title: 'A' }],
				answer_page: { url: 'https://b.example/x', title: 'B' },
				content_redacted: true
			})
		).toEqual([
			{ url: 'https://a.example/', title: 'A' },
			{ url: 'https://b.example/x', title: 'B' }
		]);
	});
});

describe('checkpoint engine', () => {
	function enginePorts(projectId: string | null) {
		const records: Array<Parameters<CheckpointCapturePorts['finishCheckpoint']>[0]> = [];
		const knowledge: ChatKnowledgeReceipt = {
			version: 1,
			capture_key: 'k',
			started_at: OLD,
			status: 'written',
			gate: { ran: true, p_some: 0.9, error: null },
			entities: [
				{ id: 'e', name: 'Dana Whitfield', kind: 'person', created: true, facts: 1 }
			],
			fact_ids: ['f'],
			restore: [],
			summaries: [],
			link_ids: [],
			source_ids: [],
			created_entity_ids: [],
			saved_facts: 1,
			questions: [],
			identity: { checked: 0, asked: 0, different: 0, calls: 0, cost_usd: 0 },
			skipped_entities: [],
			dropped: [],
			error: null
		};
		const captureKnowledge = vi.fn(async () => knowledge);
		const value = {
			loadSession: async () => ({ id: SESSION, userId: USER, projectId, title: null }),
			loadMessages: async () => ({
				newMessages: [
					message('m-1', 'user', 'Dana Whitfield is COO at Harbor Lane Logistics.', 1),
					message('m-2', 'assistant', 'Noted.', 2)
				],
				priorMessages: [],
				savedChanges: []
			}),
			loadProject: async () => null,
			completeJson: vi.fn(),
			captureKnowledge,
			finishCheckpoint: async (record: (typeof records)[number]) => {
				records.push(record);
			}
		} as unknown as CheckpointCapturePorts;
		return { ports: value, records, captureKnowledge };
	}

	it('captures knowledge from a chat with no project (global or Workspace)', async () => {
		const { ports: p, records, captureKnowledge } = enginePorts(null);
		const outcome = await runChatCheckpointCapture(p, {
			sessionId: SESSION,
			userId: USER,
			trigger: 'idle'
		});
		expect(captureKnowledge).toHaveBeenCalledOnce();
		expect(outcome.status).toBe('captured');
		expect(records[0]).toMatchObject({
			status: 'captured',
			projectId: null,
			knowledge: { fact_ids: ['f'] }
		});
		expect(p.completeJson).not.toHaveBeenCalled();
	});

	it('also runs for a Workspace session whose project has no START HERE', async () => {
		const { ports: p, records } = enginePorts('33333333-3333-4333-8333-333333333333');
		const outcome = await runChatCheckpointCapture(p, {
			sessionId: SESSION,
			userId: USER,
			trigger: 'idle'
		});
		expect(outcome.status).toBe('captured');
		expect(records[0]!.knowledge?.fact_ids).toEqual(['f']);
	});
});
