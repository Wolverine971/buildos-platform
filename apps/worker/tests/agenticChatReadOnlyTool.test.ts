// apps/worker/tests/agenticChatReadOnlyTool.test.ts
import { describe, expect, it, vi } from 'vitest';
import type { AgenticChatToolAccessPortV1 } from '@buildos/agentic-chat-runtime/tools';
import type { AgenticChatWorkerExecutionInputV1 } from '../src/workers/agentic-chat/executionInput';
import {
	AGENTIC_CHAT_PRODUCTION_READ_TOOL_NAMES_V1,
	AGENTIC_CHAT_PRODUCTION_READ_TOOLS_V1,
	AgenticChatReadOnlyToolAdapter
} from '../src/workers/agentic-chat/readOnlyTool';

const USER_ID = '10000000-0000-4000-8000-000000000001';
const ACTOR_ID = '90000000-0000-4000-8000-000000000009';
const PROJECT_ID = '40000000-0000-4000-8000-000000000004';

const SHARED_ALLOWLIST = [
	'list_onto_projects',
	'list_onto_tasks',
	'list_onto_goals',
	'list_onto_plans',
	'list_onto_documents',
	'list_onto_milestones',
	'list_onto_risks',
	'search_onto_projects',
	'search_onto_tasks',
	'search_onto_goals',
	'search_onto_plans',
	'search_onto_documents',
	'search_onto_milestones',
	'search_onto_risks',
	'get_onto_project_details',
	'get_onto_document_details',
	'get_document_outline',
	'read_document_section',
	'get_workspace_overview',
	'get_project_overview',
	'get_field_info'
];

function executionInput(): AgenticChatWorkerExecutionInputV1 {
	return {
		claim: {
			outcome: 'claimed',
			executionMayStart: true,
			turnRunId: '30000000-0000-4000-8000-000000000003',
			queueJobId: '50000000-0000-4000-8000-000000000005',
			sessionId: '20000000-0000-4000-8000-000000000002',
			userId: USER_ID,
			correlationId: '60000000-0000-4000-8000-000000000006',
			executionGeneration: 1,
			status: 'running',
			inputArtifactId: '70000000-0000-4000-8000-000000000007',
			userMessageId: '80000000-0000-4000-8000-000000000008'
		},
		streamRunId: 'stream-1',
		clientTurnId: 'client-1',
		requestPayload: {
			message: 'Read the project',
			context: { type: 'project', projectId: PROJECT_ID }
		},
		artifact: {} as never,
		timingBaseline: {} as never
	};
}

function projectSummary(overrides: Record<string, unknown> = {}): Record<string, unknown> {
	return {
		id: PROJECT_ID,
		name: '9takes',
		state_key: 'active',
		description: 'desc',
		next_step_short: 'Ship it',
		updated_at: '2026-08-01T00:00:00.000Z',
		task_count: 3,
		document_count: 1,
		plan_count: 2,
		goal_count: 1,
		...overrides
	};
}

function accessStub(
	overrides: Partial<AgenticChatToolAccessPortV1> = {}
): AgenticChatToolAccessPortV1 {
	return {
		getActorId: vi.fn(async () => ACTOR_ID),
		resolveProjectSummaries: vi.fn(async () => [projectSummary()] as never),
		assertProjectAccess: vi.fn(async () => {}),
		assertEntityAccess: vi.fn(async () => {}),
		...overrides
	};
}

function makeBuilder(rows: unknown[]): Record<string, unknown> {
	const builder: Record<string, unknown> = {};
	for (const method of [
		'select',
		'eq',
		'neq',
		'in',
		'is',
		'not',
		'or',
		'gte',
		'lte',
		'order',
		'limit',
		'range'
	]) {
		builder[method] = vi.fn(() => builder);
	}
	builder.maybeSingle = vi.fn(async () => ({ data: rows[0] ?? null, error: null }));
	builder.then = (
		onFulfilled: (value: unknown) => unknown,
		onRejected: (reason: unknown) => unknown
	) =>
		Promise.resolve({ data: rows, error: null, count: rows.length }).then(
			onFulfilled,
			onRejected
		);
	return builder;
}

function fakeSharedClient(tables: Record<string, unknown[]> = {}): {
	from: ReturnType<typeof vi.fn>;
} {
	return { from: vi.fn((table: string) => makeBuilder(tables[table] ?? [])) };
}

function adapterWith(
	client: { from: unknown },
	access: AgenticChatToolAccessPortV1,
	options: { now?: () => number; timeoutMs?: number } = {}
): AgenticChatReadOnlyToolAdapter {
	return new AgenticChatReadOnlyToolAdapter(client as never, {
		...options,
		createAccessAdapter: () => access
	});
}

