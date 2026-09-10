// apps/web/src/lib/services/agentic-chat-v2/context-loader.test.ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Constants } from '@buildos/shared-types';
import { START_HERE_CONTEXT_LOAD_MAX_CHARS } from '@buildos/shared-agent-ops/ontology/start-here';
import { loadFastChatPromptContext } from './context-loader';
import { compactPreparedPromptContextPayload } from './prepared-prompt-cache';
import { buildLitePromptEnvelope } from '$lib/services/agentic-chat-lite/prompt';
import { FOCUSED_DOCUMENT_CONTENT_MAX_CHARS } from './focused-document-context';

type QueryResult = {
	data: any;
	error: any;
	count?: number | null;
};

type QueryCallRecord = {
	table: string;
	selectColumns: string | null;
	selectOptions: Record<string, unknown> | null;
	eqCalls: Array<[string, unknown]>;
	inCalls: Array<[string, unknown[]]>;
	isCalls: Array<[string, unknown]>;
	orCalls: string[];
	orderCalls: Array<[string, Record<string, unknown> | undefined]>;
	limitCalls: number[];
};

const MOCK_USER_TIMEZONE = 'America/New_York';

/**
 * `loadFastChatPromptContext` reads `users.timezone` alongside every context
 * load (select('timezone').eq('id', userId).maybeSingle()). Mock factories
 * below serve it so the lookup resolves instead of tripping their
 * unexpected-table guards.
 */
function createUsersTimezoneQuery(result: QueryResult) {
	const maybeSingle = vi.fn().mockResolvedValue(result);
	const eq = vi.fn().mockReturnValue({ maybeSingle });
	const select = vi.fn().mockReturnValue({ eq });
	return { select };
}

function usersTimezoneRow(timezone: string | null): QueryResult {
	return { data: { timezone }, error: null };
}

function createDailyBriefSupabaseMock(config: {
	dailyBrief: QueryResult;
	projectBriefs: QueryResult;
	entities: QueryResult;
}) {
	const from = vi.fn().mockImplementation((table: string) => {
		if (table === 'users') {
			return createUsersTimezoneQuery(usersTimezoneRow(MOCK_USER_TIMEZONE));
		}

		if (table === 'ontology_daily_briefs') {
			const maybeSingle = vi.fn().mockResolvedValue(config.dailyBrief);
			const eqUser = vi.fn().mockReturnValue({ maybeSingle });
			const eqId = vi.fn().mockReturnValue({ eq: eqUser });
			const select = vi.fn().mockReturnValue({ eq: eqId });
			return { select };
		}

		if (table === 'ontology_project_briefs') {
			const order = vi.fn().mockResolvedValue(config.projectBriefs);
			const eq = vi.fn().mockReturnValue({ order });
			const select = vi.fn().mockReturnValue({ eq });
			return { select };
		}

		if (table === 'ontology_brief_entities') {
			const order = vi.fn().mockResolvedValue(config.entities);
			const eq = vi.fn().mockReturnValue({ order });
			const select = vi.fn().mockReturnValue({ eq });
			return { select };
		}

		throw new Error(`Unexpected table in mock: ${table}`);
	});

	return { from } as any;
}

function createProjectRpcSupabaseMock(
	payload: Record<string, unknown>,
	options: { startHere?: QueryResult } = {}
) {
	const rpc = vi.fn().mockResolvedValue({ data: payload, error: null });
	const from = vi.fn().mockImplementation((table: string) => {
		if (table === 'users') {
			return createUsersTimezoneQuery(usersTimezoneRow(MOCK_USER_TIMEZONE));
		}
		if (table === 'onto_documents') {
			const startHereResult = options.startHere ?? { data: [], error: null };
			const normalizedStartHereResult =
				startHereResult.data && !Array.isArray(startHereResult.data)
					? { ...startHereResult, data: [startHereResult.data] }
					: startHereResult;
			const rows = (normalizedStartHereResult.data ?? []) as Array<Record<string, any>>;
			const select = vi.fn().mockImplementation((columns: string) => {
				if (!columns.includes('content')) {
					const limit = vi.fn().mockResolvedValue({
						...normalizedStartHereResult,
						data: rows.map(({ content: _content, ...row }) => row)
					});
					const order = vi.fn().mockReturnValue({ limit });
					const isArchived = vi.fn().mockReturnValue({ order });
					const isDeleted = vi.fn().mockReturnValue({ is: isArchived });
					const eqType = vi.fn().mockReturnValue({ is: isDeleted });
					const eqProject = vi.fn().mockReturnValue({ eq: eqType });
					return { eq: eqProject };
				}

				let selectedId: string | null = null;
				const maybeSingle = vi.fn().mockImplementation(async () => ({
					data: rows.find((row) => row.id === selectedId) ?? rows[0] ?? null,
					error: normalizedStartHereResult.error
				}));
				const isArchived = vi.fn().mockReturnValue({ maybeSingle });
				const isDeleted = vi.fn().mockReturnValue({ is: isArchived });
				const eqType = vi.fn().mockReturnValue({ is: isDeleted });
				const eqProject = vi.fn().mockReturnValue({ eq: eqType });
				const eqId = vi.fn().mockImplementation((column: string, value: string) => {
					if (column === 'id') selectedId = value;
					return { eq: eqProject };
				});
				return { eq: eqId };
			});
			return { select };
		}
		throw new Error(`Unexpected fallback query path for project RPC mock: ${table}`);
	});
	return { rpc, from } as any;
}

/**
 * Postgres rejects the whole query with 22P02 when a `task_state` filter names
 * a value the enum does not have, and the rollup then degrades to null on
 * every global turn (AGENTIC_CHAT_HARNESS_AUDIT_2026-09-08 F115 regression).
 * A hand-rolled mock cannot catch that on its own, so every state_key filter
 * these tests send is checked against the generated enum.
 */
function assertTaskStateFilterIsEnumSafe(column: string, value: unknown): void {
	if (column !== 'state_key') return;
	const candidates =
		typeof value === 'string'
			? (value.match(/"([^"]+)"/g) ?? []).map((quoted) => quoted.slice(1, -1))
			: Array.isArray(value)
				? value
				: [];
	const enumValues: readonly string[] = Constants.public.Enums.task_state;
	for (const candidate of candidates) {
		if (typeof candidate === 'string' && enumValues.includes(candidate)) continue;
		throw new Error(
			`state_key filter sent ${JSON.stringify(candidate)}, which is not a task_state enum value (${enumValues.join(', ')}). Postgres would reject this query with 22P02.`
		);
	}
}

type TaskRollupQueryRecord = {
	inCalls: Array<[string, unknown[]]>;
	isCalls: Array<[string, unknown]>;
	notCalls: Array<[string, string, unknown]>;
};

function createTaskRollupQuery(result: QueryResult, record?: TaskRollupQueryRecord) {
	// select(...).in(...).is(...).is(...).is(...).in(...).order(...).limit(...)
	// — open tasks only, over every accessible project
	// (AGENTIC_CHAT_HARNESS_AUDIT_2026-09-08 F115).
	const limit = vi.fn().mockResolvedValue(result);
	const order = vi.fn().mockReturnValue({ limit });
	const not = vi.fn().mockImplementation((column: string, operator: string, value: unknown) => {
		assertTaskStateFilterIsEnumSafe(column, value);
		record?.notCalls.push([column, operator, value]);
		return { order };
	});
	const stateIn = vi.fn().mockImplementation((column: string, values: unknown[]) => {
		assertTaskStateFilterIsEnumSafe(column, values);
		record?.inCalls.push([column, values]);
		return { order, not };
	});
	const is = vi.fn().mockImplementation((column: string, value: unknown) => {
		record?.isCalls.push([column, value]);
		return { is, not, in: stateIn };
	});
	const inFn = vi.fn().mockImplementation((column: string, values: unknown[]) => {
		assertTaskStateFilterIsEnumSafe(column, values);
		record?.inCalls.push([column, values]);
		return { is };
	});
	const select = vi.fn().mockReturnValue({ in: inFn });
	return { select };
}

function createGlobalRpcSupabaseMock(
	payload: Record<string, unknown>,
	options: { taskRollupRows?: QueryResult; taskRollupQuery?: TaskRollupQueryRecord } = {}
) {
	const rpc = vi.fn().mockImplementation((fn: string) => {
		if (fn === 'load_fastchat_context') {
			return Promise.resolve({ data: payload, error: null });
		}
		throw new Error(`Unexpected RPC in global RPC mock: ${fn}`);
	});
	const from = vi.fn().mockImplementation((table: string) => {
		if (table === 'users') {
			return createUsersTimezoneQuery(usersTimezoneRow(MOCK_USER_TIMEZONE));
		}
		// The task rollup is the one context-table read the RPC path makes
		// (turn-executor audit 2026-09-02, Finding 13 / F-02).
		if (table === 'onto_tasks') {
			return createTaskRollupQuery(
				options.taskRollupRows ?? { data: [], error: null },
				options.taskRollupQuery
			);
		}
		throw new Error('Unexpected fallback query path for global RPC mock');
	});
	return { rpc, from } as any;
}

