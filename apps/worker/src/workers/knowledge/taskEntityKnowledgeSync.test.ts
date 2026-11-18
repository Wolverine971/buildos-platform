// apps/worker/src/workers/knowledge/taskEntityKnowledgeSync.test.ts
// "The name goes to whoever types it" (tasker 168): the task's creator files every name in it;
// a collaborator editing it files only the names their edit added, plus the ones already in
// their own People from this task.
import { describe, expect, it } from 'vitest';
import { editorRowIds } from './taskEntityKnowledgeSync';

type Tables = {
	onto_tasks: Array<{ id: string; created_by: string }>;
	onto_actors: Array<{ id: string; user_id: string }>;
	knowledge_record_links: Array<{
		owner_user_id: string;
		record_kind: string;
		record_id: string;
		entity: { name: string };
	}>;
};

function fakeDb(tables: Tables) {
	return {
		from(table: keyof Tables) {
			const filters: Array<[string, unknown]> = [];
			const rows = () =>
				(tables[table] as Array<Record<string, unknown>>).filter((row) =>
					filters.every(([key, value]) => row[key] === value)
				);
			const query = {
				select: () => query,
				eq: (key: string, value: unknown) => {
					filters.push([key, value]);
					return query;
				},
				maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
				then: (resolve: (value: { data: unknown; error: null }) => void) =>
					resolve({ data: rows(), error: null })
			};
			return query;
		}
	} as never;
}

const rows = [
	{
		id: 'r-kyle',
		display: 'Kyle Kulinski',
		value: 'Kyle Kulinski',
		natural_key: 'kyle kulinski',
		quote: null
	},
	{
		id: 'r-krystal',
		display: 'Krystal Ball',
		value: 'Krystal Ball',
		natural_key: 'krystal ball',
		quote: null
	},
	{
		id: 'r-saagar',
		display: 'Saagar Enjeti',
		value: 'Saagar Enjeti',
		natural_key: 'saagar enjeti',
		quote: null
	}
];

const tables = (links: Tables['knowledge_record_links'] = []): Tables => ({
	onto_tasks: [{ id: 't1', created_by: 'actor-alice' }],
	onto_actors: [
		{ id: 'actor-alice', user_id: 'alice' },
		{ id: 'actor-bob', user_id: 'bob' }
	],
	knowledge_record_links: links
});

describe('editorRowIds', () => {
	it('lets the task creator file every name', async () => {
		const ids = await editorRowIds(
			fakeDb(tables()),
			{ userId: 'alice', task: { id: 't1' }, newRowIds: ['r-saagar'] },
			rows
		);
		expect(ids).toBeUndefined();
	});

	it('files only the name a collaborator just added', async () => {
		const ids = await editorRowIds(
			fakeDb(tables()),
			{ userId: 'bob', task: { id: 't1' }, newRowIds: ['r-saagar'] },
			rows
		);
		expect(ids).toEqual(['r-saagar']);
	});

	it("keeps a collaborator's earlier names from this task (so their tags stay)", async () => {
		const ids = await editorRowIds(
			fakeDb(
				tables([
					{
						owner_user_id: 'bob',
						record_kind: 'task',
						record_id: 't1',
						entity: { name: 'krystal  ball' }
					},
					{
						owner_user_id: 'alice',
						record_kind: 'task',
						record_id: 't1',
						entity: { name: 'Kyle Kulinski' }
					}
				])
			),
			{ userId: 'bob', task: { id: 't1' }, newRowIds: [] },
			rows
		);
		expect(ids).toEqual(['r-krystal']);
	});
});
