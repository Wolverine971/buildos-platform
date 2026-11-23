// packages/shared-agent-ops/src/gateway/op-execution-gateway.knowledge-connections.test.ts
//
// query_knowledge's people path (tasker 166). The seven questions the tracker names each map
// to one structured call; these prove the call that reaches the database, and that the answer
// a model reads carries the gap sentences and never another caller's contact details.
//
//   failure                                         trigger
//   a people filter is ignored (answers everyone)   where.company / place / … on a call
//   "Palantir" start answers the whole graph        start.search that matches nothing
//   a connected AI tool reads phone numbers         MCP caller without knowledge.contacts
//   a thin answer reads as "nobody"                 place filter over unplaced people
import { beforeEach, describe, expect, it, vi } from 'vitest';

const search = vi.fn();
const getSummaries = vi.fn();
const query = vi.fn();

vi.mock('../knowledge', async (importOriginal) => {
	const actual = await importOriginal<typeof import('../knowledge')>();
	class FakeKnowledgeStore {
		constructor(
			readonly db: unknown,
			readonly userId: string
		) {}
		search = search;
		getSummaries = getSummaries;
		query = query;
	}
	return { ...actual, KnowledgeStore: FakeKnowledgeStore };
});

import { EXTERNAL_OP_HANDLERS } from './op-execution-gateway.external';
import { isKnowledgeConnectionQuery } from './op-execution-gateway.knowledge-connections';
import type { ToolExecutionContext } from './op-execution-gateway.types';

const USER = '11111111-1111-4111-8111-111111111111';
const SAM = '33333333-3333-4333-8333-333333333333';
const ACME = '44444444-4444-4444-8444-444444444444';
const PAT = '55555555-5555-4555-8555-555555555555';
const THE_ACME = '55555555-5555-4555-8555-555555555555';
const ANNAPOLIS = '66666666-6666-4666-8666-666666666666';

const rpc = vi.fn();
const admin = { from: vi.fn(), rpc };

const COVERAGE = {
	people: 767,
	known: 767,
	with_company: 767,
	with_title: 767,
	with_place: 14,
	with_industry: 9,
	companies: 631,
	companies_with_place: 6,
	companies_with_industry: 5
};

function answer(overrides: Record<string, unknown> = {}) {
	return {
		data: {
			people: [
				{
					id: SAM,
					name: 'Sam Lee',
					known: true,
					connected_on: '2024-01-05',
					jobs: [{ org_id: ACME, org: 'Acme', title: 'Engineer', current: true }],
					places: ['Annapolis, Maryland'],
					email: ['sam@example.test'],
					phone: ['+1 555 0100']
				}
			],
			total: 1,
			facets: {},
			coverage: COVERAGE,
			gaps: {
				companies_without_place: [{ id: ACME, name: 'Curri', people: 52 }],
				companies_without_industry: [{ id: ACME, name: 'Curri', people: 52 }]
			},
			...overrides
		},
		error: null
	};
}

function chat(): ToolExecutionContext {
	return { admin, userId: USER, chatSessionId: 'chat-session', scope: { mode: 'read_write' } };
}

function mcp(allowed: string[] = []): ToolExecutionContext {
	return {
		admin,
		userId: USER,
		callerId: 'caller-1',
		callSessionId: 'call-session',
		scope: { mode: 'read_write', project_ids: [], allowed_ops: allowed } as never
	};
}

const run = (context: ToolExecutionContext, args: Record<string, unknown>) =>
	EXTERNAL_OP_HANDLERS['knowledge.query']!(context, args) as Promise<Record<string, any>>;

function sent(): { filters: Record<string, unknown>; call: Record<string, unknown> } {
	const call = rpc.mock.calls.at(-1)![1] as Record<string, unknown>;
	return { filters: call.p_filters as Record<string, unknown>, call };
}

beforeEach(() => {
	vi.clearAllMocks();
	rpc.mockResolvedValue(answer());
});

describe('which calls take the people path', () => {
	it.each([
		[{ start: { known_by_me: true }, where: { company: ['Acme'] } }, true],
		[{ start: { known_by_me: true }, group_by: 'company' }, true],
		[{ start: { known_by_me: true }, where: { place: 'Maryland' } }, true],
		[{ start: { known_by_me: true }, where: { known_by_me: true } }, false],
		[
			{ start: { search: 'Acme' }, follow: [{ predicate: 'works_at', direction: 'in' }] },
			false
		],
		[{ start: { known_by_me: true }, where: { company: [] }, group_by: '' }, false]
	])('%j → %s', (args, expected) => {
		expect(isKnowledgeConnectionQuery(args)).toBe(expected);
	});

	it('leaves a relationship query on the traversal', async () => {
		query.mockResolvedValue({
			rows: [],
			coverage: {},
			start_count: 0,
			truncated: false,
			notes: []
		});
		await run(chat(), { start: { known_by_me: true }, fields: ['works_at'] });
		expect(query).toHaveBeenCalledTimes(1);
		expect(rpc).not.toHaveBeenCalled();
	});
});