function createGlobalFallbackSupabaseMock(config: {
	actorId?: string;
	projectSummaries: Array<Record<string, any>>;
	goals: QueryResult;
	milestones: QueryResult;
	plans: QueryResult;
	tasks?: QueryResult;
	taskRollupRows?: QueryResult;
	taskRollupQuery?: TaskRollupQueryRecord;
	events?: QueryResult;
}) {
	const rpc = vi.fn().mockImplementation((fn: string) => {
		if (fn === 'ensure_actor_for_user') {
			return Promise.resolve({ data: config.actorId ?? 'actor-1', error: null });
		}
		if (fn === 'get_onto_project_summaries_v1') {
			return Promise.resolve({ data: config.projectSummaries, error: null });
		}
		return Promise.resolve({ data: null, error: null });
	});
	const from = vi.fn().mockImplementation((table: string) => {
		if (table === 'users') {
			return createUsersTimezoneQuery(usersTimezoneRow(MOCK_USER_TIMEZONE));
		}
		if (table === 'onto_projects') {
			const is = vi.fn().mockResolvedValue({
				data: config.projectSummaries.map((project) => ({
					id: project.id,
					start_at: project.start_at ?? null,
					end_at: project.end_at ?? null
				})),
				error: null
			});
			const inFn = vi.fn().mockReturnValue({ is });
			const select = vi.fn().mockReturnValue({ in: inFn });
			return { select };
		}

		if (table === 'onto_goals') {
			const limit = vi.fn().mockResolvedValue(config.goals);
			const order = vi.fn().mockReturnValue({ limit });
			const isArchived = vi.fn().mockReturnValue({ order });
			const is = vi.fn().mockReturnValue({ is: isArchived });
			const inFn = vi.fn().mockReturnValue({ is });
			const select = vi.fn().mockReturnValue({ in: inFn });
			return { select };
		}

		if (table === 'onto_milestones') {
			const limit = vi.fn().mockResolvedValue(config.milestones);
			const order = vi.fn().mockReturnValue({ limit });
			const isArchived = vi.fn().mockReturnValue({ order });
			const is = vi.fn().mockReturnValue({ is: isArchived });
			const inFn = vi.fn().mockReturnValue({ is });
			const select = vi.fn().mockReturnValue({ in: inFn });
			return { select };
		}

		if (table === 'onto_plans') {
			const limit = vi.fn().mockResolvedValue(config.plans);
			const order = vi.fn().mockReturnValue({ limit });
			const isArchived = vi.fn().mockReturnValue({ order });
			const is = vi.fn().mockReturnValue({ is: isArchived });
			const inFn = vi.fn().mockReturnValue({ is });
			const select = vi.fn().mockReturnValue({ in: inFn });
			return { select };
		}

		// onto_project_logs is deliberately absent: the global fallback no longer
		// queries it (AGENTIC_CHAT_HARNESS_AUDIT_2026-09-08 F115), so a query
		// here trips the unexpected-table guard below.

		if (table === 'onto_tasks') {
			// `.or(...)` is the dated-signal query; the open-task rollup chains a
			// third `.is()` plus a state filter before `.order()`.
			const signalLimit = vi
				.fn()
				.mockResolvedValue(config.tasks ?? { data: [], error: null });
			const signalOrder = vi.fn().mockReturnValue({ limit: signalLimit });
			const or = vi.fn().mockReturnValue({ order: signalOrder });
			const rollupLimit = vi
				.fn()
				.mockResolvedValue(config.taskRollupRows ?? { data: [], error: null });
			const rollupOrder = vi.fn().mockReturnValue({ limit: rollupLimit });
			const not = vi
				.fn()
				.mockImplementation((column: string, operator: string, value: unknown) => {
					assertTaskStateFilterIsEnumSafe(column, value);
					config.taskRollupQuery?.notCalls.push([column, operator, value]);
					return { order: rollupOrder };
				});
			const rollupIn = vi.fn().mockImplementation((column: string, values: unknown[]) => {
				assertTaskStateFilterIsEnumSafe(column, values);
				config.taskRollupQuery?.inCalls.push([column, values]);
				return { order: rollupOrder, not };
			});
			const isCompleted = vi.fn().mockImplementation((column: string, value: unknown) => {
				config.taskRollupQuery?.isCalls.push([column, value]);
				return { not, in: rollupIn };
			});
			const isArchived = vi.fn().mockReturnValue({ or, is: isCompleted });
			const is = vi.fn().mockReturnValue({ is: isArchived });
			const inFn = vi.fn().mockImplementation((column: string, values: unknown[]) => {
				assertTaskStateFilterIsEnumSafe(column, values);
				config.taskRollupQuery?.inCalls.push([column, values]);
				return { is };
			});
			const select = vi.fn().mockReturnValue({ in: inFn });
			return { select };
		}

		if (table === 'onto_events') {
			const limit = vi.fn().mockResolvedValue(config.events ?? { data: [], error: null });
			const order = vi.fn().mockReturnValue({ limit });
			const lte = vi.fn().mockReturnValue({ order });
			const gte = vi.fn().mockReturnValue({ lte });
			const is = vi.fn().mockReturnValue({ gte });
			const inFn = vi.fn().mockReturnValue({ is });
			const select = vi.fn().mockReturnValue({ in: inFn });
			return { select };
		}

		throw new Error(`Unexpected table in global fallback mock: ${table}`);
	});

	return { rpc, from } as any;
}

function createContextFallbackSupabaseMock(config: {
	rpc?: QueryResult;
	tables: Record<string, any[]>;
}) {
	const calls: QueryCallRecord[] = [];
	const rpc = vi.fn().mockImplementation((fn: string) => {
		if (fn === 'load_fastchat_context') {
			return Promise.resolve(config.rpc ?? { data: null, error: null });
		}
		if (fn === 'ensure_actor_for_user') {
			return Promise.resolve({ data: 'actor-1', error: null });
		}
		if (fn === 'get_onto_project_summaries_v1') {
			return Promise.resolve({ data: config.tables.project_summaries ?? [], error: null });
		}
		return Promise.resolve({ data: null, error: null });
	});

	const applyFilters = (table: string, call: QueryCallRecord) => {
		let rows = [...(config.tables[table] ?? [])];
		for (const [column, value] of call.eqCalls) {
			rows = rows.filter((row) => row[column] === value);
		}
		for (const [column, values] of call.inCalls) {
			rows = rows.filter((row) => values.includes(row[column]));
		}
		for (const [column, value] of call.isCalls) {
			rows = rows.filter((row) => (row[column] ?? null) === value);
		}
		return rows;
	};

	const from = vi.fn().mockImplementation((table: string) => {
		const call: QueryCallRecord = {
			table,
			selectColumns: null,
			selectOptions: null,
			eqCalls: [],
			inCalls: [],
			isCalls: [],
			orCalls: [],
			orderCalls: [],
			limitCalls: []
		};
		calls.push(call);

		const resolveResult = () => {
			const filtered = applyFilters(table, call);
			const count = filtered.length;
			const limit = call.limitCalls.at(-1);
			return {
				data: typeof limit === 'number' ? filtered.slice(0, limit) : filtered,
				error: null,
				count
			};
		};

		const query: Record<string, any> = {
			select: vi.fn((columns: string, options?: Record<string, unknown>) => {
				call.selectColumns = columns;
				call.selectOptions = options ?? null;
				return query;
			}),
			eq: vi.fn((column: string, value: unknown) => {
				call.eqCalls.push([column, value]);
				return query;
			}),
			in: vi.fn((column: string, values: unknown[]) => {
				call.inCalls.push([column, values]);
				return query;
			}),
			is: vi.fn((column: string, value: unknown) => {
				call.isCalls.push([column, value]);
				return query;
			}),
			gte: vi.fn(() => query),
			lte: vi.fn(() => query),
			or: vi.fn((filter: string) => {
				call.orCalls.push(filter);
				return query;
			}),
			order: vi.fn((column: string, options?: Record<string, unknown>) => {
				call.orderCalls.push([column, options]);
				return query;
			}),
			limit: vi.fn((value: number) => {
				call.limitCalls.push(value);
				return query;
			}),
			maybeSingle: vi.fn(async () => {
				const result = resolveResult();
				return {
					data: result.data[0] ?? null,
					error: result.error,
					count: result.count
				};
			}),
			then: (
				onfulfilled?: (value: QueryResult) => unknown,
				onrejected?: (reason: unknown) => unknown
			) => Promise.resolve(resolveResult()).then(onfulfilled, onrejected)
		};
		return query;
	});

	return { rpc, from, calls } as any;
}

afterEach(() => {
	vi.useRealTimers();
});

describe('loadFastChatPromptContext timezone', () => {
	// daily_brief without an entityId is the one path that touches no table
	// other than `users`, so it isolates the timezone lookup.
	function createTimezoneProbeSupabaseMock(
		users: QueryResult | (() => never),
		onFrom?: (table: string) => void
	) {
		const from = vi.fn().mockImplementation((table: string) => {
			onFrom?.(table);
			if (table !== 'users') throw new Error(`Unexpected table in timezone probe: ${table}`);
			if (typeof users === 'function') return users();
			return createUsersTimezoneQuery(users);
		});
		return { from, rpc: vi.fn() } as any;
	}

	it('carries a valid users.timezone onto the returned context', async () => {
		const supabase = createTimezoneProbeSupabaseMock(usersTimezoneRow('America/New_York'));

		const context = await loadFastChatPromptContext({
			supabase,
			userId: 'user-1',
			contextType: 'daily_brief'
		});

		expect(context.timezone).toBe('America/New_York');
		expect(context.data).toBeNull();
	});

	it('falls back to UTC for a missing row, a blank value, or an invalid IANA name', async () => {
		for (const users of [
			{ data: null, error: null },
			usersTimezoneRow(null),
			usersTimezoneRow('   '),
			usersTimezoneRow('Mars/Olympus_Mons')
		]) {
			const context = await loadFastChatPromptContext({
				supabase: createTimezoneProbeSupabaseMock(users),
				userId: 'user-1',
				contextType: 'daily_brief'
			});
			expect(context.timezone).toBe('UTC');
		}
	});

	it('falls back to UTC and reports, without failing the load, when the lookup errors', async () => {
		const onError = vi.fn();
		const errored = createTimezoneProbeSupabaseMock({
			data: null,
			error: { message: 'permission denied' }
		});
		const throwing = createTimezoneProbeSupabaseMock(() => {
			throw new Error('connection reset');
		});

		for (const supabase of [errored, throwing]) {
			const context = await loadFastChatPromptContext({
				supabase,
				userId: 'user-1',
				contextType: 'daily_brief',
				onError
			});
			expect(context.timezone).toBe('UTC');
		}
		expect(onError).toHaveBeenCalledTimes(2);
		expect(onError.mock.calls.every(([event]) => event.stage === 'users.timezone')).toBe(true);
	});

	it('attaches the timezone to every return path, including loaded daily briefs', async () => {
		const supabase = createDailyBriefSupabaseMock({
			dailyBrief: {
				data: {
					id: 'brief-tz',
					brief_date: '2026-08-20',
					executive_summary: 'Summary',
					priority_actions: [],
					generation_status: 'completed',
					llm_analysis: null,
					metadata: {}
				},
				error: null
			},
			projectBriefs: { data: [], error: null },
			entities: { data: [], error: null }
		});

		const context = await loadFastChatPromptContext({
			supabase,
			userId: 'user-1',
			contextType: 'daily_brief',
			entityId: 'brief-tz'
		});

		expect(context.timezone).toBe(MOCK_USER_TIMEZONE);
		expect(context.contextLoadSource).toBe('fallback');
	});
});

