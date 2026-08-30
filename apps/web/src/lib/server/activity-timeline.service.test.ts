// apps/web/src/lib/server/activity-timeline.service.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$lib/services/ontology/ontology-projects.service', () => ({
	ensureActorId: vi.fn(async () => 'actor-1'),
	fetchProjectSummaries: vi.fn(async () => [
		{ id: 'project-1', name: 'BuildOS' },
		{ id: 'project-2', name: 'Job Search' }
	])
}));

vi.mock('$lib/server/project-logs-enrich', () => ({
	enrichLogsForDisplay: vi.fn(async (_supabase: unknown, logs: any[]) =>
		logs.map((log) => ({
			...log,
			entity_name: `${log.entity_type} ${log.entity_id}`,
			changed_by_name: null,
			external_agent_caller_name: null,
			actor_display_name: null,
			actor_type: 'user'
		}))
	)
}));

import { loadActivityTimeline } from './activity-timeline.service';

/** Rows each `from(table)` call resolves to, keyed by table name. */
type TableRows = Record<string, any[]>;

/**
 * Minimal chainable stand-in for the Supabase query builder. Every filter method
 * returns `this` and the object is awaited at the end of the chain, so the service
 * can use whatever combination of filters it likes without the mock caring.
 */
function makeSupabase(rows: TableRows, onQuery?: (table: string, filters: any) => void) {
	return {
		from(table: string) {
			const filters: Record<string, any> = {};
			const builder: any = {
				select: () => builder,
				eq: (col: string, val: unknown) => {
					filters[`eq:${col}`] = val;
					return builder;
				},
				in: (col: string, val: unknown) => {
					filters[`in:${col}`] = val;
					return builder;
				},
				is: () => builder,
				gt: () => builder,
				neq: () => builder,
				or: () => builder,
				lte: (col: string, val: unknown) => {
					filters[`lte:${col}`] = val;
					return builder;
				},
				order: () => builder,
				limit: (val: number) => {
					filters.limit = val;
					return builder;
				},
				then(resolve: (value: { data: any[]; error: null }) => unknown) {
					onQuery?.(table, filters);
					return Promise.resolve({ data: rows[table] ?? [], error: null }).then(resolve);
				}
			};
			return builder;
		}
	} as any;
}

function logRow(id: string, overrides: Partial<Record<string, any>> = {}) {
	return {
		id,
		project_id: 'project-1',
		entity_type: 'task',
		entity_id: `task-${id}`,
		action: 'updated',
		before_data: null,
		after_data: null,
		changed_by: 'user-1',
		changed_by_actor_id: 'actor-1',
		external_agent_caller_id: null,
		agent_call_session_id: null,
		change_source: 'api',
		created_at: '2026-07-24T10:00:00.000Z',
		...overrides
	};
}

const BASE_ARGS = { userId: 'user-1' } as const;

