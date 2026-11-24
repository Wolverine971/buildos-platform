// apps/web/src/lib/server/knowledge/company-locate.server.test.ts
//
// Answering a "Which one?" question, and who may use the paid web search (tasker 170).
//   - the paid search turning on for everyone → only listed accounts (or "*") are allowed
//   - a tapped company saved as a mere suggestion, or a wrong one saved → the chosen option's
//     details are saved as known, as the user's own word, and nothing else is
//   - two tabs both answering → the second is refused
//   - someone answering another person's question → not found
import { describe, expect, it, vi } from 'vitest';

vi.mock('$env/dynamic/private', () => ({ env: {} }));

import {
	canonicalPlace,
	type CompanyOption,
	type KnowledgeWriteBatch
} from '@buildos/shared-agent-ops/knowledge';
import { answerCompanyQuestion, companyWebSearchAllowed } from './company-locate.server';

const USER = '22222222-2222-4222-8222-222222222222';
const OTHER = '99999999-9999-4999-8999-999999999999';

describe('companyWebSearchAllowed', () => {
	it('is off unless the account is listed', () => {
		expect(companyWebSearchAllowed(USER, undefined)).toBe(false);
		expect(companyWebSearchAllowed(USER, '')).toBe(false);
		expect(companyWebSearchAllowed(USER, OTHER)).toBe(false);
		expect(companyWebSearchAllowed(USER, ` ${OTHER} , ${USER} `)).toBe(true);
	});

	it('opens to everyone with "*"', () => {
		expect(companyWebSearchAllowed(USER, '*')).toBe(true);
	});
});

type Row = Record<string, any>;

function option(key: string, city: string, state: string): CompanyOption {
	return {
		key,
		name: 'Summit Consulting',
		domain: key,
		place: canonicalPlace({ city, region: state, country: 'US' }),
		street: null,
		industry: 'Consulting',
		size: null,
		founded: null,
		linkedin: null,
		description: null,
		sources: [{ source: 'directory', label: 'Directory', url: 'https://example.org/d' }],
		agreed: false
	};
}

/** Just enough of the query builder for the lookups and places reads and the answer update. */
function fakeDb(rows: { lookups: Row[]; places?: Row[] }) {
	const tables: Record<string, Row[]> = {
		knowledge_company_lookups: rows.lookups,
		knowledge_entities: rows.places ?? []
	};
	return {
		from(table: string) {
			const filters: Array<(r: Row) => boolean> = [];
			let patch: Row | null = null;
			let single = false;
			const query: any = {
				select: () => query,
				order: () => query,
				limit: () => query,
				update: (next: Row) => {
					patch = next;
					return query;
				},
				eq: (col: string, value: unknown) => {
					filters.push((r) => r[col] === value);
					return query;
				},
				maybeSingle: () => {
					single = true;
					return query;
				},
				then: (ok: (v: unknown) => unknown, fail?: (e: unknown) => unknown) => {
					const hit = (tables[table] ?? []).filter((r) => filters.every((f) => f(r)));
					if (patch) for (const r of hit) Object.assign(r, patch);
					const data = hit.map((r) => ({ ...r }));
					return Promise.resolve({
						data: single ? (data[0] ?? null) : data,
						error: null,
						count: hit.length
					}).then(ok, fail);
				}
			};
			return query;
		},
		rpc: () => Promise.resolve({ data: null, error: null })
	};
}

function fakeStore() {
	const recorded: Array<{ batch: KnowledgeWriteBatch; options: unknown }> = [];
	return {
		recorded,
		store: {
			record: async (batch: KnowledgeWriteBatch, options: unknown) => {
				recorded.push({ batch, options });
				return {
					facts: { added: batch.facts.length, existing: 0, superseded: 0, suggested: 0 }
				};
			}
		} as never
	};
}

const openQuestion = (): Row => ({
	id: 'q1',
	owner_user_id: USER,
	entity_id: 'org-1',
	options: [option('summitllc.com', 'Washington', 'DC'), option('summitcg.com', 'Denver', 'CO')],
	question_status: 'open',
	chosen_key: null
});