describe('loadFastChatPromptContext daily_brief', () => {
	it('prefers ontology_brief_entities as mentioned-entity source', async () => {
		const supabase = createDailyBriefSupabaseMock({
			dailyBrief: {
				data: {
					id: 'brief-1',
					brief_date: '2026-02-14',
					executive_summary: 'Summary',
					priority_actions: ['Do the thing'],
					generation_status: 'completed',
					llm_analysis: null,
					metadata: { generatedVia: 'ontology_v1' }
				},
				error: null
			},
			projectBriefs: {
				data: [
					{
						id: 'pb-1',
						project_id: 'proj-1',
						brief_content: 'Project brief',
						metadata: {},
						created_at: '2026-02-14T10:00:00.000Z',
						project: { name: 'Alpha' }
					}
				],
				error: null
			},
			entities: {
				data: [
					{
						id: 'be-1',
						entity_kind: 'task',
						entity_id: 'task-123',
						project_id: 'proj-1',
						role: 'priority',
						project: { name: 'Alpha' }
					}
				],
				error: null
			}
		});

		const context = await loadFastChatPromptContext({
			supabase,
			userId: 'user-1',
			contextType: 'daily_brief',
			entityId: 'brief-1'
		});

		const data = context.data as Record<string, any>;
		expect(data.brief_id).toBe('brief-1');
		expect(data.mentioned_entities).toHaveLength(1);
		expect(data.mentioned_entities[0]).toMatchObject({
			entity_kind: 'task',
			entity_id: 'task-123',
			source: 'ontology_brief_entities'
		});
		expect(data.mentioned_entity_counts).toMatchObject({ task: 1 });
	});

	it('falls back to markdown-link parsing when ontology_brief_entities is empty', async () => {
		const supabase = createDailyBriefSupabaseMock({
			dailyBrief: {
				data: {
					id: 'brief-2',
					brief_date: '2026-02-14',
					executive_summary: 'See [Alpha](/projects/proj-1).',
					priority_actions: [],
					generation_status: 'completed',
					llm_analysis: null,
					metadata: {}
				},
				error: null
			},
			projectBriefs: {
				data: [
					{
						id: 'pb-2',
						project_id: 'proj-1',
						brief_content:
							'Ship auth fixes. [Fix auth blocker](/projects/proj-1/tasks/task-123)',
						metadata: {},
						created_at: '2026-02-14T11:00:00.000Z',
						project: { name: 'Alpha' }
					}
				],
				error: null
			},
			entities: {
				data: [],
				error: null
			}
		});

		const context = await loadFastChatPromptContext({
			supabase,
			userId: 'user-1',
			contextType: 'daily_brief',
			entityId: 'brief-2'
		});

		const data = context.data as Record<string, any>;
		expect(data.mentioned_entities.length).toBeGreaterThanOrEqual(1);
		expect(data.mentioned_entities).toContainEqual(
			expect.objectContaining({
				entity_kind: 'task',
				entity_id: 'task-123',
				source: 'markdown_link_fallback'
			})
		);
	});
});

