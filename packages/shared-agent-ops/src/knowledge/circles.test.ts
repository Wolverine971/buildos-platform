// packages/shared-agent-ops/src/knowledge/circles.test.ts
//
// The sorter (tasker 169): "does this matter to the user's own work?". The failure it fixes:
// DoorDash (named once in the user's résumé, ten times in AI research briefs), "Desk" and "GPU"
// were sorted into the user's inner circle and filled the knowledge page. These tests pin what
// the model is shown (where each mention came from, with titles), what each answer does to the
// data, and that the user's own answers always win.
import { describe, expect, it } from 'vitest';
import {
	CIRCLE_BATCH_SIZE,
	CIRCLE_MAX_REQUEST_BYTES,
	CIRCLE_QUESTION_SINCE,
	circleFromSignals,
	decideCirclesWithModel,
	findEntriesToSort,
	findSimilarEntries,
	sortKnowledgeEntries,
	type CircleSignals
} from './circles';
import type { IdentityDecider } from './identity';

type Asked = { state: any; questions: Record<string, { criteria: Record<string, string> }> };

/** Answers by question key; anything unlisted gets its first option at low confidence. */
function fakeDecider(picks: Record<string, [string, number]>) {
	const asked: Asked[] = [];
	const decider: IdentityDecider = {
		async decide(request) {
			asked.push(request as Asked);
			const answers: Record<string, unknown> = {};
			for (const [key, q] of Object.entries(request.questions)) {
				const [choice, p] = picks[key] ?? [Object.keys(q.criteria)[0]!, 0.3];
				answers[key] = {
					type: 'choice',
					choice,
					probabilities: { [choice]: p },
					confidence: p
				};
			}
			return { ok: true, answers, receipt: { costUsd: 0.0006 } };
		}
	};
	return { decider, asked };
}

// ---------------------------------------------------------------------------
// A tiny in-memory stand-in for the Supabase query builder (only what circles.ts uses).

type Row = Record<string, any>;

function fakeDb(tables: Record<string, Row[]>) {
	const from = (table: string) => {
		const rows = (tables[table] ??= []);
		const filters: Array<(r: Row) => boolean> = [];
		let patch: Row | null = null;
		let limit = Infinity;
		let offset = 0;
		const run = () => {
			const hit = rows.filter((r) => filters.every((f) => f(r)));
			if (patch) for (const r of hit) Object.assign(r, patch);
			return { data: hit.slice(offset, offset + limit), error: null };
		};
		const q: any = {
			select: () => q,
			eq: (c: string, v: unknown) => (filters.push((r) => r[c] === v), q),
			neq: (c: string, v: unknown) => (
				filters.push((r) => r[c] !== null && r[c] !== undefined && r[c] !== v),
				q
			),
			in: (c: string, vs: unknown[]) => (filters.push((r) => vs.includes(r[c])), q),
			is: (c: string, v: unknown) => (filters.push((r) => (r[c] ?? null) === v), q),
			order: () => q,
			limit: (n: number) => ((limit = n), q),
			range: (a: number, b: number) => ((offset = a), (limit = b - a + 1), q),
			maybeSingle: async () => ({ data: run().data[0] ?? null, error: null }),
			update: (values: Row) => ((patch = values), q),
			upsert: async (row: Row) => {
				const dup = rows.some(
					(r) => r.entity_a === row.entity_a && r.entity_b === row.entity_b
				);
				if (!dup) rows.push({ status: 'pending', ...row });
				return { error: null };
			},
			then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
				Promise.resolve(run()).then(resolve, reject)
		};
		return q;
	};
	return { from, rpc: async () => ({ data: null, error: null }) };
}

const USER = 'u1';
const BEFORE = '2026-11-18T03:00:00Z'; // the old "inner circle or public figure?" question
const AFTER = '2026-11-19T03:00:00Z';

