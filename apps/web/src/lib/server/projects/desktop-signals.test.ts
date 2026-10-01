// apps/web/src/lib/server/projects/desktop-signals.test.ts
import { describe, expect, it, vi } from 'vitest';
import { loadProjectSignals } from './desktop-signals';

const NOW = Date.parse('2026-10-01T12:00:00Z');
const DAY = 86_400_000;
const at = (days: number) => new Date(NOW + days * DAY).toISOString();

type Call = { table: string; method: string; args: unknown[] };

/** A PostgREST-shaped builder: every filter chains, `range` resolves the next page. */
function fakeClient(pages: Record<string, unknown[][]>) {
	const calls: Call[] = [];
	const served: Record<string, number> = {};
	const client = {
		from(table: string) {
			const builder: Record<string, unknown> = {};
			for (const method of ['select', 'in', 'is', 'or', 'gte', 'order']) {
				builder[method] = vi.fn((...args: unknown[]) => {
					calls.push({ table, method, args });
					return builder;
				});
			}
			builder.range = vi.fn(async (...args: unknown[]) => {
				calls.push({ table, method: 'range', args });
				const page = served[table] ?? 0;
				served[table] = page + 1;
				return { data: pages[table]?.[page] ?? [], error: null };
			});
			return builder;
		}
	};
	return { client: client as never, calls, served };
}

describe('loadProjectSignals', () => {
	it('counts open tasks by bucket, recent finishes and the last recorded change', async () => {
		const { client, calls } = fakeClient({
			onto_tasks: [
				[
					{
						project_id: 'a',
						state_key: 'todo',
						start_at: null,
						due_at: at(-2),
						completed_at: null
					},
					{
						project_id: 'a',
						state_key: 'in_progress',
						start_at: null,
						due_at: null,
						completed_at: null
					},
					{
						project_id: 'a',
						state_key: 'todo',
						start_at: null,
						due_at: at(3),
						completed_at: null
					},
					{
						project_id: 'a',
						state_key: 'blocked',
						start_at: null,
						due_at: null,
						completed_at: null
					},
					{
						project_id: 'b',
						state_key: 'done',
						start_at: null,
						due_at: null,
						completed_at: at(-1)
					}
				]
			],
			onto_project_logs: [
				[
					{ project_id: 'b', created_at: at(-1) },
					{ project_id: 'a', created_at: at(-5) },
					{ project_id: 'a', created_at: at(-9) }
				]
			]
		});

		const signals = await loadProjectSignals(client, ['a', 'b', 'c'], NOW);

		expect(signals.get('a')).toEqual({
			last_touch_at: at(-5),
			done_recent: 0,
			overdue: 1,
			in_progress: 1,
			scheduled: 1,
			backlog: 1
		});
		expect(signals.get('b')).toMatchObject({ last_touch_at: at(-1), done_recent: 1 });
		expect(signals.get('c')).toMatchObject({ last_touch_at: null, backlog: 0 });

		// Only open tasks and the last two weeks' finishes; only the last 60 days of log.
		expect(calls).toContainEqual({
			table: 'onto_tasks',
			method: 'or',
			args: [`state_key.neq.done,completed_at.gte."${at(-14)}"`]
		});
		expect(calls).toContainEqual({
			table: 'onto_project_logs',
			method: 'gte',
			args: ['created_at', at(-60)]
		});
		expect(calls).toContainEqual({
			table: 'onto_project_logs',
			method: 'order',
			args: ['created_at', { ascending: false }]
		});
	});

	it('stops reading the log once every project has its latest change', async () => {
		const full = Array.from({ length: 1000 }, (_, i) => ({
			project_id: i % 2 ? 'a' : 'b',
			created_at: at(-1)
		}));
		const { client, served } = fakeClient({
			onto_tasks: [[]],
			onto_project_logs: [full, full]
		});

		await loadProjectSignals(client, ['a', 'b'], NOW);

		expect(served.onto_project_logs).toBe(1);
	});

	it('reads nothing for an empty list', async () => {
		const { client, calls } = fakeClient({});
		expect((await loadProjectSignals(client, [], NOW)).size).toBe(0);
		expect(calls).toEqual([]);
	});
});