describe('the seven questions, as the calls that reach the database', () => {
	it('1. who do I know at a company, and who used to work there', async () => {
		await run(chat(), { start: { known_by_me: true }, where: { company: 'Acme' } });
		expect(sent().filters).toEqual({ scope: 'known', company: ['Acme'], contacts: true });
		expect(sent().call.p_viewer).toBe(USER);
		await run(chat(), {
			start: { known_by_me: true },
			where: { company: ['Acme'], employment: 'former' }
		});
		expect(sent().filters).toMatchObject({ company: ['Acme'], employment: 'former' });
	});

	it('2. who do I know in an area', async () => {
		await run(chat(), {
			start: { known_by_me: true },
			where: { place: ['Baltimore', 'Washington', 'DC'] }
		});
		expect(sent().filters).toMatchObject({ place: ['Baltimore', 'Washington', 'DC'] });
	});

	it('3. which contacts work at the same kind of company', async () => {
		rpc.mockResolvedValue(
			answer({
				people: [],
				total: 9,
				facets: {
					industry: {
						total: 3,
						groups: [
							{
								key: 'roofing',
								name: 'Roofing',
								people: 2,
								sample: ['Kevin', 'Lucinda']
							}
						]
					}
				}
			})
		);
		const result = await run(chat(), { start: { known_by_me: true }, group_by: 'industry' });
		expect(sent().call).toMatchObject({
			p_facets: ['industry'],
			p_limit: 0,
			p_facet_limit: 25
		});
		expect(result.groups).toEqual([
			{ name: 'Roofing', people: 2, sample: ['Kevin', 'Lucinda'] }
		]);
		expect(result.groups_total).toBe(3);
		expect(result).not.toHaveProperty('people');
		// 626 employers with no industry is the honest part of this answer.
		expect(result.notes.join(' ')).toMatch(/known for 5 of 631 employers/);
		expect(result.research_candidates).toEqual([{ id: ACME, name: 'Curri', people: 52 }]);
	});

	it('4. who leads to someone at a company, and who is already there', async () => {
		// First read: the people who lead there. Second: the people who work there now.
		rpc.mockResolvedValueOnce(
			answer({
				people: [
					{
						id: SAM,
						name: 'Sam Lee',
						known: true,
						bridge: [{ how: 'worked_there', through: 'Acme' }]
					}
				]
			})
		).mockResolvedValueOnce(
			answer({
				people: [
					{ id: PAT, name: 'Pat Roe', known: true },
					{ id: SAM, name: 'Sam Lee' }
				],
				total: 3
			})
		);
		const result = await run(chat(), {
			start: { known_by_me: true },
			where: { bridge_to: ['Acme'] }
		});
		expect(rpc).toHaveBeenCalledTimes(2);
		expect(rpc.mock.calls[0]![1].p_filters).toMatchObject({ bridge_to: ['Acme'] });
		expect(rpc.mock.calls[1]![1].p_filters).toEqual({
			scope: 'known',
			company: ['Acme'],
			contacts: true
		});
		expect(result.people.map((person: any) => person.name)).toEqual(['Sam Lee']);
		expect(result.people[0].leads_via).toEqual([{ how: 'worked_there', through: 'Acme' }]);
		expect(result.works_there_now.total).toBe(3);
		expect(result.works_there_now.people.map((person: any) => person.name)).toEqual([
			'Pat Roe',
			'Sam Lee'
		]);
		expect(result.notes).toEqual([
			'3 people the user knows work at Acme now: they are in works_there_now and are the direct way in. people lists only others who lead to them.'
		]);
	});

	it('5. what is this person doing now: their row carries job, place and contact details', async () => {
		getSummaries.mockResolvedValue(
			new Map([[SAM, { id: SAM, kind: 'person', name: 'Sam Lee' }]])
		);
		const result = await run(chat(), {
			start: { entity_ids: [SAM] },
			where: { employment: 'any' }
		});
		expect(sent().filters).toMatchObject({
			scope: 'world',
			person_ids: [SAM],
			employment: 'any'
		});
		expect(result.people[0]).toEqual({
			id: SAM,
			name: 'Sam Lee',
			jobs: [{ org: 'Acme', org_id: ACME, title: 'Engineer' }],
			places: ['Annapolis, Maryland'],
			connected_on: '2024-01-05',
			email: ['sam@example.test'],
			phone: ['+1 555 0100']
		});
	});

	it('6. who shows up across tasks, docs and contacts', async () => {
		await run(chat(), {
			start: { known_by_me: true },
			where: { in_records: ['task', 'document'] }
		});
		expect(sent().filters).toMatchObject({ scope: 'known', in_records: ['task', 'document'] });
	});

	it('7. the person from LinkedIn who does a role in an industry', async () => {
		await run(chat(), {
			start: { known_by_me: true },
			where: { via: 'linkedin', title: ['designer'], industry: ['fintech', 'banking'] }
		});
		expect(sent().filters).toMatchObject({
			via: 'linkedin',
			title: ['designer'],
			industry: ['fintech', 'banking']
		});
	});

	it("DJ's own: tech companies in Maryland where I know people", async () => {
		await run(chat(), {
			start: { known_by_me: true },
			where: {
				place: ['Maryland'],
				place_of: 'company',
				industry: ['software', 'technology']
			},
			group_by: 'company',
			limit: 500
		});
		expect(sent().filters).toMatchObject({
			place: ['Maryland'],
			place_of: 'company',
			industry: ['software', 'technology']
		});
		expect(sent().call).toMatchObject({ p_facets: ['company'], p_facet_limit: 50 });
	});
});