describe('loadActivityTimeline', () => {
	beforeEach(() => vi.clearAllMocks());

	it('returns an empty, terminal page when nothing has happened', async () => {
		const page = await loadActivityTimeline({ supabase: makeSupabase({}), ...BASE_ARGS });

		expect(page.entries).toEqual([]);
		expect(page.hasMore).toBe(false);
		expect(page.nextCursor).toBeNull();
		expect(page.degraded).toEqual([]);
	});

	it('merges sources into one reverse-chronological feed', async () => {
		const supabase = makeSupabase({
			onto_project_logs: [logRow('log-1', { created_at: '2026-07-24T09:00:00.000Z' })],
			project_audits: [
				{
					id: 'audit-1',
					project_id: 'project-1',
					status: 'ready',
					trigger_reason: 'scheduled',
					audit_depth: 'standard',
					delivery_confidence: 'yellow',
					summary: 'Docs are drifting.',
					top_findings: [],
					generated_suggestion_count: 3,
					unresolved_suggestion_count: 3,
					error_message: null,
					created_at: '2026-07-24T11:00:00.000Z',
					finished_at: '2026-07-24T11:00:00.000Z'
				}
			],
			chat_sessions: [
				{
					id: 'chat-1',
					title: 'Planning',
					auto_title: null,
					summary: null,
					context_type: 'project',
					entity_id: 'project-1',
					message_count: 4,
					tool_call_count: 2,
					status: 'active',
					created_at: '2026-07-24T10:00:00.000Z',
					last_message_at: '2026-07-24T10:05:00.000Z'
				}
			]
		});

		const page = await loadActivityTimeline({ supabase, ...BASE_ARGS });

		expect(page.entries.map((entry) => entry.kind)).toEqual([
			'project_audit',
			'chat_session',
			'entity_changes'
		]);
		expect(page.entries[0]!.lane).toBe('agent');
		expect(page.entries[0]!.project_name).toBe('BuildOS');
	});

	it('routes entity changes to a lane and actor based on change_source', async () => {
		const supabase = makeSupabase({
			onto_project_logs: [
				logRow('log-agent', {
					change_source: 'agent_call',
					created_at: '2026-07-24T12:00:00.000Z'
				}),
				logRow('log-chat', {
					change_source: 'chat',
					entity_id: 'task-chat',
					created_at: '2026-07-24T08:00:00.000Z'
				}),
				logRow('log-you', {
					change_source: 'api',
					entity_id: 'task-you',
					created_at: '2026-07-24T04:00:00.000Z'
				})
			]
		});

		const page = await loadActivityTimeline({ supabase, ...BASE_ARGS });

		expect(page.entries.map((entry) => [entry.lane, entry.actor, entry.actor_label])).toEqual([
			['agent', 'external_agent', 'Connected agent'],
			['you', 'chat', 'BuildOS chat'],
			['you', 'you', 'You']
		]);
	});

	it('groups an actor’s consecutive edits in one project into a single entry', async () => {
		const supabase = makeSupabase({
			onto_project_logs: [
				logRow('log-1', { entity_id: 'task-a', created_at: '2026-07-24T10:20:00.000Z' }),
				logRow('log-2', { entity_id: 'task-b', created_at: '2026-07-24T10:10:00.000Z' }),
				logRow('log-3', {
					entity_type: 'document',
					entity_id: 'doc-a',
					created_at: '2026-07-24T10:00:00.000Z'
				})
			]
		});

		const page = await loadActivityTimeline({ supabase, ...BASE_ARGS });

		expect(page.entries).toHaveLength(1);
		expect(page.entries[0]!.title).toBe('Updated 2 tasks and 1 document in BuildOS');
		expect(page.entries[0]!.count).toBe(3);
		expect(page.entries[0]!.children).toHaveLength(3);
	});

	it('starts a new group when the edits cross the grouping window', async () => {
		const supabase = makeSupabase({
			onto_project_logs: [
				logRow('log-1', { entity_id: 'task-a', created_at: '2026-07-24T10:00:00.000Z' }),
				// Two hours earlier: a separate working session, not the same burst.
				logRow('log-2', { entity_id: 'task-b', created_at: '2026-07-24T08:00:00.000Z' })
			]
		});

		const page = await loadActivityTimeline({ supabase, ...BASE_ARGS });

		expect(page.entries).toHaveLength(2);
		expect(page.entries.every((entry) => entry.kind === 'entity_changes')).toBe(true);
	});

	it('collapses a nightly review sweep into one entry per trigger', async () => {
		const loopRun = (id: string, projectId: string) => ({
			id,
			project_id: projectId,
			status: 'completed',
			trigger_reason: 'end_of_day',
			summary: null,
			suggestion_count: 2,
			error_message: null,
			created_at: '2026-07-24T04:00:00.000Z',
			finished_at: '2026-07-24T04:01:00.000Z'
		});

		const supabase = makeSupabase({
			project_loop_runs: [loopRun('run-1', 'project-1'), loopRun('run-2', 'project-2')]
		});

		const page = await loadActivityTimeline({ supabase, ...BASE_ARGS });

		expect(page.entries).toHaveLength(1);
		expect(page.entries[0]!.title).toBe('Reviewed 2 projects');
		expect(page.entries[0]!.count).toBe(2);
		expect(page.entries[0]!.stats).toContainEqual({ label: 'Suggestions', value: 4 });
	});

	describe('failure handling', () => {
		function failedLoopRun(errorMessage: string) {
			return {
				id: `run-${errorMessage.slice(0, 8)}`,
				project_id: 'project-1',
				status: 'failed',
				trigger_reason: 'end_of_day',
				summary: null,
				suggestion_count: 0,
				error_message: errorMessage,
				created_at: '2026-07-24T04:00:00.000Z',
				finished_at: '2026-07-24T04:00:00.000Z'
			};
		}

		it.each([
			['feature_disabled', 'the feature was switched off'],
			[
				'Deduplicated onto active project loop job buildos_project_loop_abc for run def',
				'the run collapsed into an active one'
			],
			['Deduplicated onto active complete audit job buildos_project_loop_abc', 'audit dedupe']
		])('drops a run that failed because %s', async (errorMessage) => {
			const supabase = makeSupabase({ project_loop_runs: [failedLoopRun(errorMessage)] });

			const page = await loadActivityTimeline({ supabase, ...BASE_ARGS });

			expect(page.entries).toEqual([]);
		});

		it('keeps a genuine failure', async () => {
			const supabase = makeSupabase({
				project_loop_runs: [
					failedLoopRun(
						'Failed to generate valid JSON: The operation was aborted due to timeout'
					)
				]
			});

			const page = await loadActivityTimeline({ supabase, ...BASE_ARGS });

			expect(page.entries).toHaveLength(1);
			expect(page.entries[0]!.status).toBe('error');
			expect(page.entries[0]!.body).toBe(
				'Failed to generate valid JSON: The operation was aborted due to timeout'
			);
		});

		it.each([
			'insert or update on table "queue_jobs" violates foreign key constraint "brief_generation_jobs_user_id_fkey"',
			'relation "onto_tasks" does not exist',
			'stuck on run c443f5c1-2be9-4527-97b4-b105ae7a99f9',
			'boom at src/worker.ts:42:11'
		])('replaces operator-facing error text with plain language: %s', async (errorMessage) => {
			const supabase = makeSupabase({ project_loop_runs: [failedLoopRun(errorMessage)] });

			const page = await loadActivityTimeline({ supabase, ...BASE_ARGS });

			expect(page.entries).toHaveLength(1);
			expect(page.entries[0]!.body).toBe(
				'The review pass could not finish. It will retry on the next pass.'
			);
			expect(page.entries[0]!.body).not.toContain(errorMessage);
		});

		it('still counts dropped runs toward saturation so pagination stays correct', async () => {
			const supabase = makeSupabase({
				project_loop_runs: Array.from({ length: 40 }, (_, index) => ({
					...failedLoopRun('feature_disabled'),
					id: `run-${index}`,
					created_at: new Date(Date.UTC(2026, 6, 24) - index * 3_600_000).toISOString()
				}))
			});

			const page = await loadActivityTimeline({ supabase, ...BASE_ARGS });

			// Every row was filtered out, but older activity may still exist behind them.
			expect(page.entries).toEqual([]);
			expect(page.hasMore).toBe(true);
		});
	});

	describe('deep links', () => {
		const briefDelivery = (eventPayload: Record<string, unknown>) => ({
			id: 'd-1',
			channel: 'email',
			status: 'sent',
			created_at: '2026-07-24T15:00:00.000Z',
			payload: { title: 'Daily brief ready' },
			event_id: 'event-1',
			notification_events: {
				id: 'event-1',
				event_type: 'brief.completed',
				event_source: 'worker_job',
				payload: eventPayload,
				created_at: '2026-07-24T15:00:00.000Z'
			}
		});

		it('points a brief ping at the brief rather than a project', async () => {
			const supabase = makeSupabase({
				notification_deliveries: [
					briefDelivery({ brief_date: '2026-07-24', project_id: 'project-1' })
				]
			});

			const page = await loadActivityTimeline({ supabase, ...BASE_ARGS });

			expect(page.entries[0]!.href).toBe('/briefs?date=2026-07-24');
		});

		it('reads a brief date nested under `data`', async () => {
			const supabase = makeSupabase({
				notification_deliveries: [briefDelivery({ data: { brief_date: '2026-07-20' } })]
			});

			const page = await loadActivityTimeline({ supabase, ...BASE_ARGS });

			expect(page.entries[0]!.href).toBe('/briefs?date=2026-07-20');
		});

		it('falls back to the briefs list when the ping carries no date', async () => {
			const supabase = makeSupabase({ notification_deliveries: [briefDelivery({})] });

			const page = await loadActivityTimeline({ supabase, ...BASE_ARGS });

			expect(page.entries[0]!.href).toBe('/briefs');
		});

		it('opens a chat transcript instead of only its project', async () => {
			const supabase = makeSupabase({
				chat_sessions: [
					{
						id: 'chat-1',
						title: 'Planning',
						auto_title: null,
						summary: null,
						context_type: 'project',
						entity_id: 'project-1',
						message_count: 4,
						tool_call_count: 0,
						status: 'active',
						created_at: '2026-07-24T10:00:00.000Z',
						last_message_at: '2026-07-24T10:05:00.000Z'
					}
				]
			});

			const page = await loadActivityTimeline({ supabase, ...BASE_ARGS });

			expect(page.entries[0]!.href).toBe('/history?id=chat-1&itemType=chat_session');
			// The project is still carried so the card can link it separately.
			expect(page.entries[0]!.project_id).toBe('project-1');
		});

		it('opens the specific brain dump rather than the history list', async () => {
			const supabase = makeSupabase({
				onto_braindumps: [
					{
						id: 'bd-1',
						title: 'Morning dump',
						summary: 'Notes',
						topics: [],
						status: 'processed',
						error_message: null,
						created_at: '2026-07-24T09:00:00.000Z',
						processed_at: '2026-07-24T09:01:00.000Z'
					}
				]
			});

			const page = await loadActivityTimeline({ supabase, ...BASE_ARGS });

			expect(page.entries[0]!.href).toBe('/history?id=bd-1&itemType=braindump');
		});

		it('sends a failed brief to that day rather than the list', async () => {
			const supabase = makeSupabase({
				ontology_daily_briefs: [
					{
						id: 'brief-1',
						brief_date: '2026-07-22',
						generation_status: 'failed',
						generation_error: 'timeout',
						audio_status: null,
						audio_error: null,
						created_at: '2026-07-22T08:00:00.000Z'
					}
				]
			});

			const page = await loadActivityTimeline({ supabase, ...BASE_ARGS });

			expect(page.entries[0]!.href).toBe('/briefs?date=2026-07-22');
		});
	});

	it('collapses multi-channel deliveries of one event into a single ping', async () => {
		const delivery = (id: string, channel: string) => ({
			id,
			channel,
			status: 'sent',
			created_at: '2026-07-24T15:00:00.000Z',
			payload: { title: 'Daily brief ready' },
			event_id: 'event-1',
			notification_events: {
				id: 'event-1',
				event_type: 'brief.completed',
				event_source: 'worker_job',
				payload: { project_count: 3 },
				created_at: '2026-07-24T15:00:00.000Z'
			}
		});

		const supabase = makeSupabase({
			notification_deliveries: [
				delivery('d-1', 'email'),
				delivery('d-2', 'sms'),
				delivery('d-3', 'in_app')
			]
		});

		const page = await loadActivityTimeline({ supabase, ...BASE_ARGS });

		expect(page.entries).toHaveLength(1);
		expect(page.entries[0]!.lane).toBe('ping');
		expect(page.entries[0]!.count).toBe(3);
		expect(page.entries[0]!.stats[0]!).toEqual({
			label: 'Sent via',
			value: 'email, in-app, sms'
		});
	});

	it('marks a source degraded without losing the rest of the page', async () => {
		const supabase = {
			from(table: string) {
				const builder: any = new Proxy(
					{
						then(resolve: (value: any) => unknown) {
							if (table === 'project_audits') {
								return Promise.resolve({
									data: null,
									error: { message: 'boom' }
								}).then(resolve);
							}
							if (table === 'chat_sessions') {
								return Promise.resolve({
									data: [
										{
											id: 'chat-1',
											title: 'Still here',
											auto_title: null,
											summary: null,
											context_type: 'global',
											entity_id: null,
											message_count: 2,
											tool_call_count: 0,
											status: 'active',
											created_at: '2026-07-24T10:00:00.000Z',
											last_message_at: null
										}
									],
									error: null
								}).then(resolve);
							}
							return Promise.resolve({ data: [], error: null }).then(resolve);
						}
					},
					{
						get(target: any, prop: string) {
							if (prop in target) return target[prop];
							return () => builder;
						}
					}
				);
				return builder;
			}
		} as any;

		const page = await loadActivityTimeline({ supabase, ...BASE_ARGS });

		expect(page.degraded).toContain('audits');
		expect(page.entries.map((entry) => entry.title)).toEqual(['Still here']);
	});

	describe('pagination', () => {
		/** More rows than the source limit, so the source reports as saturated. */
		function manyLogs(count: number) {
			return Array.from({ length: count }, (_, index) =>
				logRow(`log-${index}`, {
					entity_id: `task-${index}`,
					// One hour apart so every log lands in its own group.
					created_at: new Date(Date.UTC(2026, 6, 24, 0) - index * 3_600_000).toISOString()
				})
			);
		}

		it('caps the page at the requested limit and returns a usable cursor', async () => {
			const supabase = makeSupabase({ onto_project_logs: manyLogs(60) });

			const page = await loadActivityTimeline({ supabase, ...BASE_ARGS, limit: 10 });

			expect(page.entries).toHaveLength(10);
			expect(page.hasMore).toBe(true);
			expect(page.nextCursor).toBe(page.entries[9]!.occurred_at);
		});

		it('passes the cursor to every source as an inclusive upper bound', async () => {
			const seen: { table: string; filters: any }[] = [];
			const supabase = makeSupabase({}, (table, filters) => seen.push({ table, filters }));

			await loadActivityTimeline({
				supabase,
				...BASE_ARGS,
				before: '2026-07-20T00:00:00.000Z'
			});

			const cursored = seen.filter((q) => q.filters['lte:created_at']);
			expect(cursored.length).toBeGreaterThan(0);
			for (const query of cursored) {
				expect(query.filters['lte:created_at']).toBe('2026-07-20T00:00:00.000Z');
			}
		});

		it('ignores a malformed cursor rather than filtering on garbage', async () => {
			const seen: { table: string; filters: any }[] = [];
			const supabase = makeSupabase({}, (table, filters) => seen.push({ table, filters }));

			await loadActivityTimeline({ supabase, ...BASE_ARGS, before: 'not-a-date' });

			expect(seen.every((query) => !query.filters['lte:created_at'])).toBe(true);
		});

		it('walks the whole feed without dropping or stalling', async () => {
			const supabase = makeSupabase({ onto_project_logs: manyLogs(25) });

			const seen = new Set<string>();
			let cursor: string | null = null;
			let pages = 0;

			while (pages < 20) {
				const page = await loadActivityTimeline({
					supabase,
					...BASE_ARGS,
					before: cursor,
					limit: 10
				});
				pages++;
				for (const entry of page.entries) seen.add(entry.id);
				if (!page.hasMore || !page.nextCursor || page.nextCursor === cursor) break;
				cursor = page.nextCursor;
			}

			// The mock returns the same 25 rows regardless of cursor, so the walk must
			// terminate on its own rather than paging forever.
			expect(pages).toBeLessThan(20);
			expect(seen.size).toBeGreaterThan(0);
		});
	});

	describe('lane filter', () => {
		it('only queries and returns the requested lane', async () => {
			const tables: string[] = [];
			const supabase = makeSupabase(
				{
					notification_deliveries: [
						{
							id: 'd-1',
							channel: 'email',
							status: 'sent',
							created_at: '2026-07-24T15:00:00.000Z',
							payload: { title: 'Daily brief ready' },
							event_id: 'event-1',
							notification_events: {
								id: 'event-1',
								event_type: 'brief.completed',
								event_source: 'worker_job',
								payload: {},
								created_at: '2026-07-24T15:00:00.000Z'
							}
						}
					],
					onto_project_logs: [logRow('log-1')]
				},
				(table) => tables.push(table)
			);

			const page = await loadActivityTimeline({ supabase, ...BASE_ARGS, lanes: ['ping'] });

			expect(page.entries.every((entry) => entry.lane === 'ping')).toBe(true);
			expect(tables).toContain('notification_deliveries');
			expect(tables).not.toContain('onto_project_logs');
		});

		it('keeps paging when a filter empties a page but older matches remain', async () => {
			// Project logs saturate (agent lane fetches them) but every row maps to the
			// `you` lane, so the ping-filtered page is empty while more data exists.
			const supabase = makeSupabase({
				onto_project_logs: Array.from({ length: 200 }, (_, index) =>
					logRow(`log-${index}`, {
						entity_id: `task-${index}`,
						created_at: new Date(
							Date.UTC(2026, 6, 24, 0) - index * 3_600_000
						).toISOString()
					})
				)
			});

			const page = await loadActivityTimeline({ supabase, ...BASE_ARGS, lanes: ['agent'] });

			expect(page.entries).toHaveLength(0);
			expect(page.hasMore).toBe(true);
			expect(page.nextCursor).not.toBeNull();
		});
	});
});