describe('answerCompanyQuestion', () => {
	it("saves the picked company as known, as the user's own word", async () => {
		const lookups = [openQuestion()];
		const { store, recorded } = fakeStore();

		const result = await answerCompanyQuestion(
			fakeDb({ lookups }) as never,
			store,
			USER,
			'q1',
			{
				choice: 'option',
				key: 'summitcg.com'
			}
		);

		expect(result).toEqual({ status: 'answered', facts_added: 3 });
		expect(recorded).toHaveLength(1);
		expect(recorded[0]!.options).toEqual({ via: 'manual' });
		const { batch } = recorded[0]!;
		expect(batch.entities[0]).toMatchObject({ kind: 'place', name: 'Denver, CO' });
		expect(batch.facts.map((f) => [f.predicate, f.status, f.subject])).toEqual([
			['located_in', 'active', 'org-1'],
			['homepage', 'active', 'org-1'],
			['industry', 'active', 'org-1']
		]);
		expect(batch.facts[1]!.value).toBe('https://summitcg.com');
		expect(lookups[0]).toMatchObject({
			question_status: 'answered',
			chosen_key: 'summitcg.com'
		});
	});

	it('reuses a town the user already has under another spelling', async () => {
		const lookups = [openQuestion()];
		const places = [
			{
				id: 'place-denver',
				owner_user_id: USER,
				scope: 'private',
				kind: 'place',
				status: 'active',
				name: 'Denver, Colorado'
			}
		];
		const { store, recorded } = fakeStore();
		await answerCompanyQuestion(fakeDb({ lookups, places }) as never, store, USER, 'q1', {
			choice: 'option',
			key: 'summitcg.com'
		});
		expect(recorded[0]!.batch.entities[0]).toMatchObject({ id: 'place-denver' });
	});

	it('saves nothing for "None of these" and closes the question', async () => {
		const lookups = [openQuestion()];
		const { store, recorded } = fakeStore();
		const result = await answerCompanyQuestion(
			fakeDb({ lookups }) as never,
			store,
			USER,
			'q1',
			{
				choice: 'none_of_these'
			}
		);
		expect(result).toEqual({ status: 'none_of_these', facts_added: 0 });
		expect(recorded).toEqual([]);
		expect(lookups[0]).toMatchObject({ question_status: 'none_of_these', chosen_key: null });
	});

	it('refuses a company that is not one of the choices, and saves nothing', async () => {
		const lookups = [openQuestion()];
		const { store, recorded } = fakeStore();
		await expect(
			answerCompanyQuestion(fakeDb({ lookups }) as never, store, USER, 'q1', {
				choice: 'option',
				key: 'made-up.example'
			})
		).rejects.toThrow('not one of the choices');
		expect(recorded).toEqual([]);
		expect(lookups[0]!.question_status).toBe('open');
	});

	it('refuses a second answer', async () => {
		const lookups = [
			{ ...openQuestion(), question_status: 'answered', chosen_key: 'summitllc.com' }
		];
		const { store, recorded } = fakeStore();
		await expect(
			answerCompanyQuestion(fakeDb({ lookups }) as never, store, USER, 'q1', {
				choice: 'none_of_these'
			})
		).rejects.toThrow('already answered');
		expect(recorded).toEqual([]);
		expect(lookups[0]).toMatchObject({
			question_status: 'answered',
			chosen_key: 'summitllc.com'
		});
	});

	it("does not find someone else's question, or a lookup that is not a question", async () => {
		const { store, recorded } = fakeStore();
		await expect(
			answerCompanyQuestion(
				fakeDb({ lookups: [openQuestion()] }) as never,
				store,
				OTHER,
				'q1',
				{
					choice: 'none_of_these'
				}
			)
		).rejects.toThrow('Question not found');
		const plain = [{ ...openQuestion(), question_status: null, options: [] }];
		await expect(
			answerCompanyQuestion(fakeDb({ lookups: plain }) as never, store, USER, 'q1', {
				choice: 'none_of_these'
			})
		).rejects.toThrow('Question not found');
		expect(recorded).toEqual([]);
	});
});