describe('loadFastChatPromptContext global', () => {
	it('uses the migrated global RPC payload when project intelligence is present', async () => {
		// Nine projects: eight are bundled, the ninth only reaches the prompt
		// through the project index (AGENTIC_CHAT_HARNESS_AUDIT_2026-09-08 F115).
		const olderProjects = Array.from({ length: 8 }, (_, index) => ({
			id: `proj-older-${index + 1}`,
			name: `Older ${index + 1}`,
			state_key: 'active',
			description: null,
			start_at: null,
			end_at: null,
			next_step_short: null,
			updated_at: `2026-02-${String(14 - index).padStart(2, '0')}T20:00:00.000Z`
		}));
		const taskRollupQuery: TaskRollupQueryRecord = { inCalls: [], isCalls: [], notCalls: [] };
		const supabase = createGlobalRpcSupabaseMock(
			{
				projects: [
					{
						id: 'proj-1',
						name: 'Project One',
						state_key: 'active',
						description: 'Shared project',
						start_at: null,
						end_at: null,
						next_step_short: 'Ship it',
						updated_at: '2026-02-15T20:00:00.000Z'
					},
					...olderProjects
				],
				goals: [],
				milestones: [],
				plans: [],
				project_logs: [
					{
						project_id: 'proj-1',
						entity_type: 'task',
						entity_id: 'task-logged',
						action: 'updated',
						created_at: '2026-02-15T19:30:00.000Z',
						after_data: { title: 'Logged task', content: 'x'.repeat(4000) },
						before_data: null
					}
				],
				project_intelligence: {
					generated_at: '2026-02-15T20:00:00.000Z',
					scope: 'global',
					project_id: null,
					project_name: null,
					timezone: 'UTC',
					windows: {
						due_soon_days: 7,
						upcoming_days: 30,
						recent_changes_days: 7,
						recent_changes_max_lookback_days: 21
					},
					counts: {
						accessible_projects: 1,
						projects_returned: 1,
						overdue_total: 0,
						due_soon_total: 1,
						upcoming_total: 0,
						recent_change_total: 0
					},
					overdue_or_due_soon: [
						{
							kind: 'task',
							id: 'task-1',
							project_id: 'proj-1',
							project_name: 'Project One',
							title: 'Finish setup',
							state_key: 'todo',
							date_kind: 'due_at',
							date: '2026-02-16T20:00:00.000Z',
							bucket: 'due_soon',
							days_delta: 1,
							priority: 1,
							updated_at: '2026-02-15T19:00:00.000Z'
						}
					],
					upcoming_work: [],
					recent_changes: [],
					project_summaries: [
						{
							project_id: 'proj-1',
							project_name: 'Project One',
							state_key: 'active',
							next_step_short: 'Ship it',
							updated_at: '2026-02-15T20:00:00.000Z',
							counts: {
								overdue: 0,
								due_soon: 1,
								upcoming: 0,
								recent_changes: 0
							}
						}
					],
					limits: {
						overdue_or_due_soon: 16,
						upcoming_work: 16,
						recent_changes: 16,
						project_summaries: 8
					},
					maybe_more: {
						overdue_or_due_soon: false,
						upcoming_work: false,
						recent_changes: false,
						project_summaries: false
					},
					source: 'load_fastchat_context'
				}
			},
			{
				taskRollupRows: {
					data: [
						{
							project_id: 'proj-1',
							state_key: 'todo',
							due_at: '2000-01-01T00:00:00.000Z',
							completed_at: null
						},
						{
							project_id: 'proj-1',
							state_key: 'in_progress',
							due_at: null,
							completed_at: null
						},
						{
							project_id: 'proj-1',
							state_key: 'blocked',
							due_at: null,
							completed_at: null
						},
						{
							project_id: 'proj-1',
							state_key: 'done',
							due_at: null,
							completed_at: '2026-02-01T00:00:00.000Z'
						},
						{
							project_id: 'proj-1',
							state_key: 'todo',
							due_at: null,
							completed_at: '2026-02-01T00:00:00.000Z'
						},
						{
							project_id: 'proj-older-8',
							state_key: 'todo',
							due_at: '2000-01-01T00:00:00.000Z',
							completed_at: null
						},
						{
							project_id: 'proj-other',
							state_key: 'todo',
							due_at: null,
							completed_at: null
						}
					],
					error: null
				},
				taskRollupQuery
			}
		);

		const context = await loadFastChatPromptContext({
			supabase,
			userId: 'user-1',
			contextType: 'global'
		});

		const data = context.data as Record<string, any>;
		expect(data.context_meta.source).toBe('rpc');
		expect(data.context_meta.active_project_count).toBe(9);
		expect(data.context_meta.projects_returned).toBe(8);
		expect(
			data.projects.map((bundle: { project: { id: string } }) => bundle.project.id)
		).toEqual([
			'proj-1',
			'proj-older-1',
			'proj-older-2',
			'proj-older-3',
			'proj-older-4',
			'proj-older-5',
			'proj-older-6',
			'proj-older-7'
		]);
		// One TypeScript query rolls open tasks up per project. The query asks
		// for open tasks only (F115: no `done` count, so the row cap covers a
		// whole workspace); the loader keeps the same guard for rows that slip
		// through, so the mock's completed rows are skipped, not counted.
		expect(data.projects[0].task_rollup).toEqual({
			open: 3,
			overdue: 1,
			in_progress: 1,
			blocked: 1,
			truncated: false
		});
		// The state filter names only real `task_state` enum values. A legacy
		// alias here (the pre-fix filter sent "completed", "closed", ...) makes
		// Postgres reject the query with 22P02 and the rollup degrades to null
		// on every global turn, so assert against the generated enum.
		expect(taskRollupQuery.inCalls).toEqual([
			['project_id', ['proj-1', ...olderProjects.map((project) => project.id)]],
			['state_key', ['todo', 'in_progress', 'blocked']]
		]);
		for (const [column, values] of taskRollupQuery.inCalls) {
			if (column !== 'state_key') continue;
			for (const value of values as string[]) {
				expect(Constants.public.Enums.task_state).toContain(value);
			}
		}
		expect(taskRollupQuery.isCalls).toEqual([
			['deleted_at', null],
			['archived_at', null],
			['completed_at', null]
		]);
		expect(taskRollupQuery.notCalls).toEqual([]);
		// Every accessible project is in the index with its rollup, including the
		// ninth that no bundle carries; bundles no longer carry recent_activity.
		expect(data.project_index.map((entry: { id: string }) => entry.id)).toEqual([
			'proj-1',
			...olderProjects.map((project) => project.id)
		]);
		expect(data.project_index[0]).toEqual({
			id: 'proj-1',
			name: 'Project One',
			state_key: 'active',
			next_step_short: 'Ship it',
			updated_at: '2026-02-15T20:00:00.000Z',
			task_rollup: { open: 3, overdue: 1, in_progress: 1, blocked: 1, truncated: false }
		});
		expect(data.project_index[8]).toMatchObject({
			id: 'proj-older-8',
			task_rollup: { open: 1, overdue: 1, in_progress: 0, blocked: 0, truncated: false }
		});
		expect(data.projects[0]).not.toHaveProperty('recent_activity');
		expect(JSON.stringify(data)).not.toContain('Logged task');
		expect(data.project_intelligence).toMatchObject({
			scope: 'global',
			source: 'load_fastchat_context',
			counts: {
				accessible_projects: 1,
				due_soon_total: 1
			}
		});
		expect(supabase.rpc).toHaveBeenCalledTimes(1);
		// The RPC path reads two tables: users.timezone (alongside every context
		// load) and the one onto_tasks rollup query for every accessible project.
		expect(supabase.from.mock.calls.map(([table]: [string]) => table)).toEqual([
			'users',
			'onto_tasks'
		]);
		expect(context.timezone).toBe(MOCK_USER_TIMEZONE);
	});

	it('builds compact portfolio summaries from the fallback loader with per-project limits and no doc_structure', async () => {
		vi.useFakeTimers();
		const now = new Date('2026-02-15T20:07:18.308Z');
		vi.setSystemTime(now);

		const dayMs = 24 * 60 * 60 * 1000;
		const isoFromDays = (daysFromNow: number): string =>
			new Date(now.getTime() + daysFromNow * dayMs).toISOString();

		const supabase = createGlobalFallbackSupabaseMock({
			projectSummaries: [
				{
					id: 'proj-1',
					name: 'Project One',
					description: 'Project one',
					icon_svg: null,
					icon_concept: null,
					icon_generated_at: null,
					icon_generation_source: null,
					icon_generation_prompt: null,
					type_key: 'software',
					state_key: 'active',
					props: {},
					facet_context: null,
					facet_scale: null,
					facet_stage: null,
					created_at: isoFromDays(-10),
					updated_at: isoFromDays(0),
					task_count: 0,
					goal_count: 5,
					plan_count: 5,
					document_count: 0,
					owner_actor_id: 'actor-1',
					access_role: 'owner',
					access_level: 'admin',
					is_shared: false,
					next_step_short: null,
					next_step_long: null,
					next_step_source: null,
					next_step_updated_at: null
				},
				{
					id: 'proj-2',
					name: 'Project Two',
					description: 'Project two',
					icon_svg: null,
					icon_concept: null,
					icon_generated_at: null,
					icon_generation_source: null,
					icon_generation_prompt: null,
					type_key: 'software',
					state_key: 'active',
					props: {},
					facet_context: null,
					facet_scale: null,
					facet_stage: null,
					created_at: isoFromDays(-20),
					updated_at: isoFromDays(-1),
					task_count: 0,
					goal_count: 1,
					plan_count: 0,
					document_count: 0,
					owner_actor_id: 'actor-2',
					access_role: 'editor',
					access_level: 'write',
					is_shared: true,
					next_step_short: null,
					next_step_long: null,
					next_step_source: null,
					next_step_updated_at: null
				}
			],
			goals: {
				data: [
					{
						id: 'goal-completed',
						project_id: 'proj-1',
						name: 'Completed Goal',
						description: null,
						state_key: 'completed',
						target_date: isoFromDays(1),
						completed_at: isoFromDays(-1),
						updated_at: isoFromDays(0)
					},
					{
						id: 'goal-overdue',
						project_id: 'proj-1',
						name: 'Overdue Goal',
						description: null,
						state_key: 'active',
						target_date: isoFromDays(-1),
						completed_at: null,
						updated_at: isoFromDays(-2)
					},
					{
						id: 'goal-due-soon',
						project_id: 'proj-1',
						name: 'Soon Goal',
						description: null,
						state_key: 'active',
						target_date: isoFromDays(2),
						completed_at: null,
						updated_at: isoFromDays(-3)
					},
					{
						id: 'goal-future',
						project_id: 'proj-1',
						name: 'Future Goal',
						description: null,
						state_key: 'active',
						target_date: isoFromDays(14),
						completed_at: null,
						updated_at: isoFromDays(-4)
					},
					{
						id: 'goal-no-date',
						project_id: 'proj-1',
						name: 'No Date Goal',
						description: null,
						state_key: 'active',
						target_date: null,
						completed_at: null,
						updated_at: isoFromDays(-5)
					},
					{
						id: 'goal-proj-2',
						project_id: 'proj-2',
						name: 'Project Two Goal',
						description: null,
						state_key: 'active',
						target_date: null,
						completed_at: null,
						updated_at: isoFromDays(-2)
					}
				],
				error: null
			},
			milestones: {
				data: [
					{
						id: 'milestone-overdue',
						project_id: 'proj-1',
						title: 'Overdue Milestone',
						description: null,
						state_key: 'pending',
						due_at: isoFromDays(-1),
						completed_at: null,
						updated_at: isoFromDays(-2)
					},
					{
						id: 'milestone-soon',
						project_id: 'proj-1',
						title: 'Soon Milestone',
						description: null,
						state_key: 'in_progress',
						due_at: isoFromDays(2),
						completed_at: null,
						updated_at: isoFromDays(-3)
					},
					{
						id: 'milestone-future',
						project_id: 'proj-1',
						title: 'Future Milestone',
						description: null,
						state_key: 'pending',
						due_at: isoFromDays(14),
						completed_at: null,
						updated_at: isoFromDays(-4)
					},
					{
						id: 'milestone-no-date',
						project_id: 'proj-1',
						title: 'No Date Milestone',
						description: null,
						state_key: 'pending',
						due_at: null,
						completed_at: null,
						updated_at: isoFromDays(-5)
					},
					{
						id: 'milestone-completed',
						project_id: 'proj-1',
						title: 'Completed Milestone',
						description: null,
						state_key: 'completed',
						due_at: isoFromDays(1),
						completed_at: isoFromDays(-1),
						updated_at: isoFromDays(0)
					}
				],
				error: null
			},
			plans: {
				data: [
					{
						id: 'plan-active',
						project_id: 'proj-1',
						name: 'Active Plan',
						description: null,
						state_key: 'active',
						updated_at: isoFromDays(-8)
					},
					{
						id: 'plan-blocked',
						project_id: 'proj-1',
						name: 'Blocked Plan',
						description: null,
						state_key: 'blocked',
						updated_at: isoFromDays(-1)
					},
					{
						id: 'plan-todo',
						project_id: 'proj-1',
						name: 'Todo Plan',
						description: null,
						state_key: 'todo',
						updated_at: isoFromDays(-2)
					},
					{
						id: 'plan-draft',
						project_id: 'proj-1',
						name: 'Draft Plan',
						description: null,
						state_key: 'draft',
						updated_at: isoFromDays(-3)
					},
					{
						id: 'plan-completed',
						project_id: 'proj-1',
						name: 'Completed Plan',
						description: null,
						state_key: 'completed',
						updated_at: isoFromDays(0)
					}
				],
				error: null
			},
			taskRollupRows: {
				data: [
					{ project_id: 'proj-1', state_key: 'todo', due_at: null, completed_at: null },
					{ project_id: 'proj-2', state_key: 'blocked', due_at: null, completed_at: null }
				],
				error: null
			}
		});

		const context = await loadFastChatPromptContext({
			supabase,
			userId: 'user-1',
			contextType: 'global'
		});

		const data = context.data as Record<string, any>;
		expect(data.projects).toHaveLength(2);
		expect(data.projects[0].project.doc_structure).toBeUndefined();
		expect(data.context_meta).toMatchObject({
			source: 'fallback',
			project_count: 2,
			projects_returned: 2,
			project_limit: 8,
			includes_doc_structure: false,
			entity_limits_per_project: {
				goals: 2,
				milestones: 2,
				plans: 2
			}
		});
		expect(data.context_meta).not.toHaveProperty('recent_activity_window_days');
		expect(data.project_index).toEqual([
			expect.objectContaining({
				id: 'proj-1',
				name: 'Project One',
				task_rollup: { open: 1, overdue: 0, in_progress: 0, blocked: 0, truncated: false }
			}),
			expect.objectContaining({
				id: 'proj-2',
				name: 'Project Two',
				task_rollup: { open: 1, overdue: 0, in_progress: 0, blocked: 1, truncated: false }
			})
		]);

		const projectOne = data.projects.find(
			(bundle: { project: { id: string } }) => bundle.project.id === 'proj-1'
		);
		const projectTwo = data.projects.find(
			(bundle: { project: { id: string } }) => bundle.project.id === 'proj-2'
		);
		if (!projectOne || !projectTwo) {
			throw new Error('Expected bundled global projects to include proj-1 and proj-2');
		}

		expect(projectOne.goals.map((goal: { id: string }) => goal.id)).toEqual([
			'goal-overdue',
			'goal-due-soon'
		]);
		expect(projectTwo.goals.map((goal: { id: string }) => goal.id)).toEqual(['goal-proj-2']);
		expect(projectOne.milestones.map((milestone: { id: string }) => milestone.id)).toEqual([
			'milestone-overdue',
			'milestone-soon'
		]);
		expect(projectOne.plans.map((plan: { id: string }) => plan.id)).toEqual([
			'plan-active',
			'plan-blocked'
		]);
		// F115: the fallback no longer queries onto_project_logs (the mock's
		// unexpected-table guard proves it), so bundles carry no recent_activity
		// and the fallback snapshot carries no recent changes.
		expect(projectOne).not.toHaveProperty('recent_activity');
		expect(supabase.from.mock.calls.map(([table]: [string]) => table)).not.toContain(
			'onto_project_logs'
		);
		expect(data.project_intelligence).toMatchObject({
			scope: 'global',
			source: 'fallback',
			counts: {
				accessible_projects: 2,
				overdue_total: 2,
				due_soon_total: 2,
				upcoming_total: 2,
				recent_change_total: 0
			}
		});
		expect(
			data.project_intelligence.overdue_or_due_soon.map((item: { id: string }) => item.id)
		).toEqual(['goal-due-soon', 'milestone-soon', 'goal-overdue', 'milestone-overdue']);
		expect(supabase.rpc.mock.calls.map(([fn]: [string]) => fn)).toEqual([
			'load_fastchat_context',
			'ensure_actor_for_user',
			'get_onto_project_summaries_v1'
		]);
	});

	it('preserves fallback project dates and does not filter paused projects in TypeScript', async () => {
		const supabase = createGlobalFallbackSupabaseMock({
			projectSummaries: [
				{
					id: 'proj-active',
					name: 'Active Project',
					state_key: 'active',
					description: 'Active project',
					start_at: '2026-08-01',
					end_at: '2026-09-01',
					next_step_short: null,
					updated_at: '2026-07-01T00:00:00.000Z'
				},
				{
					id: 'proj-paused',
					name: 'Paused Project',
					state_key: 'paused',
					description: 'Paused project',
					start_at: '2026-10-01',
					end_at: '2026-11-01',
					next_step_short: null,
					updated_at: '2026-06-30T00:00:00.000Z'
				}
			],
			goals: { data: [], error: null },
			milestones: { data: [], error: null },
			plans: { data: [], error: null }
		});

		const context = await loadFastChatPromptContext({
			supabase,
			userId: 'user-1',
			contextType: 'global'
		});

		const data = context.data as Record<string, any>;
		expect(context.contextLoadSource).toBe('rpc_null_fallback');
		expect(
			data.projects.map((bundle: { project: { id: string } }) => bundle.project.id)
		).toEqual(['proj-active', 'proj-paused']);
		expect(data.projects[0].project).toMatchObject({
			start_at: '2026-08-01',
			end_at: '2026-09-01'
		});
		expect(data.projects[1].project).toMatchObject({
			state_key: 'paused',
			start_at: '2026-10-01',
			end_at: '2026-11-01'
		});
	});

	// The bundle recent_activity this test used to pin (7-day window, per-entity
	// dedupe, 21-day fallback) is gone with the logs query it was built from
	// (AGENTIC_CHAT_HARNESS_AUDIT_2026-09-08 F115). What the fallback still
	// guarantees: every accessible project reaches the index in updated_at
	// order, the rollup query covers all of them, and no log row is loaded.
	it('indexes every accessible project without loading project logs', async () => {
		vi.useFakeTimers();
		const now = new Date('2026-02-15T20:07:18.308Z');
		vi.setSystemTime(now);

		const dayMs = 24 * 60 * 60 * 1000;
		const isoFromDays = (daysFromNow: number): string =>
			new Date(now.getTime() + daysFromNow * dayMs).toISOString();

		const taskRollupQuery: TaskRollupQueryRecord = { inCalls: [], isCalls: [], notCalls: [] };
		const supabase = createGlobalFallbackSupabaseMock({
			projectSummaries: [
				{
					id: 'proj-2',
					name: 'Project Two',
					state_key: 'planning',
					description: 'Second project',
					next_step_short: 'Ship project two',
					updated_at: isoFromDays(-2)
				},
				{
					id: 'proj-1',
					name: 'Project One',
					state_key: 'active',
					description: 'First project',
					next_step_short: 'Ship project one',
					updated_at: isoFromDays(-1)
				},
				{
					id: 'proj-3',
					name: 'Project Three',
					state_key: 'paused',
					description: 'Third project',
					next_step_short: null,
					updated_at: isoFromDays(-3)
				}
			],
			goals: { data: [], error: null },
			milestones: { data: [], error: null },
			plans: { data: [], error: null },
			taskRollupQuery,
			taskRollupRows: {
				data: [
					{
						project_id: 'proj-3',
						state_key: 'todo',
						due_at: isoFromDays(-1),
						completed_at: null
					}
				],
				error: null
			}
		});

		const context = await loadFastChatPromptContext({
			supabase,
			userId: 'user-1',
			contextType: 'global'
		});

		const data = context.data as Record<string, any>;
		expect(supabase.from.mock.calls.map(([table]: [string]) => table)).not.toContain(
			'onto_project_logs'
		);
		expect(data.project_index.map((entry: { id: string }) => entry.id)).toEqual([
			'proj-1',
			'proj-2',
			'proj-3'
		]);
		expect(data.project_index[2]).toEqual({
			id: 'proj-3',
			name: 'Project Three',
			state_key: 'paused',
			next_step_short: null,
			updated_at: isoFromDays(-3),
			task_rollup: { open: 1, overdue: 1, in_progress: 0, blocked: 0, truncated: false }
		});
		// Both onto_tasks queries scope by project id; the rollup is the one with
		// the open-only state filter and it covers every accessible project.
		expect(taskRollupQuery.notCalls).toEqual([]);
		expect(taskRollupQuery.inCalls).toContainEqual([
			'state_key',
			['todo', 'in_progress', 'blocked']
		]);
		expect(taskRollupQuery.inCalls).toContainEqual([
			'project_id',
			['proj-1', 'proj-2', 'proj-3']
		]);
		for (const bundle of data.projects) {
			expect(bundle).not.toHaveProperty('recent_activity');
		}
	});
});