function entity(id: string, name: string, extra: Row = {}): Row {
	return {
		id,
		name,
		kind: 'org',
		owner_user_id: USER,
		status: 'active',
		is_self: false,
		created_via: 'backfill',
		created_at: '2026-11-17T00:00:00Z',
		updated_at: '2026-11-17T00:00:00Z',
		circle: 'unknown',
		circle_source: null,
		circle_set_at: null,
		hidden_reason: null,
		...extra
	};
}

function link(entityId: string, kind: string, recordId: string, quote: string, at = BEFORE): Row {
	return {
		entity_id: entityId,
		owner_user_id: USER,
		record_kind: kind,
		record_id: recordId,
		quote,
		created_at: at
	};
}

function graph() {
	return {
		knowledge_entities: [
			entity('doordash', 'DoorDash', {
				circle: 'inner',
				circle_source: 'model',
				circle_set_at: BEFORE
			}),
			entity('arnette', 'Arnette Welding'),
			entity('desk', 'Desk'),
			entity('anduril', 'Anduril'),
			entity('anduril-inc', 'Anduril Industries', {
				circle: 'public',
				circle_source: 'model',
				circle_set_at: AFTER
			}),
			entity('lyft', 'Lyft', {
				circle: 'inner',
				circle_source: 'user',
				circle_set_at: AFTER
			}),
			entity('cnn', 'CNN', { circle: 'public', circle_source: 'user', circle_set_at: AFTER })
		],
		knowledge_record_links: [
			link('doordash', 'document', 'resume', 'integrations with Lyft, Uber, DoorDash'),
			link('doordash', 'document', 'brief1', 'Instacart, DoorDash, Traversal'),
			link('doordash', 'document', 'brief2', 'DoorDash lawsuits'),
			link('arnette', 'task', 't1', 'Arnette Welding'),
			link('desk', 'document', 'offer', 'Printable offer sheets (Diagnosis, Bid Desk'),
			link('anduril', 'document', 'brief1', "Anduril's laptop"),
			link('lyft', 'document', 'resume', 'Lyft')
		],
		knowledge_facts: [],
		knowledge_merge_candidates: [],
		onto_tasks: [{ id: 't1', title: 'Call Arnette Welding about a website', project_id: 'p1' }],
		onto_projects: [{ id: 'p1', name: 'Wayne Strategies outreach' }],
		onto_documents: [
			{ id: 'resume', title: 'Work history', type_key: 'document.reference.handbook' },
			{ id: 'brief1', title: 'TBPN Oct 27', type_key: 'document.knowledge.research' },
			{ id: 'brief2', title: 'Pod notes', type_key: 'document.knowledge.research.podcast' },
			{ id: 'offer', title: 'Offer sheets', type_key: 'document.context.project' }
		],
		chat_sessions: [],
		onto_goals: []
	};
}

describe('what the sorter shows the model', () => {
	it('labels where each mention came from, with titles, own work first', async () => {
		const tables = graph();
		const { decider, asked } = fakeDecider({});
		await sortKnowledgeEntries(fakeDb(tables), USER, ['doordash', 'arnette'], {
			decider,
			save: false
		});
		const entries = Object.values(asked[0]!.state.entries) as Array<Record<string, any>>;
		const doordash = entries.find((e) => e.name === 'DoorDash')!;
		expect(doordash.mentions[0]).toMatch(/^Your document: "Work history"/);
		expect(
			doordash.mentions.slice(1).every((m: string) => m.startsWith('AI research brief'))
		).toBe(true);
		expect(doordash.comes_up_in).toEqual({ your_documents: 1, research_briefs: 2 });
		const arnette = entries.find((e) => e.name === 'Arnette Welding')!;
		expect(arnette.mentions[0]).toBe(
			'Your task: "Call Arnette Welding about a website" (project "Wayne Strategies outreach")'
		);
	});

	it("passes the user's own answers as examples", async () => {
		const { decider, asked } = fakeDecider({});
		await sortKnowledgeEntries(fakeDb(graph()), USER, ['arnette'], { decider, save: false });
		expect(asked[0]!.state.examples).toEqual(
			expect.arrayContaining([
				{ name: 'Lyft', kind: 'org', user_said: 'part of my world' },
				{ name: 'CNN', kind: 'org', user_said: 'just mentioned' }
			])
		);
	});

	it('asks "same one?" only when a similar name exists', async () => {
		const { decider, asked } = fakeDecider({});
		await sortKnowledgeEntries(fakeDb(graph()), USER, ['anduril', 'arnette'], {
			decider,
			save: false
		});
		const keys = Object.keys(asked[0]!.questions);
		const andurilKey = Object.entries(asked[0]!.state.entries).find(
			([, e]: [string, any]) => e.name === 'Anduril'
		)![0];
		expect(keys).toContain(`${andurilKey}_same`);
		expect(keys.filter((k) => k.endsWith('_same'))).toHaveLength(1);
	});
});