function requestFor(toolName: string, args: Record<string, unknown>) {
	return {
		toolName,
		arguments: args as never,
		providerToolCallId: 'provider-read-1',
		executionInput: executionInput(),
		signal: new AbortController().signal
	};
}

describe('AgenticChatReadOnlyToolAdapter', () => {
	it('allowlists exactly the shared read tools while advertising the single reviewed schema', () => {
		expect([...AGENTIC_CHAT_PRODUCTION_READ_TOOL_NAMES_V1].sort()).toEqual(
			[...SHARED_ALLOWLIST].sort()
		);
		// Deliberately absent from the shared allowlist.
		expect(AGENTIC_CHAT_PRODUCTION_READ_TOOL_NAMES_V1).not.toContain('change_chat_context');
		expect(AGENTIC_CHAT_PRODUCTION_READ_TOOL_NAMES_V1).not.toContain(
			'get_user_profile_overview'
		);
		// The provider-advertised schema surface stays the single reviewed tool
		// until the catalog swap slice expands it.
		expect(AGENTIC_CHAT_PRODUCTION_READ_TOOLS_V1).toMatchObject([
			{
				type: 'function',
				function: {
					name: 'get_project_overview',
					parameters: { type: 'object', additionalProperties: false }
				}
			}
		]);
	});

	it('routes get_project_overview through the shared implementation and returns the legacy payload', async () => {
		const access = accessStub();
		const client = fakeSharedClient();
		const ticks = [100, 112];
		const adapter = adapterWith(client, access, { now: () => ticks.shift() ?? 112 });

		await expect(
			adapter.execute(requestFor('get_project_overview', { project_id: PROJECT_ID }))
		).resolves.toEqual({
			result: {
				generated_at: expect.any(String),
				scope: 'project',
				match: { status: 'resolved', project_id: PROJECT_ID, query: null },
				project: {
					id: PROJECT_ID,
					name: '9takes',
					state_key: 'active',
					description: 'desc',
					start_at: null,
					end_at: null,
					next_step_short: 'Ship it',
					updated_at: '2026-08-01T00:00:00.000Z'
				},
				counts: {
					active_tasks: 0,
					blocked_tasks: 0,
					overdue_tasks: 0,
					due_soon_tasks: 0,
					open_milestones: 0,
					open_plans: 0,
					open_risks: 0,
					upcoming_events: 0,
					collaborators: 0
				},
				entity_counts: { tasks: 3, documents: 1, plans: 2, goals: 1, collaborators: 0 },
				tasks: [],
				milestones: [],
				collaborators: { count: 0, members: [], truncated: false },
				risks: [],
				upcoming_events: [],
				recent_activity: [],
				message: 'Project overview prepared for 9takes.'
			},
			executionTimeMs: 12,
			tokensConsumed: null,
			affectedEntities: [{ type: 'project', id: PROJECT_ID, name: '9takes' }],
			toolCategory: 'read',
			resultCount: 1,
			zeroResult: false,
			requiresUserAction: false
		});
		expect(access.getActorId).toHaveBeenCalled();
	});

	it('forwards a legacy not_found overview payload with no result evidence', async () => {
		const access = accessStub({ resolveProjectSummaries: vi.fn(async () => []) });
		const adapter = adapterWith(fakeSharedClient(), access);

		await expect(
			adapter.execute(requestFor('get_project_overview', { project_id: PROJECT_ID }))
		).resolves.toMatchObject({
			result: {
				scope: 'project',
				match: { status: 'not_found', query: PROJECT_ID, candidates: [] },
				message: 'No accessible project matched that project_id.'
			},
			affectedEntities: [],
			toolCategory: 'read',
			resultCount: null,
			zeroResult: null,
			requiresUserAction: false
		});
	});

	it('rejects an overview payload whose project id is not a canonical uuid', async () => {
		const access = accessStub({
			resolveProjectSummaries: vi.fn(
				async () => [projectSummary({ id: 'NOT-A-CANONICAL-UUID' })] as never
			)
		});
		const adapter = adapterWith(fakeSharedClient(), access);

		await expect(
			adapter.execute(requestFor('get_project_overview', { query: '9takes' }))
		).rejects.toMatchObject({ code: 'read_tool_result_invalid', failureClass: 'unknown' });
	});

	it('dispatches a second shared tool through the same envelope', async () => {
		const taskRow = {
			id: '11111111-0000-4000-8000-000000000011',
			project_id: PROJECT_ID,
			title: 'Write launch post',
			description: null,
			type_key: 'task.default',
			state_key: 'todo',
			priority: 2,
			start_at: null,
			due_at: null,
			completed_at: null,
			props: {},
			project: { name: '9takes' }
		};
		const access = accessStub();
		const client = fakeSharedClient({ onto_tasks: [taskRow] });
		const adapter = adapterWith(client, access);

		await expect(
			adapter.execute(requestFor('list_onto_tasks', { project_id: PROJECT_ID }))
		).resolves.toMatchObject({
			result: {
				tasks: [
					{
						id: taskRow.id,
						project_id: PROJECT_ID,
						title: 'Write launch post',
						state_key: 'todo',
						project_name: '9takes'
					}
				],
				total: 1,
				message: 'Found 1 ontology tasks. Use get_onto_task_details for full information.'
			},
			affectedEntities: [],
			toolCategory: 'search',
			// Legacy web persists search telemetry only for search tools; list
			// tools record no evidence (searchTelemetryColumns parity).
			resultCount: null,
			zeroResult: null,
			requiresUserAction: false
		});
		expect(access.assertProjectAccess).toHaveBeenCalledWith(PROJECT_ID, 'read');
	});

	it('derives search telemetry from the primary result array for search tools', async () => {
		const rows = [
			{
				id: '11111111-0000-4000-8000-000000000011',
				project_id: PROJECT_ID,
				title: 'Blog ideas',
				project: { name: '9takes' }
			},
			{
				id: '22222222-0000-4000-8000-000000000022',
				project_id: PROJECT_ID,
				title: 'Blog outline',
				project: { name: '9takes' }
			}
		];
		const adapter = adapterWith(fakeSharedClient({ onto_tasks: rows }), accessStub());

		await expect(
			adapter.execute(
				requestFor('search_onto_tasks', { query: 'blog', project_id: PROJECT_ID })
			)
		).resolves.toMatchObject({
			toolCategory: 'search',
			resultCount: 2,
			zeroResult: false
		});
	});

	it('fails closed on tools outside the shared allowlist', async () => {
		const adapter = adapterWith(fakeSharedClient(), accessStub());

		for (const toolName of ['update_onto_project', 'change_chat_context', 'constructor']) {
			await expect(adapter.execute(requestFor(toolName, {}))).rejects.toMatchObject({
				code: 'read_tool_not_allowlisted',
				failureClass: 'permanent'
			});
		}
	});

	it('maps shared-implementation failures onto read_tool_execution_failed', async () => {
		// Shared argument validation (transcribed from the legacy web executor)
		// is a permanent failure.
		const adapter = adapterWith(fakeSharedClient(), accessStub());
		await expect(adapter.execute(requestFor('get_project_overview', {}))).rejects.toMatchObject(
			{
				code: 'read_tool_execution_failed',
				failureClass: 'permanent',
				message: 'get_project_overview requires project_id or query'
			}
		);

		// Access denial from the worker access adapter is permanent.
		const denied = adapterWith(
			fakeSharedClient(),
			accessStub({
				assertProjectAccess: vi.fn(async () => {
					throw new Error('Project not found or access denied');
				})
			})
		);
		await expect(
			denied.execute(requestFor('list_onto_tasks', { project_id: PROJECT_ID }))
		).rejects.toMatchObject({
			code: 'read_tool_execution_failed',
			failureClass: 'permanent',
			message: 'Project not found or access denied'
		});

		// Database-style failures carrying a code stay retriable-unknown, like
		// the old gateway INTERNAL mapping.
		const dbDown = adapterWith(
			fakeSharedClient(),
			accessStub({
				resolveProjectSummaries: vi.fn(async () => {
					throw Object.assign(new Error('connection refused'), { code: 'XX000' });
				})
			})
		);
		await expect(
			dbDown.execute(requestFor('get_workspace_overview', {}))
		).rejects.toMatchObject({
			code: 'read_tool_execution_failed',
			failureClass: 'unknown',
			message: 'connection refused'
		});
	});

	it('keeps the project-context guard on get_project_overview', async () => {
		const adapter = adapterWith(fakeSharedClient(), accessStub());
		const invalidContext = executionInput();
		invalidContext.requestPayload.context = { type: 'project', projectId: null };

		await expect(
			adapter.execute({
				...requestFor('get_project_overview', { query: '9takes' }),
				executionInput: invalidContext
			})
		).rejects.toMatchObject({ code: 'read_tool_context_invalid', failureClass: 'permanent' });
	});

	it('aborts and rejects a hung shared read at the configured deadline', async () => {
		const adapter = adapterWith(
			fakeSharedClient(),
			accessStub({
				resolveProjectSummaries: vi.fn(() => new Promise<never>(() => {}))
			}),
			{ timeoutMs: 10 }
		);

		await expect(
			adapter.execute(requestFor('get_workspace_overview', {}))
		).rejects.toMatchObject({ code: 'read_tool_timeout', failureClass: 'transient_infra' });
	});
});