describe('focused document initial context', () => {
	it.each([
		['trailing whitespace', 'Meeting notes.\n\n## Email\nsetup cheap\n\n\n\n'],
		['longer than the former preview', 'Meeting notes\n'.repeat(400)],
		['empty document', ''],
		['bounded large document', 'x'.repeat(FOCUSED_DOCUMENT_CONTENT_MAX_CHARS + 1)]
	])(
		'preserves %s through the loader, prepared cache and initial prompt',
		async (_label, content) => {
			const projectId = '11111111-1111-4111-8111-111111111111';
			const documentId = '22222222-2222-4222-8222-222222222222';
			const context = await loadFastChatPromptContext({
				supabase: createProjectRpcSupabaseMock({
					project: { id: projectId, name: 'Website', state_key: 'active' },
					focus_entity_full: {
						id: documentId,
						project_id: projectId,
						title: 'Notes',
						content
					},
					linked_entities: {},
					linked_edges: []
				}),
				userId: 'user-1',
				contextType: 'project',
				entityId: projectId,
				projectFocus: {
					projectId,
					projectName: 'Website',
					focusType: 'document',
					focusEntityId: documentId,
					focusEntityName: 'Notes'
				}
			});
			const cached = compactPreparedPromptContextPayload({ ...context });
			const focus = (cached.data as Record<string, any>).focus_entity_full;
			const expected = content.slice(0, FOCUSED_DOCUMENT_CONTENT_MAX_CHARS);
			expect(focus).toMatchObject({
				content_preview: expected,
				content_length: content.length,
				content_truncated: content.length > expected.length
			});
			const envelope = buildLitePromptEnvelope({ ...context, data: cached.data, tools: [] });
			const section =
				envelope.sections.find((section) => section.id === 'focus_purpose')?.content ?? '';
			expect(section).toContain(expected);
			if (content.length > expected.length) {
				expect(section).toContain('Focus document excerpt');
				expect(section).toContain('16000 of 16001 chars');
			} else {
				expect(section).toContain('Focus document content (complete, already loaded');
				expect(section).not.toContain('for the rest');
				expect(section).toContain(
					'Do not call get_onto_document_details or read_document_section to load it again'
				);
			}
		}
	);
});