describe('what each answer does', () => {
	async function sortAll() {
		const tables = graph();
		const db = fakeDb(tables);
		// e1..: the order the model sees them (DoorDash, Arnette, Desk, Anduril)
		const { decider } = fakeDecider({
			e1: ['public', 0.9],
			e2: ['inner', 0.9],
			e3: ['not_a_name', 0.85],
			e4: ['public', 0.8],
			e4_same: ['s1', 0.9]
		});
		const result = await sortKnowledgeEntries(
			db,
			USER,
			['doordash', 'arnette', 'desk', 'anduril', 'lyft', 'cnn'],
			{ decider, now: () => new Date(AFTER) }
		);
		const byId = new Map(tables.knowledge_entities.map((e) => [e.id, e]));
		return { tables, byId, result };
	}

	it('moves DoorDash out of your world and keeps Arnette Welding in it', async () => {
		const { byId } = await sortAll();
		expect(byId.get('doordash')).toMatchObject({ circle: 'public', circle_source: 'model' });
		expect(byId.get('arnette')).toMatchObject({ circle: 'inner', circle_source: 'model' });
	});

	it('hides a non-name reversibly and suggests the merge', async () => {
		const { byId, tables, result } = await sortAll();
		expect(byId.get('desk')).toMatchObject({ status: 'hidden', hidden_reason: 'not_a_name' });
		expect(tables.knowledge_merge_candidates).toEqual([
			expect.objectContaining({ entity_a: 'anduril', entity_b: 'anduril-inc' })
		]);
		expect(result).toMatchObject({ notAName: 1, mergeSuggestions: 1, calls: 1 });
	});

	it("never overrides the user's own answer", async () => {
		const { byId } = await sortAll();
		expect(byId.get('lyft')).toMatchObject({ circle: 'inner', circle_source: 'user' });
		expect(byId.get('cnn')).toMatchObject({ circle: 'public', circle_source: 'user' });
	});

	it('leaves unsure picks unknown and does not hide on a weak "not a name"', async () => {
		const tables = graph();
		const { decider } = fakeDecider({ e1: ['not_a_name', 0.6] });
		await sortKnowledgeEntries(fakeDb(tables), USER, ['desk'], { decider });
		const desk = tables.knowledge_entities.find((e) => e.id === 'desk')!;
		expect(desk).toMatchObject({ status: 'active', circle: 'unknown' });
	});

	it('changes nothing when the model is unavailable', async () => {
		const tables = graph();
		const before = JSON.stringify(tables.knowledge_entities);
		await sortKnowledgeEntries(fakeDb(tables), USER, ['arnette', 'desk'], { decider: null });
		expect(JSON.stringify(tables.knowledge_entities)).toBe(before);
	});
});