describe('starting from a named entry', () => {
	it('turns an org into a company filter by id and by name, so a twin entry still counts', async () => {
		search.mockResolvedValue([
			{ id: ACME, kind: 'org', name: 'Acme', score: 0.9 },
			{ id: THE_ACME, kind: 'org', name: 'The Acme', score: 0.88 },
			{ id: SAM, kind: 'org', name: 'Acme Fireworks', score: 0.4 }
		]);
		await run(chat(), {
			start: { search: 'Acme', kinds: ['org'] },
			where: { title: ['engineer'] }
		});
		expect(search).toHaveBeenCalledWith('Acme', { kinds: ['org'], limit: 10 });
		expect(sent().filters).toMatchObject({
			company_ids: [ACME, THE_ACME],
			company: ['Acme', 'The Acme'],
			title: ['engineer']
		});
	});

	it('turns a place into a place filter', async () => {
		getSummaries.mockResolvedValue(
			new Map([[ANNAPOLIS, { id: ANNAPOLIS, kind: 'place', name: 'Annapolis, MD' }]])
		);
		await run(chat(), { start: { entity_ids: [ANNAPOLIS] }, group_by: 'company' });
		expect(sent().filters).toMatchObject({ place_ids: [ANNAPOLIS] });
	});

	it('answers "nothing matched" instead of everyone when the start finds nothing', async () => {
		search.mockResolvedValue([]);
		const result = await run(chat(), {
			start: { search: 'Palantir' },
			where: { title: ['engineer'] }
		});
		expect(rpc).not.toHaveBeenCalled();
		expect(result).toEqual({
			people: [],
			total: 0,
			notes: ['Nothing in your knowledge matched "Palantir".']
		});
	});
});

describe('what the model reads', () => {
	it('says how many people cannot be placed when a place filter is thin', async () => {
		const result = await run(chat(), {
			start: { known_by_me: true },
			where: { place: ['Maryland'] }
		});
		expect(result.notes[0]).toBe(
			"A location (their own or their employer's) is known for 14 of 767 people; the other 753 can't be placed yet."
		);
		expect(result.notes.at(-1)).toMatch(/starts only when the user agrees/);
		expect(result.coverage).toEqual(COVERAGE);
	});

	it('marks a truncated list and someone who is not a contact', async () => {
		rpc.mockResolvedValue(
			answer({ people: [{ id: SAM, name: 'Sam Lee', known: false }], total: 40 })
		);
		const result = await run(chat(), {
			start: { kinds: ['person'] },
			where: { company: ['Acme'] }
		});
		expect(result.truncated).toBe(true);
		expect(result.people[0]).toEqual({ id: SAM, name: 'Sam Lee', not_a_contact: true });
	});

	it('notes that follow is not part of a people query', async () => {
		const result = await run(chat(), {
			start: { known_by_me: true },
			follow: [{ predicate: 'works_at' }],
			where: { company: ['Acme'] }
		});
		expect(result.notes[0]).toMatch(/follow is not used/);
	});
});

