// apps/web/src/lib/server/task-entities/task-knowledge-ids.test.ts
// Which knowledge entry a name on a task opens (tasker 160): the wrong match would open a
// stranger's card, a missed one falls back to the task-only card.
import { describe, expect, it } from 'vitest';
import type { TaskEntityRecord } from '@buildos/shared-agent-ops/task-entities';
import { loadTaskKnowledgeIds, type TaskKnowledgeLink } from './task-entity-store';

type Row = Record<string, unknown>;

/** A query builder over in-memory rows: select / eq / in, awaited for { data }. */
function fakeClient(tables: Record<string, Row[]>) {
	const calls: string[] = [];
	return {
		calls,
		from(table: string) {
			calls.push(table);
			let rows = [...(tables[table] ?? [])];
			const query = {
				select: () => query,
				eq: (column: string, value: string) => {
					rows = rows.filter((row) => row[column] === value);
					return query;
				},
				in: (column: string, values: string[]) => {
					rows = rows.filter((row) => values.includes(row[column] as string));
					return query;
				},
				then: (resolve: (value: { data: Row[]; error: null }) => unknown) =>
					resolve({ data: rows, error: null })
			};
			return query;
		}
	};
}

const TASK = '11111111-1111-4111-8111-111111111111';
const OTHER_TASK = '22222222-2222-4222-8222-222222222222';
const ME = 'user-me';

function row(id: string, kind: string, display: string, extra: Partial<Row> = {}) {
	return {
		id,
		task_id: TASK,
		kind,
		display,
		value: display,
		natural_key: display.toLowerCase(),
		quote: display,
		status: 'suggested',
		...extra
	} as unknown as TaskEntityRecord;
}

function link(
	entity: { id: string; kind: string; name: string; status?: string; merged_into_id?: string },
	extra: Partial<TaskKnowledgeLink> = {}
): TaskKnowledgeLink {
	return {
		record_id: TASK,
		quote: entity.name,
		entity: { status: 'active', merged_into_id: null, ...entity },
		...extra
	} as TaskKnowledgeLink;
}

describe('loadTaskKnowledgeIds', () => {
	it('maps each person and org on the task to its linked entry, never one from another task', async () => {
		const client = fakeClient({});
		const result = await loadTaskKnowledgeIds(
			client,
			ME,
			[
				row('t-kyle', 'person', 'Kyle Kulinski'),
				row('t-show', 'org', 'Secular Talk / Krystal Kyle & Friends'),
				row('t-phone', 'phone', '+14105550100')
			],
			[
				link({ id: 'k-kyle', kind: 'person', name: 'Kyle  Kulinski' }, { quote: null }),
				link({ id: 'k-show', kind: 'org', name: 'Secular Talk / Krystal Kyle & Friends' }),
				link(
					{ id: 'k-other-kyle', kind: 'person', name: 'Kyle Kulinski' },
					{ record_id: OTHER_TASK }
				)
			]
		);
		expect(result).toEqual({ 't-kyle': 'k-kyle', 't-show': 'k-show' });
		expect(client.calls).toEqual([]); // everything matched from the links: no extra query
	});

	it('still opens the entry after it was merged into another name or renamed (quote match)', async () => {
		// Merging "Kyle" into "Kyle Kulinski" repoints the task's link to the kept entry.
		const result = await loadTaskKnowledgeIds(
			fakeClient({}),
			ME,
			[row('t-kyle', 'person', 'Kyle', { quote: 'Kyle' })],
			[link({ id: 'k-kept', kind: 'person', name: 'Kyle Kulinski' }, { quote: 'Kyle' })]
		);
		expect(result).toEqual({ 't-kyle': 'k-kept' });
	});

	it('follows a merged entry, never matches a hidden one, skips dismissed rows', async () => {
		const client = fakeClient({});
		const result = await loadTaskKnowledgeIds(
			client,
			ME,
			[
				row('t-cadre', 'org', 'The Cadre'),
				row('t-claude', 'person', 'Claude'),
				row('t-gone', 'person', 'Jev', { status: 'dismissed' })
			],
			[
				link({
					id: 'k-old',
					kind: 'org',
					name: 'The Cadre',
					status: 'merged',
					merged_into_id: 'k-kept'
				}),
				link({ id: 'k-hidden', kind: 'person', name: 'Claude', status: 'hidden' })
			]
		);
		expect(result).toEqual({ 't-cadre': 'k-kept' });
	});

	it('falls back to your own entry with exactly that name, but not when two share it', async () => {
		const client = fakeClient({
			knowledge_entities: [
				{
					id: 'k-rosette',
					kind: 'person',
					normalized_name: 'rosette sewali',
					owner_user_id: ME,
					status: 'active'
				},
				// Two people called Chris: ambiguous, so no card rather than the wrong one.
				{
					id: 'k-chris-1',
					kind: 'person',
					normalized_name: 'chris',
					owner_user_id: ME,
					status: 'active'
				},
				{
					id: 'k-chris-2',
					kind: 'person',
					normalized_name: 'chris',
					owner_user_id: ME,
					status: 'active'
				},
				// Someone else's entry with the same name is never read.
				{
					id: 'k-theirs',
					kind: 'org',
					normalized_name: 'the real news network',
					owner_user_id: 'someone-else',
					status: 'active'
				}
			]
		});
		const result = await loadTaskKnowledgeIds(
			client,
			ME,
			[
				row('t-rosette', 'person', 'Rosette Sewali'),
				row('t-chris', 'person', 'Chris'),
				row('t-trnn', 'org', 'The Real News Network')
			],
			[] // e.g. a collaborator's task, or one the worker never linked
		);
		expect(result).toEqual({ 't-rosette': 'k-rosette' });
		expect(client.calls).toEqual(['knowledge_entities']);
	});
});