describe('when the sorter runs', () => {
	it('re-asks decisions made under the old question, and new work, not research briefs', async () => {
		const tables = graph();
		tables.knowledge_entities.push(
			entity('cnn2', 'NPR', {
				circle: 'public',
				circle_source: 'model',
				circle_set_at: AFTER
			})
		);
		tables.knowledge_record_links.push(
			link('cnn2', 'task', 't1', 'NPR', '2026-11-20T00:00:00Z'),
			link('anduril-inc', 'document', 'brief2', 'Anduril', '2026-11-20T00:00:00Z')
		);
		const found = await findEntriesToSort(
			fakeDb(tables),
			USER,
			() => new Date('2026-11-20T01:00:00Z')
		);
		expect(found.ids.sort()).toEqual([
			'anduril',
			'anduril-inc',
			'arnette',
			'cnn2',
			'desk',
			'doordash'
		]);
		expect(found.why).toEqual({ never_sorted: 3, old_question: 1, new_work: 2 });
		expect(found.ripe).toBe(true);

		// The brief alone is free to settle: the earlier "just mentioned" stands.
		const signals = await import('./circles').then((m) =>
			m.gatherCircleSignals(fakeDb(tables), USER, ['anduril-inc', 'cnn2'])
		);
		expect(circleFromSignals(signals.find((s) => s.entityId === 'anduril-inc')!)).toMatchObject(
			{ circle: 'public', source: 'model' }
		);
		expect(circleFromSignals(signals.find((s) => s.entityId === 'cnn2')!)).toBeNull();
	});

	it('waits for a batch: a few fresh entries are not ripe yet', async () => {
		const tables = {
			knowledge_entities: [
				entity('a', 'Comer Construction', { created_at: '2026-11-20T00:00:00Z' })
			],
			knowledge_record_links: []
		};
		const soon = await findEntriesToSort(
			fakeDb(tables),
			USER,
			() => new Date('2026-11-20T05:00:00Z')
		);
		expect(soon).toMatchObject({ ids: ['a'], ripe: false });
		const later = await findEntriesToSort(
			fakeDb(tables),
			USER,
			() => new Date('2026-11-21T01:00:00Z')
		);
		expect(later.ripe).toBe(true);
	});
});

describe('review fixes', () => {
	it("does not restamp the user's own answers", async () => {
		const tables = graph();
		const { decider } = fakeDecider({});
		await sortKnowledgeEntries(fakeDb(tables), USER, ['lyft', 'cnn'], {
			decider,
			now: () => new Date('2026-12-01T00:00:00Z')
		});
		const lyft = tables.knowledge_entities.find((e) => e.id === 'lyft')!;
		expect(lyft.circle_set_at).toBe(AFTER);
	});

	it('rechecks an entry signals left unknown once work links to it', async () => {
		const tables = graph();
		tables.knowledge_entities.push(
			entity('sys', 'Comer Construction', {
				created_via: 'system',
				circle: 'unknown',
				circle_source: 'signals',
				circle_set_at: AFTER
			})
		);
		tables.knowledge_record_links.push(
			link('sys', 'task', 't1', 'Comer Construction', '2026-11-20T00:00:00Z')
		);
		const found = await findEntriesToSort(
			fakeDb(tables),
			USER,
			() => new Date('2026-11-22T00:00:00Z')
		);
		expect(found.ids).toContain('sys');
	});

	it('never suggests merging into an entry hidden as not a name', async () => {
		const tables = graph();
		// e1 = Anduril (same as Anduril Industries), e2 = Anduril Industries' twin is hidden
		tables.knowledge_entities.find((e) => e.id === 'anduril-inc')!.circle_source = null;
		const { decider } = fakeDecider({
			e1: ['public', 0.9],
			e1_same: ['s1', 0.9],
			e2: ['not_a_name', 0.9]
		});
		await sortKnowledgeEntries(fakeDb(tables), USER, ['anduril', 'anduril-inc'], { decider });
		expect(tables.knowledge_merge_candidates).toEqual([]);
		expect(tables.knowledge_entities.find((e) => e.id === 'anduril-inc')).toMatchObject({
			status: 'hidden',
			hidden_reason: 'not_a_name'
		});
	});
});