describe('nobody matches', () => {
	const nobody = () =>
		rpc.mockResolvedValue(
			answer({
				people: [],
				total: 0,
				coverage: { ...COVERAGE, people: 0 },
				gaps: { companies_without_place: [], companies_without_industry: [] }
			})
		);

	it('says who was looked for and that only current jobs were checked', async () => {
		nobody();
		const result = await run(chat(), {
			start: { known_by_me: true },
			where: { company: ['Curri'] }
		});
		expect(result.notes).toEqual([
			"Nobody the user knows is recorded at Curri as a current job (employment 'any' also checks past ones). It may simply not be recorded yet."
		]);
	});

	it('explains an empty way in to a company', async () => {
		nobody();
		const result = await run(chat(), {
			start: { kinds: ['person'] },
			where: { bridge_to: ['Anduril'] }
		});
		expect(result.works_there_now).toBeUndefined();
		expect(result.notes).toEqual([
			"Nobody in the user's world is recorded at Anduril now, and nobody shares another employer, a task, a document or a project with someone there, or is recorded there as a past job. Past jobs are often missing; research on a contact adds them."
		]);
	});

	it('never says nobody works there when contacts do: they are the way in', async () => {
		// DJ's real graph after the LinkedIn import: three contacts at the company, and no
		// recorded link between contacts, so the bridge list is empty.
		rpc.mockResolvedValueOnce(
			answer({ people: [], total: 0, coverage: { ...COVERAGE, people: 0 } })
		).mockResolvedValueOnce(
			answer({ people: [{ id: PAT, name: 'Pat Roe', known: true }], total: 1 })
		);
		const result = await run(chat(), {
			start: { known_by_me: true },
			where: { bridge_to: ['Anduril'] }
		});
		expect(result.total).toBe(0);
		expect(result.works_there_now).toMatchObject({ total: 1, people: [{ name: 'Pat Roe' }] });
		expect(result.notes[0]).toBe(
			'1 person the user knows works at Anduril now: they are in works_there_now and are the direct way in. people lists only others who lead to them.'
		);
		expect(result.notes[1]).toMatch(/^Nobody else shares another employer/);
		expect(result.notes.join(' ')).not.toMatch(/nobody recorded works there/i);
	});

	it('says contacts are missing altogether when no filter was the cause', async () => {
		nobody();
		const result = await run(chat(), { start: { known_by_me: true }, group_by: 'company' });
		expect(result.notes).toEqual([
			'No contacts are recorded yet. They arrive by importing contacts or saying who the user knows.'
		]);
	});
});

describe('contact details', () => {
	it("keeps contact values and street addresses from a connected AI tool that hasn't opted in", async () => {
		await run(mcp(), { start: { known_by_me: true }, where: { place: ['Maryland'] } });
		expect(sent().filters).toEqual({ scope: 'known', place: ['Maryland'], addresses: false });
	});

	it('shares them with one that has', async () => {
		await run(mcp(['knowledge.contacts']), {
			start: { known_by_me: true },
			where: { company: ['Acme'] }
		});
		expect(sent().filters).toMatchObject({ contacts: true });
		expect(sent().filters).not.toHaveProperty('addresses');
	});
});

describe('bad arguments', () => {
	it.each([
		['an unknown group', { start: { known_by_me: true }, group_by: 'mood' }],
		['a filter that is not text', { start: { known_by_me: true }, where: { company: [42] } }],
		[
			'a related_to that is not an id',
			{ start: { known_by_me: true }, where: { related_to: 'sam' } }
		],
		[
			'an unknown employment',
			{ start: { known_by_me: true }, where: { employment: 'retired' } }
		],
		['a start id that is not a UUID', { start: { entity_ids: ['sam'] }, group_by: 'company' }],
		['a zero limit', { start: { known_by_me: true }, group_by: 'company', limit: 0 }]
	])('refuses %s before the database', async (_label, args) => {
		await expect(run(chat(), args)).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
		expect(rpc).not.toHaveBeenCalled();
	});

	it('refuses a project-limited connection, like every knowledge op', async () => {
		await expect(
			run({ ...chat(), projectScopeMode: 'selected' } as ToolExecutionContext, {
				start: { known_by_me: true },
				where: { company: ['Acme'] }
			})
		).rejects.toMatchObject({ code: 'FORBIDDEN' });
	});
});