describe('loadFastChatPromptContext fallback bounds and focus safety', () => {
	const projectId = '11111111-1111-4111-8111-111111111111';
	const taskId = '22222222-2222-4222-8222-222222222222';
	const otherProjectId = '33333333-3333-4333-8333-333333333333';

	function createProjectFallbackTables(overrides: Record<string, any[]> = {}) {
		return {
			onto_projects: [
				{
					id: projectId,
					name: 'Project One',
					state_key: 'active',
					description: 'Fallback project',
					start_at: null,
					end_at: null,
					next_step_short: null,
					updated_at: '2026-02-15T20:00:00.000Z',
					doc_structure: null,
					deleted_at: null,
					archived_at: null
				}
			],
			onto_goals: [],
			onto_milestones: [],
			onto_plans: [],
			onto_tasks: [],
			onto_events: [],
			onto_project_members: [],
			onto_documents: [],
			onto_project_logs: [],
			onto_edges: [],
			...overrides
		};
	}

	it('fails closed on an empty project RPC instead of querying RLS-visible fallback rows', async () => {
		const supabase = createContextFallbackSupabaseMock({
			tables: createProjectFallbackTables({
				onto_goals: Array.from({ length: 80 }, (_, index) => ({
					id: `goal-${index}`,
					project_id: projectId,
					name: `Goal ${index}`,
					description: null,
					state_key: 'active',
					target_date: null,
					completed_at: null,
					updated_at: `2026-02-${String((index % 20) + 1).padStart(2, '0')}T00:00:00.000Z`,
					deleted_at: null,
					archived_at: null
				})),
				onto_tasks: Array.from({ length: 2000 }, (_, index) => ({
					id: `task-${index}`,
					project_id: projectId,
					title: `Task ${index}`,
					description: 'x'.repeat(500),
					state_key: 'todo',
					priority: index % 3,
					start_at: null,
					due_at: null,
					completed_at: null,
					updated_at: `2026-02-${String((index % 20) + 1).padStart(2, '0')}T00:00:00.000Z`,
					deleted_at: null,
					archived_at: null
				})),
				onto_documents: Array.from({ length: 100 }, (_, index) => ({
					id: `doc-${index}`,
					project_id: projectId,
					title: `Doc ${index}`,
					state_key: 'draft',
					type_key: 'note',
					created_at: '2026-01-01T00:00:00.000Z',
					updated_at: `2026-02-${String((index % 20) + 1).padStart(2, '0')}T00:00:00.000Z`,
					deleted_at: null,
					archived_at: null
				}))
			})
		});
		const onError = vi.fn();

		const context = await loadFastChatPromptContext({
			supabase,
			userId: 'user-1',
			contextType: 'project',
			entityId: projectId,
			onError
		});

		expect(context.contextLoadSource).toBe('rpc_null_fallback');
		expect(context.data).toBeNull();
		expect(onError).toHaveBeenCalledWith(
			expect.objectContaining({
				stage: 'rpc.load_fastchat_context.empty_payload'
			})
		);
		expect(supabase.calls.map((call: QueryCallRecord) => call.table)).toEqual(['users']);
	});

	it('does not query a cross-project focus entity after the project RPC fails closed', async () => {
		const supabase = createContextFallbackSupabaseMock({
			tables: createProjectFallbackTables({
				onto_tasks: [
					{
						id: taskId,
						project_id: otherProjectId,
						title: 'Wrong project task',
						description: 'Should not load',
						state_key: 'todo',
						priority: 1,
						start_at: null,
						due_at: null,
						completed_at: null,
						updated_at: '2026-02-15T00:00:00.000Z',
						deleted_at: null,
						archived_at: null
					}
				]
			})
		});

		const context = await loadFastChatPromptContext({
			supabase,
			userId: 'user-1',
			contextType: 'project',
			entityId: projectId,
			projectFocus: {
				projectId,
				projectName: 'Project One',
				focusType: 'task',
				focusEntityId: taskId,
				focusEntityName: 'Wrong project task'
			}
		});

		expect(context.data).toBeNull();
		expect(supabase.calls.some((call: QueryCallRecord) => call.table === 'onto_tasks')).toBe(
			false
		);
	});

	it('does not query document focus payloads after the project RPC fails closed', async () => {
		const documentId = '44444444-4444-4444-8444-444444444444';
		const longContent = 'Document body '.repeat(300);
		const supabase = createContextFallbackSupabaseMock({
			tables: createProjectFallbackTables({
				onto_documents: [
					{
						id: documentId,
						project_id: projectId,
						title: 'Strategy Doc',
						description: 'Doc description',
						state_key: 'draft',
						type_key: 'note',
						content: longContent,
						props: { secret: 'do not expose' },
						created_at: '2026-02-01T00:00:00.000Z',
						updated_at: '2026-02-15T00:00:00.000Z',
						deleted_at: null,
						archived_at: null
					}
				]
			})
		});

		const context = await loadFastChatPromptContext({
			supabase,
			userId: 'user-1',
			contextType: 'project',
			entityId: projectId,
			projectFocus: {
				projectId,
				projectName: 'Project One',
				focusType: 'document',
				focusEntityId: documentId,
				focusEntityName: 'Strategy Doc'
			}
		});

		expect(context.data).toBeNull();
		expect(
			supabase.calls.some((call: QueryCallRecord) => call.table === 'onto_documents')
		).toBe(false);
	});

	it('ignores non-UUID focus ids before linked-edge loading', async () => {
		const supabase = createContextFallbackSupabaseMock({
			tables: createProjectFallbackTables()
		});

		const context = await loadFastChatPromptContext({
			supabase,
			userId: 'user-1',
			contextType: 'project',
			entityId: projectId,
			projectFocus: {
				projectId,
				projectName: 'Project One',
				focusType: 'task',
				focusEntityId: 'not-a-uuid,src_id.not.is.null',
				focusEntityName: 'Bad focus'
			}
		});

		expect(context.focusEntityId).toBeNull();
		expect(supabase.calls.some((call: QueryCallRecord) => call.table === 'onto_edges')).toBe(
			false
		);
	});
});

