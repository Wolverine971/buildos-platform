// packages/shared-agent-ops/src/knowledge/connections.test.ts
//
// Find connections (tasker 166). The database function is proven against real rows by
// supabase/tests/knowledge_connections.check.sql; these cover what sits around it:
//   - a filter the caller sent wrong is refused before the database sees it (the function
//     casts ids, so a bad one would otherwise surface as a server error);
//   - the viewer is always the session's user;
//   - a thin answer says what is missing, and only about the data the question needed.
import { describe, expect, it, vi } from 'vitest';
import {
	KnowledgeConnectionsError,
	describeKnowledgeConnectionGaps,
	knowledgeConnectionFilterPayload,
	readKnowledgeConnections,
	type KnowledgeConnectionsResult
} from './connections';

const USER = '11111111-1111-4111-8111-111111111111';
const PERSON = '33333333-3333-4333-8333-333333333333';
const ORG = '44444444-4444-4444-8444-444444444444';

function client(data: unknown, error: unknown = null) {
	return { from: vi.fn(), rpc: vi.fn(async () => ({ data, error })) };
}

const COVERAGE = {
	people: 767,
	known: 767,
	with_company: 758,
	with_title: 760,
	with_place: 14,
	with_industry: 9,
	companies: 631,
	companies_with_place: 6,
	companies_with_industry: 5
};
const THIN: Pick<KnowledgeConnectionsResult, 'coverage' | 'gaps'> = {
	coverage: COVERAGE,
	gaps: {
		companies_without_place: [{ id: ORG, name: 'Curri', people: 52 }],
		companies_without_industry: [{ id: ORG, name: 'Curri', people: 52 }]
	}
};

describe('knowledgeConnectionFilterPayload', () => {
	it('trims, de-duplicates and drops empty filters', () => {
		expect(
			knowledgeConnectionFilterPayload({
				scope: 'known',
				company: ['  Booz   Allen ', 'Booz Allen', ''],
				place: [],
				title: undefined,
				via: ' LinkedIn '
			})
		).toEqual({ scope: 'known', company: ['Booz Allen'], via: 'linkedin' });
	});

	it('sends contact and address switches only when they change the default', () => {
		expect(knowledgeConnectionFilterPayload({}, { contacts: true, addresses: true })).toEqual({
			contacts: true
		});
		expect(knowledgeConnectionFilterPayload({}, { contacts: false, addresses: false })).toEqual(
			{ addresses: false }
		);
	});

	it.each([
		['an id that is not a UUID', { person_ids: ['sam'] }],
		['a related_to that is not a UUID', { related_to: "x'; DROP TABLE" }],
		['an unknown scope', { scope: 'friends' as never }],
		['an unknown employment', { employment: 'retired' as never }],
		['an unknown record kind', { in_records: ['email' as never] }],
		['too many words', { title: Array.from({ length: 13 }, (_, i) => `word${i}`) }],
		['a word that is too long', { company: ['x'.repeat(121)] }]
	])('refuses %s', (_label, filters) => {
		expect(() => knowledgeConnectionFilterPayload(filters)).toThrow(KnowledgeConnectionsError);
	});
});

describe('readKnowledgeConnections', () => {
	it('asks as the given user and fills in what the database left out', async () => {
		const db = client({
			people: [
				{ id: PERSON, name: 'Sam Lee', known: true, jobs: [{ org_id: ORG, org: 'Acme' }] }
			],
			total: 1,
			coverage: { people: 1 }
		});
		const result = await readKnowledgeConnections(
			db,
			USER,
			{ company: ['Acme'] },
			{ facets: ['company', 'company'], limit: 500, facetLimit: 0 }
		);
		expect(db.rpc).toHaveBeenCalledWith('knowledge_connections', {
			p_filters: { company: ['Acme'] },
			p_facets: ['company'],
			p_limit: 200,
			p_offset: 0,
			p_facet_limit: 1,
			p_viewer: USER
		});
		expect(result.people[0]).toEqual({
			id: PERSON,
			name: 'Sam Lee',
			known: true,
			jobs: [{ org_id: ORG, org: 'Acme', current: false }],
			places: [],
			industries: [],
			tasks: 0,
			documents: 0,
			projects: 0
		});
		expect(result.coverage.with_place).toBe(0);
		expect(result.gaps.companies_without_place).toEqual([]);
		expect(result.facets).toEqual({});
	});

	it('says so plainly when the database does not have the function yet', async () => {
		const db = client(null, { code: 'PGRST202', message: 'Could not find the function' });
		await expect(readKnowledgeConnections(db, USER)).rejects.toMatchObject({
			code: 'UNAVAILABLE'
		});
	});

	it('never reaches the database with a bad filter', async () => {
		const db = client({});
		await expect(
			readKnowledgeConnections(db, USER, { company_ids: ['nope'] })
		).rejects.toMatchObject({ code: 'INVALID' });
		expect(db.rpc).not.toHaveBeenCalled();
	});
});

describe('describeKnowledgeConnectionGaps', () => {
	it('says nothing when the question needs no thin data', () => {
		expect(describeKnowledgeConnectionGaps(THIN, { filters: { scope: 'known' } })).toEqual([]);
	});

	it('counts who cannot be placed for a place question, and names what to research', () => {
		const notes = describeKnowledgeConnectionGaps(THIN, { filters: { place: ['Maryland'] } });
		expect(notes.map((note) => note.about)).toEqual(['place', 'company']);
		expect(notes[0]!.text).toBe(
			"A location (their own or their employer's) is known for 14 of 767 people; the other 753 can't be placed yet."
		);
		expect(notes[0]!.research).toEqual(THIN.gaps.companies_without_place);
		expect(notes[1]!.text).toBe('9 people have no employer recorded.');
	});

	it('counts employers with no industry for an industry question or grouping', () => {
		for (const asked of [
			{ filters: { industry: ['software'] } },
			{ facets: ['industry' as const] }
		]) {
			const note = describeKnowledgeConnectionGaps(THIN, asked).find(
				(entry) => entry.about === 'industry'
			);
			expect(note?.text).toBe(
				'An industry is known for 5 of 631 employers; the other 626 have none yet.'
			);
		}
	});

	it('mentions titles only for a title question', () => {
		expect(
			describeKnowledgeConnectionGaps(THIN, { filters: { title: ['engineer'] } }).map(
				(note) => note.text
			)
		).toEqual(['7 people have no job title recorded.']);
	});

	it('is quiet when everything the question needs is known, or nobody is in the pool', () => {
		const full = {
			...THIN,
			coverage: {
				...COVERAGE,
				with_place: 767,
				with_company: 767,
				companies_with_industry: 631
			}
		};
		expect(
			describeKnowledgeConnectionGaps(full, {
				filters: { place: ['MD'], industry: ['software'] }
			})
		).toEqual([]);
		expect(
			describeKnowledgeConnectionGaps(
				{ ...THIN, coverage: { ...COVERAGE, people: 0 } },
				{ filters: { place: ['MD'] } }
			)
		).toEqual([]);
	});
});