describe('circle signals and the question version', () => {
	const base: CircleSignals = {
		entityId: 'e1',
		name: 'DoorDash',
		kind: 'org',
		isSelf: false,
		createdVia: 'backfill',
		knownByMe: false,
		ownedByMe: false,
		hasPrivateContact: false,
		worksForMine: false,
		linkedRecords: 1,
		mentions: [],
		current: { circle: 'inner', source: 'model', setAt: AFTER }
	};

	it('keeps a current model decision, re-asks an old one or one with new work', () => {
		expect(circleFromSignals(base)).toMatchObject({ circle: 'inner', source: 'model' });
		expect(
			circleFromSignals({ ...base, current: { ...base.current!, setAt: BEFORE } })
		).toBeNull();
		expect(circleFromSignals({ ...base, newEvidence: true })).toBeNull();
		expect(Date.parse(BEFORE)).toBeLessThan(Date.parse(CIRCLE_QUESTION_SINCE));
	});

	it('maps a "same one" pick to the similar entry id', async () => {
		const { decider } = fakeDecider({ e1: ['inner', 0.9], e1_same: ['s2', 0.8] });
		const { decisions } = await decideCirclesWithModel(
			[
				{
					...base,
					similar: [
						{ id: 'x', name: 'Dash' },
						{ id: 'y', name: 'DoorDash Inc' }
					]
				}
			],
			decider
		);
		expect(decisions[0]).toMatchObject({ circle: 'inner', sameAs: 'y' });
	});
});

describe('similar names', () => {
	const all = [
		{ id: 'a', name: 'Anduril', kind: 'org' as const },
		{ id: 'b', name: 'Anduril Industries', kind: 'org' as const },
		{ id: 'c', name: 'Phil Velayo', kind: 'person' as const },
		{ id: 'd', name: 'Phillip Velayo', kind: 'person' as const },
		{ id: 'e', name: 'Phil Smith', kind: 'person' as const },
		{ id: 'f', name: 'Anduril', kind: 'person' as const },
		{ id: 'g', name: 'The Cadre', kind: 'org' as const },
		{ id: 'h', name: 'Cadre', kind: 'org' as const }
	];
	it('finds name prefixes and same-surname spellings, same kind only', () => {
		expect(findSimilarEntries(all[0]!, all)).toEqual([{ id: 'b', name: 'Anduril Industries' }]);
		expect(findSimilarEntries(all[2]!, all)).toEqual([{ id: 'd', name: 'Phillip Velayo' }]);
		expect(findSimilarEntries(all[6]!, all)).toEqual([{ id: 'h', name: 'Cadre' }]);
		expect(findSimilarEntries(all[4]!, all)).toEqual([]);
	});
});

describe('request size', () => {
	it('keeps a worst-case batch well under the request limit', async () => {
		const sizes: number[] = [];
		const decider: IdentityDecider = {
			async decide(request) {
				sizes.push(JSON.stringify(request).length);
				return { ok: false, error: 'probe', receipt: { costUsd: 0 } };
			}
		};
		const long = 'x'.repeat(1000); // trimmed to the per-mention cap
		const entries: CircleSignals[] = Array.from({ length: CIRCLE_BATCH_SIZE * 2 }, (_, i) => ({
			entityId: `e${i}`,
			name: `${'Very Long Organization Name '.repeat(4)}${i}`,
			kind: 'org',
			isSelf: false,
			createdVia: 'backfill',
			knownByMe: false,
			ownedByMe: false,
			hasPrivateContact: false,
			worksForMine: false,
			linkedRecords: 40,
			mentions: [long, long, long, long, long],
			appearances: { your_tasks: 9, your_documents: 9, research_briefs: 30, your_chats: 2 },
			similar: [1, 2, 3, 4].map((n) => ({
				id: `s${n}`,
				name: `${'Similar Long Name '.repeat(3)}${n}`
			})),
			current: null
		}));
		const examples = Array.from({ length: 40 }, (_, i) => ({
			name: `${'Example Organization '.repeat(3)}${i}`,
			kind: 'org' as const,
			answer: 'public' as const
		}));
		await decideCirclesWithModel(entries, decider, { examples });
		expect(sizes).toHaveLength(2);
		// Headroom for the client's own wrapping and longer real names.
		expect(Math.max(...sizes)).toBeLessThan(CIRCLE_MAX_REQUEST_BYTES * 0.7);
	});
});