describe('loadFastChatPromptContext project event window', () => {
	it('time-boxes project events and emits events_window metadata from RPC payloads', async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-02-15T20:07:18.308Z'));

		const supabase = createProjectRpcSupabaseMock({
			project: {
				id: 'proj-1',
				name: 'Project One',
				state_key: 'active',
				description: 'Test project',
				start_at: null,
				end_at: null,
				next_step_short: null,
				updated_at: '2026-02-15T20:00:00.000Z',
				doc_structure: {
					version: 1,
					root: [{ id: 'linked-doc', order: 0 }]
				}
			},
			goals: [],
			milestones: [],
			plans: [],
			tasks: [],
			documents: [
				{
					id: 'linked-doc',
					title: 'Linked Doc',
					state_key: 'draft',
					created_at: '2026-01-01T00:00:00.000Z',
					updated_at: '2026-02-01T00:00:00.000Z'
				},
				{
					id: 'unlinked-recent',
					title: 'Unlinked Recent',
					state_key: 'draft',
					created_at: '2026-02-12T00:00:00.000Z',
					updated_at: '2026-02-14T00:00:00.000Z'
				},
				{
					id: 'unlinked-old',
					title: 'Unlinked Old',
					state_key: 'draft',
					created_at: '2026-01-02T00:00:00.000Z',
					updated_at: '2026-01-03T00:00:00.000Z'
				}
			],
			events: [
				{
					id: 'in-window',
					title: 'In Window',
					description: null,
					state_key: 'scheduled',
					start_at: '2026-02-10T10:00:00.000Z',
					end_at: '2026-02-10T11:00:00.000Z',
					all_day: false,
					location: null,
					updated_at: '2026-02-10T11:00:00.000Z'
				},
				{
					id: 'too-old',
					title: 'Too Old',
					description: null,
					state_key: 'scheduled',
					start_at: '2026-02-07T20:07:18.307Z',
					end_at: '2026-02-07T21:07:18.307Z',
					all_day: false,
					location: null,
					updated_at: '2026-02-07T21:07:18.307Z'
				},
				{
					id: 'too-far',
					title: 'Too Far',
					description: null,
					state_key: 'scheduled',
					start_at: '2026-03-01T20:07:18.309Z',
					end_at: '2026-03-01T21:07:18.309Z',
					all_day: false,
					location: null,
					updated_at: '2026-03-01T21:07:18.309Z'
				}
			],
			members: []
		});

		const context = await loadFastChatPromptContext({
			supabase,
			userId: 'user-1',
			contextType: 'project',
			entityId: 'proj-1'
		});

		const data = context.data as Record<string, any>;
		expect(data.events).toHaveLength(1);
		expect(data.events[0].id).toBe('in-window');
		expect(data.documents).toHaveLength(3);
		expect(data.documents[0]).toMatchObject({
			id: 'unlinked-recent',
			is_unlinked: true,
			in_doc_structure: false
		});
		expect(data.documents[2]).toMatchObject({
			id: 'linked-doc',
			is_unlinked: false,
			in_doc_structure: true
		});
		expect(data.events_window).toMatchObject({
			timezone: 'UTC',
			past_days: 7,
			future_days: 14,
			now_at: '2026-02-15T20:07:18.308Z',
			start_at: '2026-02-08T20:07:18.308Z',
			end_at: '2026-03-01T20:07:18.308Z'
		});
		expect(data.context_meta).toMatchObject({
			generated_at: '2026-02-15T20:07:18.308Z',
			source: 'rpc',
			cache_age_seconds: 0,
			entity_scopes: {
				events: {
					returned: 1,
					total_matching: 1,
					is_complete: true,
					selection_strategy: 'start_at_asc_windowed'
				},
				documents: {
					returned: 3,
					total_matching: 3,
					is_complete: true,
					unlinked_total: 2,
					linked_total: 1
				}
			}
		});
	});

	it('loads bounded Start Here document content for project RPC contexts', async () => {
		const longBody = [
			'# START HERE - Project One',
			'',
			'## What this is',
			'This is the project orientation.',
			'a'.repeat(START_HERE_CONTEXT_LOAD_MAX_CHARS)
		].join('\n');
		const supabase = createProjectRpcSupabaseMock(
			{
				project: {
					id: 'proj-1',
					name: 'Project One',
					state_key: 'active',
					description: 'Test project',
					start_at: null,
					end_at: null,
					next_step_short: null,
					updated_at: '2026-02-15T20:00:00.000Z',
					doc_structure: null
				},
				goals: [],
				milestones: [],
				plans: [],
				tasks: [],
				documents: [
					{
						id: 'doc-1',
						title: 'Reference Doc',
						state_key: 'draft',
						created_at: '2026-02-01T00:00:00.000Z',
						updated_at: '2026-02-02T00:00:00.000Z'
					}
				],
				events: [],
				members: []
			},
			{
				startHere: {
					data: {
						id: 'start-here-1',
						title: 'START HERE - Project One',
						content: longBody,
						updated_at: '2026-02-15T19:00:00.000Z'
					},
					error: null
				}
			}
		);

		const context = await loadFastChatPromptContext({
			supabase,
			userId: 'user-1',
			contextType: 'project',
			entityId: 'proj-1'
		});

		const data = context.data as Record<string, any>;
		expect(data.start_here).toMatchObject({
			id: 'start-here-1',
			title: 'START HERE - Project One',
			content_truncated: true,
			updated_at: '2026-02-15T19:00:00.000Z'
		});
		expect(data.start_here.content.length).toBeLessThanOrEqual(
			START_HERE_CONTEXT_LOAD_MAX_CHARS
		);
		expect(data.start_here.content).toContain('This is the project orientation.');
		expect(data.documents[0]).not.toHaveProperty('content');
	});

	it('prefers explicit Start Here documents over newer legacy context documents', async () => {
		const supabase = createProjectRpcSupabaseMock(
			{
				project: {
					id: 'proj-1',
					name: 'Project One',
					state_key: 'active',
					description: 'Test project',
					start_at: null,
					end_at: null,
					next_step_short: null,
					updated_at: '2026-02-15T20:00:00.000Z',
					doc_structure: null
				},
				goals: [],
				milestones: [],
				plans: [],
				tasks: [],
				documents: [],
				events: [],
				members: []
			},
			{
				startHere: {
					data: [
						{
							id: 'legacy-context',
							title: 'Legacy Context Document',
							content: '# Legacy Context\nnewer but not explicit start here',
							props: {},
							created_at: '2026-02-16T00:00:00.000Z',
							updated_at: '2026-02-16T00:00:00.000Z'
						},
						{
							id: 'start-here-1',
							title: 'START HERE - Project One',
							content:
								'# START HERE - Project One\n\n## What this is\nExplicit orientation.',
							props: {
								origin: 'start_here_template',
								agent_workspace: {
									mode: 'living_reference',
									domain_profile: 'fiction_story',
									domain_affinity: 'writing.fiction'
								}
							},
							created_at: '2026-02-14T00:00:00.000Z',
							updated_at: '2026-02-14T00:00:00.000Z'
						}
					],
					error: null
				}
			}
		);

		const context = await loadFastChatPromptContext({
			supabase,
			userId: 'user-1',
			contextType: 'project',
			entityId: 'proj-1'
		});

		const data = context.data as Record<string, any>;
		expect(data.start_here).toMatchObject({
			id: 'start-here-1',
			title: 'START HERE - Project One',
			agent_workspace: {
				mode: 'living_reference',
				domain_profile: 'fiction_story',
				domain_affinity: 'writing.fiction'
			}
		});
		expect(data.start_here.content).toContain('Explicit orientation.');
	});

	it('applies member role defaults and sorts members by role and created_at', async () => {
		const supabase = createProjectRpcSupabaseMock({
			project: {
				id: 'proj-1',
				name: 'Project One',
				state_key: 'active',
				description: 'Test project',
				start_at: null,
				end_at: null,
				next_step_short: null,
				updated_at: '2026-02-15T20:00:00.000Z',
				doc_structure: null
			},
			goals: [],
			milestones: [],
			plans: [],
			tasks: [],
			documents: [],
			events: [],
			members: [
				{
					id: 'm-viewer',
					project_id: 'proj-1',
					actor_id: 'actor-viewer',
					role_key: 'viewer',
					access: 'read',
					role_name: '',
					role_description: '',
					created_at: '2026-02-03T00:00:00.000Z',
					actor: {
						id: 'actor-viewer',
						name: 'Viewer Person',
						email: 'viewer@example.com'
					}
				},
				{
					id: 'm-owner-late',
					project_id: 'proj-1',
					actor_id: 'actor-owner-late',
					role_key: 'owner',
					access: 'admin',
					role_name: ' ',
					role_description: null,
					created_at: '2026-02-02T00:00:00.000Z',
					actor_name: 'Owner Late',
					actor_email: 'owner-late@example.com'
				},
				{
					id: 'm-editor-early',
					project_id: 'proj-1',
					actor_id: 'actor-editor-early',
					role_key: 'editor',
					access: 'write',
					role_name: 'Delivery Lead',
					role_description: 'Owns day-to-day delivery coordination and follow-through.',
					created_at: '2026-02-01T12:00:00.000Z',
					actor_name: 'Editor Early',
					actor_email: 'editor-early@example.com'
				},
				{
					id: 'm-owner-early',
					project_id: 'proj-1',
					actor_id: 'actor-owner-early',
					role_key: 'owner',
					access: 'admin',
					role_name: null,
					role_description: null,
					created_at: '2026-02-01T00:00:00.000Z',
					actor_name: 'Owner Early',
					actor_email: 'owner-early@example.com'
				},
				{
					id: 'm-editor-late',
					project_id: 'proj-1',
					actor_id: 'actor-editor-late',
					role_key: 'editor',
					access: 'write',
					role_name: null,
					role_description: '   ',
					created_at: '2026-02-03T00:00:00.000Z',
					actor_name: 'Editor Late',
					actor_email: 'editor-late@example.com'
				}
			]
		});

		const context = await loadFastChatPromptContext({
			supabase,
			userId: 'user-1',
			contextType: 'project',
			entityId: 'proj-1'
		});

		const data = context.data as Record<string, any>;
		const members = data.members as Array<Record<string, any>>;

		expect(members.map((member) => member.id)).toEqual([
			'm-owner-early',
			'm-owner-late',
			'm-editor-early',
			'm-editor-late',
			'm-viewer'
		]);

		expect(members.find((member) => member.id === 'm-owner-late')).toMatchObject({
			role_name: 'Project Owner',
			role_description: 'Owns project direction, decision-making, and final approval.'
		});

		expect(members.find((member) => member.id === 'm-editor-late')).toMatchObject({
			role_name: 'Collaborator',
			role_description:
				'Contributes actively by creating, editing, and coordinating project work.'
		});

		expect(members.find((member) => member.id === 'm-editor-early')).toMatchObject({
			role_name: 'Delivery Lead',
			role_description: 'Owns day-to-day delivery coordination and follow-through.'
		});

		expect(members.find((member) => member.id === 'm-viewer')).toMatchObject({
			actor_name: 'Viewer Person',
			actor_email: 'viewer@example.com',
			role_name: 'Observer',
			role_description: 'Tracks progress and context, with read-only access to project work.'
		});
	});

	it('applies relevance priority and scope completeness metadata for project entities', async () => {
		vi.useFakeTimers();
		const now = new Date('2026-02-15T20:07:18.308Z');
		vi.setSystemTime(now);

		const dayMs = 24 * 60 * 60 * 1000;
		const isoFromDays = (daysFromNow: number): string =>
			new Date(now.getTime() + daysFromNow * dayMs).toISOString();

		const goals = [
			{
				id: 'goal-completed',
				name: 'Completed Goal',
				description: null,
				state_key: 'completed',
				target_date: isoFromDays(1),
				completed_at: isoFromDays(-1),
				updated_at: isoFromDays(0)
			},
			{
				id: 'goal-overdue',
				name: 'Overdue Goal',
				description: null,
				state_key: 'active',
				target_date: isoFromDays(-1),
				completed_at: null,
				updated_at: isoFromDays(-2)
			},
			{
				id: 'goal-due-soon',
				name: 'Soon Goal',
				description: null,
				state_key: 'active',
				target_date: isoFromDays(2),
				completed_at: null,
				updated_at: isoFromDays(-3)
			},
			{
				id: 'goal-future',
				name: 'Future Goal',
				description: null,
				state_key: 'active',
				target_date: isoFromDays(14),
				completed_at: null,
				updated_at: isoFromDays(-4)
			},
			...Array.from({ length: 9 }, (_, index) => ({
				id: `goal-open-${index + 1}`,
				name: `Open Goal ${index + 1}`,
				description: null,
				state_key: 'active',
				target_date: null,
				completed_at: null,
				updated_at: isoFromDays(-10 - index)
			}))
		];

		const milestones = [
			{
				id: 'milestone-completed',
				title: 'Completed Milestone',
				description: null,
				state_key: 'completed',
				due_at: isoFromDays(1),
				completed_at: isoFromDays(-1),
				updated_at: isoFromDays(0)
			},
			{
				id: 'milestone-overdue',
				title: 'Overdue Milestone',
				description: null,
				state_key: 'pending',
				due_at: isoFromDays(-1),
				completed_at: null,
				updated_at: isoFromDays(-2)
			},
			{
				id: 'milestone-due-soon',
				title: 'Soon Milestone',
				description: null,
				state_key: 'in_progress',
				due_at: isoFromDays(2),
				completed_at: null,
				updated_at: isoFromDays(-3)
			},
			{
				id: 'milestone-future',
				title: 'Future Milestone',
				description: null,
				state_key: 'pending',
				due_at: isoFromDays(14),
				completed_at: null,
				updated_at: isoFromDays(-4)
			},
			...Array.from({ length: 9 }, (_, index) => ({
				id: `milestone-open-${index + 1}`,
				title: `Open Milestone ${index + 1}`,
				description: null,
				state_key: 'pending',
				due_at: null,
				completed_at: null,
				updated_at: isoFromDays(-10 - index)
			}))
		];

		const plans = [
			{
				id: 'plan-completed',
				name: 'Completed Plan',
				description: null,
				state_key: 'completed',
				updated_at: isoFromDays(0)
			},
			{
				id: 'plan-active',
				name: 'Active Plan',
				description: null,
				state_key: 'active',
				updated_at: isoFromDays(-8)
			},
			{
				id: 'plan-blocked',
				name: 'Blocked Plan',
				description: null,
				state_key: 'blocked',
				updated_at: isoFromDays(-1)
			},
			{
				id: 'plan-todo',
				name: 'Todo Plan',
				description: null,
				state_key: 'todo',
				updated_at: isoFromDays(-2)
			},
			...Array.from({ length: 9 }, (_, index) => ({
				id: `plan-open-${index + 1}`,
				name: `Open Plan ${index + 1}`,
				description: null,
				state_key: 'todo',
				updated_at: isoFromDays(-10 - index)
			}))
		];

		const tasks = [
			{
				id: 'task-completed',
				title: 'Completed Task',
				description: null,
				state_key: 'completed',
				priority: 5,
				start_at: isoFromDays(-10),
				due_at: isoFromDays(-2),
				completed_at: isoFromDays(-0.5),
				updated_at: isoFromDays(0)
			},
			{
				id: 'task-overdue-inprogress',
				title: 'Overdue In Progress',
				description: null,
				state_key: 'in_progress',
				priority: 1,
				start_at: isoFromDays(-5),
				due_at: isoFromDays(-1),
				completed_at: null,
				updated_at: isoFromDays(-2)
			},
			{
				id: 'task-overdue-blocked',
				title: 'Overdue Blocked',
				description: null,
				state_key: 'blocked',
				priority: 5,
				start_at: isoFromDays(-5),
				due_at: isoFromDays(-1),
				completed_at: null,
				updated_at: isoFromDays(-1)
			},
			{
				id: 'task-due-soon-inprogress',
				title: 'Soon In Progress',
				description: null,
				state_key: 'in_progress',
				priority: 2,
				start_at: isoFromDays(-2),
				due_at: isoFromDays(2),
				completed_at: null,
				updated_at: isoFromDays(-2)
			},
			{
				id: 'task-future-inprogress',
				title: 'Future In Progress',
				description: null,
				state_key: 'in_progress',
				priority: 4,
				start_at: isoFromDays(-1),
				due_at: isoFromDays(14),
				completed_at: null,
				updated_at: isoFromDays(-1)
			},
			{
				id: 'task-no-due-inprogress',
				title: 'No Due In Progress',
				description: null,
				state_key: 'in_progress',
				priority: 3,
				start_at: isoFromDays(-3),
				due_at: null,
				completed_at: null,
				updated_at: isoFromDays(-3)
			},
			...Array.from({ length: 13 }, (_, index) => ({
				id: `task-open-${index + 1}`,
				title: `Open Task ${index + 1}`,
				description: null,
				state_key: 'todo',
				priority: index % 3,
				start_at: isoFromDays(-12 - index),
				due_at: null,
				completed_at: null,
				updated_at: isoFromDays(-10 - index)
			}))
		];

		const documents = [
			{
				id: 'doc-linked-old',
				title: 'Linked Old',
				state_key: 'draft',
				created_at: isoFromDays(-40),
				updated_at: isoFromDays(-30)
			},
			{
				id: 'doc-linked-recent',
				title: 'Linked Recent',
				state_key: 'draft',
				created_at: isoFromDays(-5),
				updated_at: isoFromDays(-2)
			},
			...Array.from({ length: 19 }, (_, index) => ({
				id: `doc-unlinked-${index + 1}`,
				title: `Unlinked ${index + 1}`,
				state_key: 'draft',
				created_at: isoFromDays(-20 - index),
				updated_at: isoFromDays(-index)
			}))
		];

		const supabase = createProjectRpcSupabaseMock({
			project: {
				id: 'proj-1',
				name: 'Project One',
				state_key: 'active',
				description: 'Test project',
				start_at: null,
				end_at: null,
				next_step_short: null,
				updated_at: isoFromDays(0),
				doc_structure: {
					version: 1,
					root: [
						{ id: 'doc-linked-old', order: 0 },
						{ id: 'doc-linked-recent', order: 1 }
					]
				}
			},
			goals,
			milestones,
			plans,
			tasks,
			documents,
			events: [],
			members: []
		});

		const context = await loadFastChatPromptContext({
			supabase,
			userId: 'user-1',
			contextType: 'project',
			entityId: 'proj-1'
		});

		const data = context.data as Record<string, any>;

		expect(data.goals).toHaveLength(12);
		expect(data.goals.map((goal: { id: string }) => goal.id)).not.toContain('goal-completed');
		expect(data.goals.slice(0, 3).map((goal: { id: string }) => goal.id)).toEqual([
			'goal-overdue',
			'goal-due-soon',
			'goal-future'
		]);

		expect(data.milestones).toHaveLength(12);
		expect(data.milestones.map((milestone: { id: string }) => milestone.id)).not.toContain(
			'milestone-completed'
		);
		expect(
			data.milestones.slice(0, 3).map((milestone: { id: string }) => milestone.id)
		).toEqual(['milestone-overdue', 'milestone-due-soon', 'milestone-future']);

		expect(data.plans).toHaveLength(12);
		expect(data.plans.map((plan: { id: string }) => plan.id)).not.toContain('plan-completed');
		expect(data.plans.slice(0, 3).map((plan: { id: string }) => plan.id)).toEqual([
			'plan-active',
			'plan-blocked',
			'plan-todo'
		]);

		expect(data.tasks).toHaveLength(18);
		expect(data.tasks.map((task: { id: string }) => task.id)).not.toContain('task-completed');
		expect(data.tasks.slice(0, 4).map((task: { id: string }) => task.id)).toEqual([
			'task-overdue-inprogress',
			'task-overdue-blocked',
			'task-due-soon-inprogress',
			'task-future-inprogress'
		]);

		expect(data.documents).toHaveLength(20);
		expect(data.documents[0]).toMatchObject({
			id: 'doc-unlinked-1',
			is_unlinked: true,
			in_doc_structure: false
		});
		expect(data.documents[19]).toMatchObject({
			id: 'doc-linked-recent',
			is_unlinked: false,
			in_doc_structure: true
		});
		expect(data.documents.map((doc: { id: string }) => doc.id)).not.toContain('doc-linked-old');

		expect(data.context_meta).toMatchObject({
			cache_age_seconds: 0,
			entity_scopes: {
				goals: {
					returned: 12,
					total_matching: 13,
					limit: 12,
					is_complete: false,
					selection_strategy: 'goal_priority_v1',
					filters: {
						deleted: 'excluded',
						states: 'all',
						due_soon_days: 7
					}
				},
				milestones: {
					returned: 12,
					total_matching: 13,
					limit: 12,
					is_complete: false,
					selection_strategy: 'milestone_priority_v1',
					filters: {
						deleted: 'excluded',
						states: 'all',
						due_soon_days: 7
					}
				},
				plans: {
					returned: 12,
					total_matching: 13,
					limit: 12,
					is_complete: false,
					selection_strategy: 'plan_priority_v1',
					filters: {
						deleted: 'excluded',
						states: 'all'
					}
				},
				tasks: {
					returned: 18,
					total_matching: 19,
					limit: 18,
					is_complete: false,
					selection_strategy: 'task_priority_v1',
					filters: {
						deleted: 'excluded',
						states: 'all',
						due_soon_days: 7
					}
				},
				documents: {
					returned: 20,
					total_matching: 21,
					limit: 20,
					is_complete: false,
					selection_strategy: 'unlinked_first_recent_activity_desc',
					filters: {
						deleted: 'excluded',
						include_unlinked: true
					},
					unlinked_total: 19,
					linked_total: 2
				}
			}
		});
	});

	it('preserves total scope metadata when the RPC returns pre-truncated project arrays', async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-02-15T20:07:18.308Z'));

		const supabase = createProjectRpcSupabaseMock({
			project: {
				id: 'proj-1',
				name: 'Project One',
				state_key: 'active',
				description: 'Test project',
				start_at: null,
				end_at: null,
				next_step_short: null,
				updated_at: '2026-02-15T20:00:00.000Z',
				doc_structure: {
					version: 1,
					root: [{ id: 'doc-linked', order: 0 }]
				}
			},
			goals: [
				{
					id: 'goal-overdue',
					name: 'Overdue Goal',
					description: null,
					state_key: 'active',
					target_date: '2026-02-14T20:07:18.308Z',
					completed_at: null,
					updated_at: '2026-02-13T20:07:18.308Z'
				}
			],
			milestones: [
				{
					id: 'milestone-due-soon',
					title: 'Soon Milestone',
					description: null,
					state_key: 'in_progress',
					due_at: '2026-02-17T20:07:18.308Z',
					completed_at: null,
					updated_at: '2026-02-13T20:07:18.308Z'
				}
			],
			plans: [
				{
					id: 'plan-active',
					name: 'Active Plan',
					description: null,
					state_key: 'active',
					updated_at: '2026-02-13T20:07:18.308Z'
				}
			],
			tasks: [
				{
					id: 'task-overdue',
					title: 'Overdue Task',
					description: null,
					state_key: 'in_progress',
					priority: 3,
					start_at: '2026-02-10T20:07:18.308Z',
					due_at: '2026-02-14T20:07:18.308Z',
					completed_at: null,
					updated_at: '2026-02-13T20:07:18.308Z'
				}
			],
			documents: [
				{
					id: 'doc-unlinked',
					title: 'Recent Unlinked',
					state_key: 'draft',
					created_at: '2026-02-10T20:07:18.308Z',
					updated_at: '2026-02-14T20:07:18.308Z'
				},
				{
					id: 'doc-linked',
					title: 'Linked Doc',
					state_key: 'draft',
					created_at: '2026-02-01T20:07:18.308Z',
					updated_at: '2026-02-02T20:07:18.308Z'
				}
			],
			events: [
				{
					id: 'event-1',
					title: 'Soon Event',
					description: null,
					state_key: 'scheduled',
					start_at: '2026-02-16T20:07:18.308Z',
					end_at: '2026-02-16T21:07:18.308Z',
					all_day: false,
					location: null,
					updated_at: '2026-02-14T20:07:18.308Z'
				}
			],
			members: [],
			entity_counts: {
				goals_total: 17,
				milestones_total: 9,
				plans_total: 14,
				tasks_total: 23,
				documents_total: 31,
				document_linked_total: 3,
				document_unlinked_total: 28,
				events_total: 22
			}
		});

		const context = await loadFastChatPromptContext({
			supabase,
			userId: 'user-1',
			contextType: 'project',
			entityId: 'proj-1'
		});

		const data = context.data as Record<string, any>;

		expect(data.documents.map((doc: { id: string }) => doc.id)).toEqual([
			'doc-unlinked',
			'doc-linked'
		]);
		expect(data.context_meta.entity_scopes).toMatchObject({
			goals: {
				returned: 1,
				total_matching: 17,
				is_complete: false
			},
			milestones: {
				returned: 1,
				total_matching: 9,
				is_complete: false
			},
			plans: {
				returned: 1,
				total_matching: 14,
				is_complete: false
			},
			tasks: {
				returned: 1,
				total_matching: 23,
				is_complete: false
			},
			events: {
				returned: 1,
				total_matching: 22,
				is_complete: false
			},
			documents: {
				returned: 2,
				total_matching: 31,
				is_complete: false,
				unlinked_total: 28,
				linked_total: 3
			}
		});
	});
});
