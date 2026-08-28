// apps/worker/tests/agenticChatToolExecutionAdapter.test.ts
import { describe, expect, it, vi } from 'vitest';
import {
	AGENTIC_CHAT_SHARED_READ_TOOL_NAMES_V1,
	type AgenticChatToolAccessPortV1
} from '@buildos/agentic-chat-runtime/tools';
import type { WebResearchPort } from '@buildos/shared-agent-ops';
import type { AgenticChatWorkerExecutionInputV1 } from '../src/workers/agentic-chat/executionInput';
import {
	AGENTIC_CHAT_CONTROL_TOOL_NAMES_V1,
	AGENTIC_CHAT_PRODUCTION_READ_TOOL_NAMES_V1,
	AGENTIC_CHAT_WEB_RESEARCH_TOOL_NAMES_V1,
	AgenticChatToolExecutionAdapter,
	isAgenticChatProductionReadToolNameV1
} from '../src/workers/agentic-chat/tools/execution-adapter';

const USER_ID = '10000000-0000-4000-8000-000000000001';
const ACTOR_ID = '90000000-0000-4000-8000-000000000009';
const PROJECT_ID = '40000000-0000-4000-8000-000000000004';

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
	builder.single = vi.fn(async () => ({ data: rows[0] ?? null, error: null }));
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
	options: {
		now?: () => number;
		timeoutMs?: number;
		webResearchTimeoutMs?: number;
		webResearch?: WebResearchPort;
	} = {}
): AgenticChatToolExecutionAdapter {
	return new AgenticChatToolExecutionAdapter(client as never, {
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

describe('AgenticChatToolExecutionAdapter', () => {
	it('allowlists exactly the shared read tools for provider and executor composition', () => {
		const composedNames = [
			...AGENTIC_CHAT_CONTROL_TOOL_NAMES_V1,
			...AGENTIC_CHAT_SHARED_READ_TOOL_NAMES_V1,
			'change_chat_context',
			...AGENTIC_CHAT_WEB_RESEARCH_TOOL_NAMES_V1
		];
		expect([...AGENTIC_CHAT_PRODUCTION_READ_TOOL_NAMES_V1].sort()).toEqual(
			composedNames.sort()
		);
		expect(new Set(AGENTIC_CHAT_PRODUCTION_READ_TOOL_NAMES_V1).size).toBe(
			AGENTIC_CHAT_PRODUCTION_READ_TOOL_NAMES_V1.length
		);
		expect(AGENTIC_CHAT_PRODUCTION_READ_TOOL_NAMES_V1).toContain('change_chat_context');
		// Deliberately absent from the shared allowlist.
		expect(AGENTIC_CHAT_PRODUCTION_READ_TOOL_NAMES_V1).not.toContain(
			'get_user_profile_overview'
		);
		expect(isAgenticChatProductionReadToolNameV1('get_project_overview')).toBe(true);
		expect(isAgenticChatProductionReadToolNameV1('web_search')).toBe(true);
		expect(isAgenticChatProductionReadToolNameV1('web_visit')).toBe(true);
		expect(isAgenticChatProductionReadToolNameV1('update_onto_project')).toBe(false);
	});

	it('executes a context shift and materializes the new surface on the following turn', async () => {
		const adapter = adapterWith(fakeSharedClient(), accessStub());

		await expect(
			adapter.execute(requestFor('change_chat_context', { target: 'global' }))
		).resolves.toMatchObject({
			result: {
				type: 'context_change',
				changed: true,
				target: 'global',
				materialized_tools: [],
				context_shift: { new_context: 'global', entity_id: null }
			}
		});
	});

	it('executes worker-native web search and visit through the bounded research port', async () => {
		const webResearch = {
			search: vi.fn(async () => ({
				query: 'scheduling pricing',
				results: [
					{ title: 'A', url: 'https://a.example/pricing' },
					{ title: 'B', url: 'https://b.example/pricing' }
				],
				info: { search_depth: 'advanced' }
			})),
			visit: vi.fn(async () => ({
				url: 'https://a.example/pricing',
				final_url: 'https://a.example/pricing',
				content: 'Pricing evidence',
				info: { fetched_at: '2026-08-17T12:00:00.000Z' }
			}))
		} satisfies WebResearchPort;
		const adapter = adapterWith(fakeSharedClient(), accessStub(), { webResearch });

		await expect(
			adapter.execute(requestFor('web_search', { query: 'scheduling pricing' }))
		).resolves.toMatchObject({
			result: { query: 'scheduling pricing', results: [{ title: 'A' }, { title: 'B' }] },
			toolCategory: 'search',
			resultCount: null,
			zeroResult: null
		});
		await expect(
			adapter.execute(requestFor('web_visit', { url: 'https://a.example/pricing' }))
		).resolves.toMatchObject({
			result: { content: 'Pricing evidence' },
			toolCategory: 'read'
		});
		expect(webResearch.search).toHaveBeenCalledWith({ query: 'scheduling pricing' });
		expect(webResearch.visit).toHaveBeenCalledWith({
			url: 'https://a.example/pricing'
		});
	});

	it('fails web research closed when its worker port is unavailable', async () => {
		await expect(
			adapterWith(fakeSharedClient(), accessStub()).execute(
				requestFor('web_search', { query: 'pricing' })
			)
		).rejects.toMatchObject({
			code: 'read_tool_execution_failed',
			failureClass: 'transient_infra',
			message: 'Agentic Chat web_search is not configured'
		});
	});

	it('validates and acknowledges a semantic turn contract without touching project data', async () => {
		const access = accessStub();
		const client = fakeSharedClient();
		const result = await adapterWith(client, access).execute(
			requestFor('declare_turn_contract', {
				outcomes: [
					{
						action: 'organize',
						entity_kind: 'document',
						minimum_successful_effects: 2
					}
				]
			})
		);

		expect(result.result).toMatchObject({
			status: 'declared',
			contract: {
				source: 'declared',
				outcomes: [{ action: 'organize', entityKind: 'document' }]
			}
		});
		expect(client.from).not.toHaveBeenCalled();
	});

	it('acknowledges an explicit contract cancellation without touching project data', async () => {
		const access = accessStub();
		const client = fakeSharedClient();
		const result = await adapterWith(client, access).execute(
			requestFor('cancel_turn_contract', {
				reason: 'The user explicitly cancelled the prior commission.'
			})
		);

		expect(result.result).toMatchObject({
			status: 'cancelled',
			reason: 'The user explicitly cancelled the prior commission.'
		});
		expect(client.from).not.toHaveBeenCalled();
	});

	it('acknowledges an explicit read-only disposition without touching project data', async () => {
		const access = accessStub();
		const client = fakeSharedClient();
		const result = await adapterWith(client, access).execute(
			requestFor('declare_read_only_turn', {
				reason: 'The user asked for an explanation and did not commission a durable change.'
			})
		);

		expect(result.result).toMatchObject({
			status: 'read_only_declared',
			reason: 'The user asked for an explanation and did not commission a durable change.'
		});
		expect(client.from).not.toHaveBeenCalled();
		expect(access.getActorId).not.toHaveBeenCalled();
	});

	it('rejects a read-only disposition without a meaningful reason', async () => {
		const access = accessStub();
		const client = fakeSharedClient();

		await expect(
			adapterWith(client, access).execute(
				requestFor('declare_read_only_turn', { reason: '   ' })
			)
		).rejects.toThrow(
			'Read-only turn declaration failed: explain why the current request commissions no durable data change.'
		);
		expect(client.from).not.toHaveBeenCalled();
		expect(access.getActorId).not.toHaveBeenCalled();
	});

	it('records a clarification as requiring user action without touching project data', async () => {
		const access = accessStub();
		const client = fakeSharedClient();
		const result = await adapterWith(client, access).execute(
			requestFor('request_turn_clarification', {
				reason: 'Multiple accessible tasks remain plausible targets.',
				question: 'Which matching task should I update?'
			})
		);

		expect(result).toMatchObject({
			result: {
				status: 'clarification_required',
				requires_user_action: true,
				question: 'Which matching task should I update?'
			},
			requiresUserAction: true
		});
		expect(client.from).not.toHaveBeenCalled();
		expect(access.getActorId).not.toHaveBeenCalled();
	});

	it('records a proposal revision and stamps the decision author on control results', async () => {
		const access = accessStub();
		const client = fakeSharedClient();
		const result = await adapterWith(client, access).execute({
			...requestFor('request_proposal_revision', {
				reason: 'The single update outcome lumps the Halcyon task into the completion set.',
				required_correction: 'Declare two outcomes: completions and the priority change.'
			}),
			decidedBy: 'contract_reviewer'
		});

		expect(result.result).toMatchObject({
			status: 'revision_required',
			decided_by: 'contract_reviewer',
			required_correction: 'Declare two outcomes: completions and the priority change.'
		});
		expect(result.requiresUserAction).toBe(false);
		expect(client.from).not.toHaveBeenCalled();
		expect(access.getActorId).not.toHaveBeenCalled();
	});

	it('rejects a proposal revision without an actionable correction', async () => {
		await expect(
			adapterWith(fakeSharedClient(), accessStub()).execute(
				requestFor('request_proposal_revision', { reason: 'Vague.' })
			)
		).rejects.toThrow('Proposal revision failed');
	});

	it('does not stamp an author on ordinary reads or unattributed control calls', async () => {
		const access = accessStub();
		const client = fakeSharedClient();
		const result = await adapterWith(client, access).execute(
			requestFor('declare_read_only_turn', { reason: 'The user asked a question.' })
		);
		expect(result.result).not.toHaveProperty('decided_by');
	});

	it('records an independently bound turn-contract approval without touching project data', async () => {
		const access = accessStub();
		const client = fakeSharedClient();
		const contractSha256 = 'a'.repeat(64);
		const result = await adapterWith(client, access).execute(
			requestFor('approve_turn_contract_review', {
				reason: 'The exact target and requested value are unambiguous.',
				contract_sha256: contractSha256
			})
		);

		expect(result.result).toMatchObject({
			status: 'turn_contract_review_approved',
			contract_sha256: contractSha256
		});
		expect(client.from).not.toHaveBeenCalled();
		expect(access.getActorId).not.toHaveBeenCalled();
	});

	it('records an independently bound mutation-batch approval without touching project data', async () => {
		const access = accessStub();
		const client = fakeSharedClient();
		const batchSha256 = 'b'.repeat(64);
		const result = await adapterWith(client, access).execute(
			requestFor('approve_mutation_batch_review', {
				reason: 'Every exact target and value is within the approved commission.',
				batch_sha256: batchSha256
			})
		);

		expect(result.result).toMatchObject({
			status: 'mutation_batch_review_approved',
			batch_sha256: batchSha256
		});
		expect(client.from).not.toHaveBeenCalled();
		expect(access.getActorId).not.toHaveBeenCalled();
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
			affectedEntities: [],
			toolCategory: 'read',
			resultCount: null,
			zeroResult: null,
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

	it('dispatches newly shared detail reads without a web gateway', async () => {
		const riskId = '22222222-0000-4000-8000-000000000022';
		const riskRow = {
			id: riskId,
			project_id: PROJECT_ID,
			title: 'Launch slips',
			state_key: 'open',
			impact: 'high',
			search_vector: "'launch':1",
			project: { id: PROJECT_ID, name: '9takes' }
		};
		const access = accessStub();
		const client = fakeSharedClient({ onto_risks: [riskRow] });
		const adapter = adapterWith(client, access);

		await expect(
			adapter.execute(requestFor('get_onto_risk_details', { risk_id: riskId }))
		).resolves.toMatchObject({
			result: {
				risk: {
					id: riskId,
					project_id: PROJECT_ID,
					title: 'Launch slips',
					project: { name: '9takes' }
				},
				message: 'Complete ontology risk details loaded.'
			},
			toolCategory: 'read',
			resultCount: null,
			zeroResult: null
		});
		expect(access.assertProjectAccess).toHaveBeenCalledWith(PROJECT_ID, 'read');
		expect(client.from).toHaveBeenCalledTimes(2);
	});

	it('dispatches task details with project-fenced assignee hydration', async () => {
		const taskId = '33333333-0000-4000-8000-000000000033';
		const taskRow = {
			id: taskId,
			project_id: PROJECT_ID,
			title: 'Ship task details',
			state_key: 'todo',
			project: { id: PROJECT_ID, created_by: ACTOR_ID }
		};
		const client = fakeSharedClient({
			onto_tasks: [taskRow],
			onto_edges: [],
			onto_task_assignees: [
				{
					task_id: taskId,
					created_at: '2026-08-08T12:00:00.000Z',
					assignee: {
						id: ACTOR_ID,
						user_id: USER_ID,
						name: 'Avery',
						email: 'avery@example.com'
					}
				}
			]
		});
		const access = accessStub();
		const adapter = adapterWith(client, access);

		await expect(
			adapter.execute(requestFor('get_onto_task_details', { task_id: taskId }))
		).resolves.toMatchObject({
			result: {
				task: {
					id: taskId,
					project_id: PROJECT_ID,
					assignees: [{ actor_id: ACTOR_ID, name: 'Avery' }]
				},
				linkedEntities: {
					plans: [],
					goals: [],
					milestones: [],
					documents: [],
					dependentTasks: []
				},
				message: 'Complete ontology task details loaded.'
			},
			toolCategory: 'read'
		});
		expect(access.assertProjectAccess).toHaveBeenCalledWith(PROJECT_ID, 'read');
	});

	it('dispatches task document reads without the web route', async () => {
		const taskId = '44444444-0000-4000-8000-000000000044';
		const client = fakeSharedClient({
			onto_tasks: [{ id: taskId, project_id: PROJECT_ID }],
			onto_edges: []
		});
		const access = accessStub();
		const adapter = adapterWith(client, access);

		await expect(
			adapter.execute(requestFor('list_task_documents', { task_id: taskId }))
		).resolves.toMatchObject({
			result: {
				documents: [],
				scratch_pad: null,
				message: 'Found 0 documents linked to this task.'
			},
			toolCategory: 'search'
		});
		expect(access.assertProjectAccess).toHaveBeenCalledWith(PROJECT_ID, 'read');
	});

	it('dispatches document tree reads without the web route', async () => {
		const client = fakeSharedClient({
			onto_projects: [
				{
					id: PROJECT_ID,
					doc_structure: {
						version: 1,
						root: [{ id: 'doc-1', order: 0, title: 'Project Brief' }]
					}
				}
			]
		});
		const access = accessStub();
		const adapter = adapterWith(client, access);

		await expect(
			adapter.execute(
				requestFor('get_document_tree', {
					project_id: PROJECT_ID,
					include_documents: false
				})
			)
		).resolves.toMatchObject({
			result: {
				structure: {
					version: 1,
					root: [{ id: 'doc-1', order: 0, title: 'Project Brief' }]
				},
				documents: {},
				unlinked: [],
				message:
					'Document tree loaded with 1 nodes. Unlinked documents not included (set include_documents=true to list them).'
			},
			toolCategory: 'read'
		});
		expect(access.assertProjectAccess).toHaveBeenCalledWith(PROJECT_ID, 'read');
	});

	it('dispatches cross-project search without the web route', async () => {
		const client = {
			...fakeSharedClient(),
			rpc: vi.fn(async (fn: string) => {
				if (fn === 'onto_search_entities') {
					return {
						data: [
							{
								type: 'task',
								id: 'task-1',
								project_id: PROJECT_ID,
								project_name: '9takes',
								title: 'Launch checklist',
								score: 0.9,
								state_key: 'in_progress'
							}
						],
						error: null
					};
				}
				throw new Error(`Unexpected rpc: ${fn}`);
			})
		};
		const access = accessStub();
		const adapter = adapterWith(client, access);

		await expect(
			adapter.execute(
				requestFor('search_all_projects', {
					query: 'launch',
					types: ['task']
				})
			)
		).resolves.toMatchObject({
			result: {
				search_scope: 'workspace',
				total_returned: 1,
				results: [{ type: 'task', id: 'task-1', title: 'Launch checklist' }],
				materialized_tools: ['get_onto_task_details', 'list_task_documents']
			},
			toolCategory: 'search',
			resultCount: 1,
			zeroResult: false
		});
		expect(client.rpc).toHaveBeenCalledWith(
			'onto_search_entities',
			expect.objectContaining({
				p_actor_id: ACTOR_ID,
				p_query: 'launch',
				p_types: ['task']
			})
		);
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

		for (const toolName of ['update_onto_project', 'domain_search', 'constructor']) {
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
