// apps/worker/tests/agenticChatReadOnlyProvider.test.ts

import {
	AGENTIC_CHAT_INPUT_ARTIFACT_VERSION,
	type AgenticChatTurnClaimResultV1,
	type JsonObject,
	type TurnInputArtifactV1
} from '@buildos/shared-types';
import { describe, expect, it, vi } from 'vitest';
import type { AgenticChatWorkerExecutionInputV1 } from '../src/workers/agentic-chat/executionInput';
import {
	AgenticChatProviderExecutionError,
	type AgenticChatProviderMutationSynthesisInputV1,
	type AgenticChatProviderReadSynthesisInputV1,
	type AgenticChatProviderStepV1
} from '../src/workers/agentic-chat/providerContract';
import { createStableAgenticChatMutationLogicalOperationIdV1 } from '../src/workers/agentic-chat/effectIdentity';
import { AgenticChatProviderCapacity } from '../src/workers/agentic-chat/providerCapacity';
import { createStableAgenticChatReadToolTransitionIdV1 } from '../src/workers/agentic-chat/readToolIdentity';
import {
	AgenticChatReadOnlyProviderAdapter,
	type AgenticChatReadOnlyProviderClientEventV1
} from '../src/workers/agentic-chat/readOnlyProvider';

const USER_ID = '10000000-0000-4000-8000-000000000001';
const SESSION_ID = '20000000-0000-4000-8000-000000000002';
const TURN_RUN_ID = '30000000-0000-4000-8000-000000000003';
const QUEUE_JOB_ID = '40000000-0000-4000-8000-000000000004';
const PROCESSING_TOKEN = '90000000-0000-4000-8000-000000000009';

function executionInput(
	overrides: Partial<AgenticChatWorkerExecutionInputV1> = {}
): AgenticChatWorkerExecutionInputV1 {
	const claim = {
		outcome: 'claimed',
		executionMayStart: true,
		turnRunId: TURN_RUN_ID,
		queueJobId: QUEUE_JOB_ID,
		sessionId: SESSION_ID,
		userId: USER_ID,
		correlationId: '50000000-0000-4000-8000-000000000005',
		executionGeneration: 1,
		status: 'running',
		inputArtifactId: '60000000-0000-4000-8000-000000000006',
		userMessageId: '70000000-0000-4000-8000-000000000007'
	} satisfies Extract<
		AgenticChatTurnClaimResultV1,
		{ outcome: 'claimed' | 'matching_current_claim' }
	>;
	const artifact = {
		artifactVersion: 'agentic_chat_input_v2',
		historySource: 'admission_window',
		history: [
			{
				sourceMessageId: '80000000-0000-4000-8000-000000000008',
				role: 'assistant',
				content: 'Frozen reply',
				attachments: [],
				toolCalls: [],
				toolCallId: null
			}
		],
		prepared: {
			sourcePreparedPromptId: null,
			contextPayload: {},
			conversationSummary: null,
			surfaceProfile: 'project_default',
			systemPrompt: 'System prompt\n',
			promptSections: [],
			toolSurface: {}
		},
		createdAt: '2026-08-03T12:00:00.000Z',
		retainUntil: '2026-08-10T12:00:00.000Z',
		contentHash: '0'.repeat(64)
	} satisfies TurnInputArtifactV1;
	return {
		claim,
		streamRunId: 'stream-run-1',
		clientTurnId: 'client-turn-1',
		requestPayload: {
			clientTurnId: 'client-turn-1',
			streamRunId: 'stream-run-1',
			message: 'Current request',
			attachments: [],
			context: { type: 'project', entityId: 'project-1', projectId: 'project-1' }
		},
		timingBaseline: {
			admittedAt: '2026-08-03T11:59:57.000Z',
			startedAt: '2026-08-03T11:59:58.000Z',
			workerStartedAt: '2026-08-03T11:59:59.000Z',
			executionStartedAt: null,
			historyCutoffAt: '2026-08-03T11:59:58.000Z',
			requestPrewarmedContext: false,
			cacheSource: 'not_requested',
			cacheAgeSeconds: null,
			historyStrategy: 'raw_history',
			historyCompressed: false,
			rawHistoryCount: 1,
			historyForModelCount: 1,
			preparedPromptId: null,
			preparedPromptHit: false,
			preparedPromptMissReason: null,
			preparedSurfaceProfile: null
		},
		artifact,
		...overrides
	};
}

function clientWith(events: AgenticChatReadOnlyProviderClientEventV1[]) {
	return {
		stream: vi.fn(() =>
			(async function* () {
				for (const event of events) yield event;
			})()
		)
	};
}

function readToolDefinition(name: string, description = `Read with ${name}.`) {
	return {
		type: 'function' as const,
		function: {
			name,
			description,
			parameters: {
				type: 'object',
				properties: { marker: { type: 'string', description: name } }
			}
		}
	};
}

function updateTaskToolDefinition() {
	return {
		type: 'function' as const,
		function: {
			name: 'update_onto_task',
			description: 'Update a task.',
			parameters: {
				type: 'object',
				required: ['task_id'],
				properties: {
					task_id: { type: 'string' },
					state_key: { type: 'string' },
					assignee_actor_ids: { type: 'array', items: { type: 'string' } },
					assignee_handles: { type: 'array', items: { type: 'string' } },
					goal_id: { type: ['string', 'null'] },
					supporting_milestone_id: { type: ['string', 'null'] }
				}
			}
		}
	};
}

function createTaskToolDefinition() {
	return {
		type: 'function' as const,
		function: {
			name: 'create_onto_task',
			description: 'Create a task.',
			parameters: {
				type: 'object',
				required: ['project_id', 'title'],
				properties: {
					project_id: { type: 'string' },
					title: { type: 'string' },
					assignee_actor_ids: { type: 'array', items: { type: 'string' } },
					plan_id: { type: 'string' },
					supporting_milestone_id: { type: 'string' },
					parent: { type: 'object' },
					archived: { type: 'boolean' }
				}
			}
		}
	};
}

function createDocumentToolDefinition() {
	return {
		type: 'function' as const,
		function: {
			name: 'create_onto_document',
			description: 'Create a document.',
			parameters: {
				type: 'object',
				required: ['project_id', 'title', 'description'],
				properties: {
					project_id: { type: 'string' },
					title: { type: 'string' },
					description: { type: 'string' },
					type_key: { type: 'string' },
					state_key: { type: 'string' },
					content: { type: 'string' },
					props: { type: 'object' },
					parent_id: { type: ['string', 'null'] },
					position: { type: 'number' }
				}
			}
		}
	};
}

async function collect(stream: AsyncIterable<AgenticChatProviderStepV1>) {
	const result: AgenticChatProviderStepV1[] = [];
	for await (const step of stream) result.push(step);
	return result;
}

function durableReadFeedback(
	providerToolCallId: string,
	argumentsValue: JsonObject = {},
	result: JsonObject = { ok: true }
): AgenticChatProviderReadSynthesisInputV1 {
	return {
		providerToolCallId,
		toolName: 'get_project_overview',
		arguments: argumentsValue,
		execution: {
			result,
			executionTimeMs: 1,
			tokensConsumed: null,
			affectedEntities: [],
			toolCategory: 'utility',
			resultCount: 1,
			zeroResult: false,
			requiresUserAction: false
		}
	};
}

function durableMutationFeedback(input: {
	providerToolCallId: string;
	logicalOperationId: string;
	arguments: JsonObject;
}): AgenticChatProviderMutationSynthesisInputV1 {
	return {
		providerToolCallId: input.providerToolCallId,
		toolName: 'update_onto_task',
		arguments: input.arguments,
		execution: {
			result: { message: 'Task updated successfully.' },
			executionTimeMs: null,
			tokensConsumed: null,
			affectedEntities: [],
			toolCategory: 'ontology_action',
			resultCount: null,
			zeroResult: null,
			requiresUserAction: false
		},
		mutation: {
			effectId: 'a3000000-0000-4000-8000-00000000003a',
			logicalOperationId: input.logicalOperationId,
			operationName: 'onto.task.update',
			replayed: false
		}
	};
}

function executionInputWithReadSurface(
	definitions = [readToolDefinition('get_project_overview')],
	toolNames = definitions.map((definition) => definition.function.name)
): AgenticChatWorkerExecutionInputV1 {
	const input = executionInput();
	return {
		...input,
		artifact: {
			...input.artifact,
			prepared: {
				...input.artifact.prepared,
				toolSurface: {
					surfaceProfile: 'project_default',
					toolNames,
					definitions
				}
			}
		}
	};
}

function providerReadRound(
	providerToolCallId: string,
	args: JsonObject,
	toolName = 'get_project_overview',
	usage?: { promptTokens: number; completionTokens: number; totalTokens: number }
): AgenticChatReadOnlyProviderClientEventV1[] {
	return [
		{
			type: 'tool_call',
			toolCall: [
				{
					index: 0,
					id: providerToolCallId,
					type: 'function',
					function: { name: toolName, arguments: JSON.stringify(args) }
				}
			]
		},
		{ type: 'done', finishedReason: 'tool_calls', ...(usage ? { usage } : {}) }
	];
}

describe('AgenticChatReadOnlyProviderAdapter', () => {
	it('reserves before start and defers the first client call until stream', async () => {
		const client = clientWith([
			{ type: 'reasoning', reasoning: 'private chain' },
			{ type: 'text', content: 'Visible answer' },
			{
				type: 'done',
				finishedReason: 'stop',
				usage: { prompt_tokens: 8, completion_tokens: 2, total_tokens: 10 }
			}
		]);
		const capacity = new AgenticChatProviderCapacity({ configured: true, concurrency: 1 });
		const adapter = new AgenticChatReadOnlyProviderAdapter({ client, capacity });
		const signal = new AbortController().signal;

		const invocation = await adapter.prepare({
			executionInput: executionInput(),
			processingToken: PROCESSING_TOKEN,
			signal
		});
		expect(client.stream).not.toHaveBeenCalled();
		expect(capacity.getSnapshot()).toMatchObject({ available: false, activeRequests: 1 });
		expect(invocation.promptSnapshot).toMatchObject({
			snapshotVersion: 'agentic_chat_worker_prompt_v1',
			modelMessages: [
				{ role: 'system', content: 'System prompt\n' },
				{ role: 'assistant', content: 'Frozen reply' },
				{ role: 'user', content: 'Current request' }
			],
			systemPromptChars: 14,
			messageChars: 41,
			approxPromptTokens: 11
		});
		expect(invocation.promptSnapshot?.systemPromptSha256).toMatch(/^[0-9a-f]{64}$/);
		expect(invocation.promptSnapshot?.messagesSha256).toMatch(/^[0-9a-f]{64}$/);

		await expect(collect(invocation.stream())).resolves.toEqual([
			{ type: 'text_delta', text: 'Visible answer' },
			{
				type: 'finish',
				finishedReason: 'stop',
				usage: { promptTokens: 8, completionTokens: 2, totalTokens: 10 }
			}
		]);
		expect(client.stream).toHaveBeenCalledWith({
			messages: [
				{ role: 'system', content: 'System prompt\n' },
				{ role: 'assistant', content: 'Frozen reply' },
				{ role: 'user', content: 'Current request' }
			],
			tools: [],
			toolChoice: 'none',
			userId: USER_ID,
			sessionId: SESSION_ID,
			turnRunId: TURN_RUN_ID,
			streamRunId: 'stream-run-1',
			clientTurnId: 'client-turn-1',
			contextType: 'project',
			entityId: 'project-1',
			projectId: 'project-1',
			queueJobId: QUEUE_JOB_ID,
			processingToken: PROCESSING_TOKEN,
			executionGeneration: 1,
			providerRound: 'initial',
			signal
		});
		expect(capacity.getSnapshot()).toMatchObject({ available: true, activeRequests: 0 });
	});

	it('rejects attachment and tool-call surfaces while always releasing capacity', async () => {
		const client = clientWith([{ type: 'tool_call', toolCall: { name: 'mutate' } }]);
		const capacity = new AgenticChatProviderCapacity({ configured: true, concurrency: 1 });
		const adapter = new AgenticChatReadOnlyProviderAdapter({ client, capacity });
		const invalid = executionInput({
			requestPayload: {
				message: 'Current request',
				attachments: [{ id: 'attachment-1' }],
				context: { type: 'project' }
			}
		});

		await expect(
			adapter.prepare({
				executionInput: invalid,
				processingToken: PROCESSING_TOKEN,
				signal: new AbortController().signal
			})
		).rejects.toMatchObject({ code: 'attachments_disabled', failureClass: 'permanent' });
		expect(client.stream).not.toHaveBeenCalled();
		expect(capacity.getSnapshot().available).toBe(true);

		const invocation = await adapter.prepare({
			executionInput: executionInput(),
			processingToken: PROCESSING_TOKEN,
			signal: new AbortController().signal
		});
		await expect(collect(invocation.stream())).rejects.toMatchObject({
			code: 'provider_tool_call_disabled',
			failureClass: 'permanent'
		});
		expect(capacity.getSnapshot()).toMatchObject({ available: true, activeRequests: 0 });

		const finishToolCall = new AgenticChatReadOnlyProviderAdapter({
			client: clientWith([{ type: 'done', finishedReason: 'tool_calls' }]),
			capacity
		});
		const finishInvocation = await finishToolCall.prepare({
			executionInput: executionInput(),
			processingToken: PROCESSING_TOKEN,
			signal: new AbortController().signal
		});
		await expect(collect(finishInvocation.stream())).rejects.toMatchObject({
			code: 'provider_tool_call_disabled',
			failureClass: 'permanent'
		});
		expect(capacity.getSnapshot()).toMatchObject({ available: true, activeRequests: 0 });
	});

	it('runs one allowlisted read round and synthesizes only from the durable feedback', async () => {
		const streams: AgenticChatReadOnlyProviderClientEventV1[][] = [
			[
				{
					type: 'tool_call',
					toolCall: [
						{
							index: 0,
							id: 'provider-read-1',
							type: 'function',
							function: {
								name: 'get_project_',
								arguments: '{"project_id":"40000000-0000-4000-8000-000000000004"'
							}
						}
					]
				},
				{
					type: 'tool_call',
					toolCall: [
						{
							index: 0,
							function: { name: 'overview', arguments: '}' }
						}
					]
				},
				{
					type: 'done',
					finishedReason: 'tool_calls',
					usage: { promptTokens: 7, completionTokens: 1, totalTokens: 8 }
				}
			],
			[
				{ type: 'text', content: 'The project is ready.' },
				{
					type: 'done',
					finishedReason: 'stop',
					usage: { promptTokens: 10, completionTokens: 3, totalTokens: 13 }
				}
			]
		];
		const client = {
			stream: vi.fn(() => {
				const events = streams.shift() ?? [];
				return (async function* () {
					for (const event of events) yield event;
				})();
			})
		};
		const capacity = new AgenticChatProviderCapacity({ configured: true, concurrency: 1 });
		const adapter = new AgenticChatReadOnlyProviderAdapter({ client, capacity });
		const invocation = await adapter.prepare({
			executionInput: executionInputWithReadSurface(),
			processingToken: PROCESSING_TOKEN,
			signal: new AbortController().signal
		});

		const initial = await collect(invocation.stream());
		expect(initial).toEqual([
			{
				type: 'semantic',
				transitionId: createStableAgenticChatReadToolTransitionIdV1({
					turnRunId: TURN_RUN_ID,
					providerToolCallId: 'provider-read-1',
					stage: 'planning'
				}),
				phase: 'stream',
				eventType: 'agent_state',
				currentActivity: 'Planning the first step...',
				eventPayload: {
					type: 'agent_state',
					state: 'thinking',
					contextType: 'project',
					details: 'Planning the first step...',
					activity_visibility: 'activity_log'
				}
			},
			expect.objectContaining({
				type: 'read_tool',
				providerToolCallId: 'provider-read-1',
				toolName: 'get_project_overview',
				arguments: { project_id: '40000000-0000-4000-8000-000000000004' }
			})
		]);
		expect(capacity.getSnapshot()).toMatchObject({ available: false, activeRequests: 1 });

		const feedback = {
			providerToolCallId: 'provider-read-1',
			toolName: 'get_project_overview',
			arguments: { project_id: '40000000-0000-4000-8000-000000000004' },
			execution: {
				result: { project: { id: '40000000-0000-4000-8000-000000000004' } },
				executionTimeMs: 12,
				tokensConsumed: null,
				affectedEntities: [],
				toolCategory: 'utility',
				resultCount: 1,
				zeroResult: false,
				requiresUserAction: false
			}
		};
		await expect(collect(invocation.synthesize!(feedback))).resolves.toEqual([
			{ type: 'text_delta', text: 'The project is ready.' },
			{
				type: 'finish',
				finishedReason: 'stop',
				usage: { promptTokens: 17, completionTokens: 4, totalTokens: 21 }
			}
		]);
		expect(client.stream).toHaveBeenCalledTimes(2);
		expect(client.stream.mock.calls[0]?.[0]).toMatchObject({
			toolChoice: 'auto',
			tools: [
				expect.objectContaining({
					function: expect.objectContaining({ name: 'get_project_overview' })
				})
			]
		});
		expect(client.stream.mock.calls[1]?.[0]).toMatchObject({
			toolChoice: 'none',
			tools: [],
			messages: expect.arrayContaining([
				expect.objectContaining({ role: 'assistant', tool_calls: [expect.any(Object)] }),
				{
					role: 'tool',
					content: '{"project":{"id":"40000000-0000-4000-8000-000000000004"}}',
					tool_call_id: 'provider-read-1'
				}
			])
		});
		expect(capacity.getSnapshot()).toMatchObject({ available: true, activeRequests: 0 });
	});

	it('streams a direct answer immediately even when the read tool is available', async () => {
		const client = clientWith([
			{ type: 'text', content: 'No project lookup is needed.' },
			{
				type: 'done',
				finishedReason: 'stop',
				usage: { promptTokens: 8, completionTokens: 5, totalTokens: 13 }
			}
		]);
		const capacity = new AgenticChatProviderCapacity({ configured: true, concurrency: 1 });
		const adapter = new AgenticChatReadOnlyProviderAdapter({ client, capacity });
		const invocation = await adapter.prepare({
			executionInput: executionInputWithReadSurface(),
			processingToken: PROCESSING_TOKEN,
			signal: new AbortController().signal
		});

		await expect(collect(invocation.stream())).resolves.toEqual([
			{ type: 'text_delta', text: 'No project lookup is needed.' },
			{
				type: 'finish',
				finishedReason: 'stop',
				usage: { promptTokens: 8, completionTokens: 5, totalTokens: 13 }
			}
		]);
		expect(client.stream).toHaveBeenCalledWith(
			expect.objectContaining({ toolChoice: 'auto', tools: [expect.any(Object)] })
		);
		expect(capacity.getSnapshot()).toMatchObject({ available: true, activeRequests: 0 });
	});

	it('offers the artifact surface intersected with the shared read allowlist', async () => {
		const workspace = readToolDefinition('get_workspace_overview', 'Workspace schema.');
		const project = readToolDefinition('get_project_overview', 'Project schema.');
		const tasks = readToolDefinition('list_onto_tasks', 'Task-list schema.');
		const excludedWrite = readToolDefinition('update_onto_project', 'Write schema.');
		const reviewedButDisabledWrite = updateTaskToolDefinition();
		const absentFromNames = readToolDefinition('get_field_info', 'Field schema.');
		const duplicateProject = readToolDefinition('get_project_overview', 'Duplicate schema.');
		const client = clientWith([
			{ type: 'text', content: 'No lookup is needed.' },
			{ type: 'done', finishedReason: 'stop' }
		]);
		const capacity = new AgenticChatProviderCapacity({ configured: true, concurrency: 1 });
		const adapter = new AgenticChatReadOnlyProviderAdapter({ client, capacity });
		const invocation = await adapter.prepare({
			executionInput: executionInputWithReadSurface(
				[
					workspace,
					excludedWrite,
					reviewedButDisabledWrite,
					project,
					absentFromNames,
					duplicateProject,
					tasks
				],
				[
					'get_workspace_overview',
					'update_onto_project',
					'update_onto_task',
					'get_project_overview',
					'list_onto_tasks'
				]
			),
			processingToken: PROCESSING_TOKEN,
			signal: new AbortController().signal
		});

		await collect(invocation.stream());
		expect(client.stream).toHaveBeenCalledWith(
			expect.objectContaining({
				toolChoice: 'auto',
				tools: [workspace, project, tasks]
			})
		);
	});

	it('bridges an explicitly enabled mixed read/write round in provider order', async () => {
		const taskId = 'db000000-0000-4000-8000-000000000002';
		const mutationArguments = { task_id: taskId, state_key: 'in_progress' };
		const logicalOperationId = createStableAgenticChatMutationLogicalOperationIdV1({
			turnRunId: TURN_RUN_ID,
			providerRound: 1,
			callIndex: 2
		});
		const streams: AgenticChatReadOnlyProviderClientEventV1[][] = [
			[
				{
					type: 'tool_call',
					toolCall: [
						{
							index: 0,
							id: 'provider-read-before-write',
							type: 'function',
							function: {
								name: 'get_project_overview',
								arguments: `{"marker":"before","project_id":"${QUEUE_JOB_ID}"}`
							}
						},
						{
							index: 1,
							id: 'provider-update-task',
							type: 'function',
							function: {
								name: 'update_onto_task',
								arguments: JSON.stringify(mutationArguments)
							}
						}
					]
				},
				{ type: 'done', finishedReason: 'tool_calls' }
			],
			[
				{ type: 'text', content: 'The task is now in progress.' },
				{ type: 'done', finishedReason: 'stop' }
			]
		];
		const client = {
			stream: vi.fn(() => {
				const events = streams.shift() ?? [];
				return (async function* () {
					for (const event of events) yield event;
				})();
			})
		};
		const capacity = new AgenticChatProviderCapacity({ configured: true, concurrency: 1 });
		const adapter = new AgenticChatReadOnlyProviderAdapter({ client, capacity }, 2_000, 16, {
			createOntoTask: false,
			updateOntoTask: true
		});
		const readDefinition = readToolDefinition('get_project_overview');
		const updateDefinition = updateTaskToolDefinition();
		const invocation = await adapter.prepare({
			executionInput: executionInputWithReadSurface(
				[readDefinition, updateDefinition],
				['get_project_overview', 'update_onto_task']
			),
			processingToken: PROCESSING_TOKEN,
			signal: new AbortController().signal
		});

		const firstRound = await collect(invocation.stream());
		expect(firstRound).toEqual([
			expect.objectContaining({ type: 'semantic', eventType: 'agent_state' }),
			expect.objectContaining({
				type: 'read_tool',
				providerToolCallId: 'provider-read-before-write'
			}),
			expect.objectContaining({
				type: 'mutating_tool',
				providerToolCallId: 'provider-update-task',
				logicalOperationId,
				operationName: 'onto.task.update',
				downstreamIdempotencySupported: false
			})
		]);
		expect(client.stream.mock.calls[0]?.[0].tools).toEqual([
			readDefinition,
			{
				...updateDefinition,
				function: {
					...updateDefinition.function,
					parameters: {
						...updateDefinition.function.parameters,
						additionalProperties: false,
						properties: {
							task_id: { type: 'string' },
							state_key: { type: 'string' },
							assignee_actor_ids: { type: 'array', items: { type: 'string' } },
							assignee_handles: { type: 'array', items: { type: 'string' } },
							goal_id: { type: ['string', 'null'] },
							supporting_milestone_id: { type: ['string', 'null'] }
						},
						required: ['task_id']
					}
				}
			}
		]);

		invocation.invalidateReadMemo?.();
		await expect(
			collect(
				invocation.continueWithToolResults!({
					round: 2,
					results: [
						durableReadFeedback('provider-read-before-write', {
							marker: 'before',
							project_id: QUEUE_JOB_ID
						}),
						durableMutationFeedback({
							providerToolCallId: 'provider-update-task',
							logicalOperationId,
							arguments: mutationArguments
						})
					]
				})
			)
		).resolves.toEqual([
			{ type: 'text_delta', text: 'The task is now in progress.' },
			{ type: 'finish', finishedReason: 'stop', usage: null }
		]);
		const continuationMessages = client.stream.mock.calls[1]?.[0].messages;
		expect(continuationMessages.at(-3)?.tool_calls?.map((call) => call.id)).toEqual([
			'provider-read-before-write',
			'provider-update-task'
		]);
		expect(continuationMessages.slice(-2).map((message) => message.tool_call_id)).toEqual([
			'provider-read-before-write',
			'provider-update-task'
		]);
	});

	it('projects create_onto_task as a downstream-idempotent mutation only when enabled', async () => {
		const projectId = 'db000000-0000-4000-8000-000000000003';
		const definition = createTaskToolDefinition();
		const client = clientWith([
			{
				type: 'tool_call',
				toolCall: [
					{
						index: 0,
						id: 'provider-create-task',
						type: 'function',
						function: {
							name: 'create_onto_task',
							arguments: JSON.stringify({ project_id: projectId, title: 'New task' })
						}
					}
				]
			},
			{ type: 'done', finishedReason: 'tool_calls' }
		]);
		const adapter = new AgenticChatReadOnlyProviderAdapter(
			{
				client,
				capacity: new AgenticChatProviderCapacity({ configured: true, concurrency: 1 })
			},
			2_000,
			16,
			{ createOntoTask: true, updateOntoTask: false }
		);
		const invocation = await adapter.prepare({
			executionInput: executionInputWithReadSurface([definition], ['create_onto_task']),
			processingToken: PROCESSING_TOKEN,
			signal: new AbortController().signal
		});

		await expect(collect(invocation.stream())).resolves.toEqual([
			expect.objectContaining({ type: 'semantic', eventType: 'agent_state' }),
			expect.objectContaining({
				type: 'mutating_tool',
				providerToolCallId: 'provider-create-task',
				operationName: 'onto.task.create',
				downstreamIdempotencySupported: true
			})
		]);
		expect(client.stream.mock.calls[0]?.[0].tools).toEqual([
			{
				...definition,
				function: {
					...definition.function,
					parameters: {
						...definition.function.parameters,
						additionalProperties: false,
						properties: {
							project_id: { type: 'string' },
							title: { type: 'string' },
							assignee_actor_ids: { type: 'array', items: { type: 'string' } },
							plan_id: { type: 'string' },
							supporting_milestone_id: { type: 'string' },
							parent: { type: 'object' }
						},
						required: ['project_id', 'title']
					}
				}
			}
		]);
	});

	it('projects create_onto_document as one-attempt/uncertain with only reviewed fields', async () => {
		const projectId = 'db000000-0000-4000-8000-000000000004';
		const definition = createDocumentToolDefinition();
		const client = clientWith([
			{
				type: 'tool_call',
				toolCall: [
					{
						index: 0,
						id: 'provider-create-document',
						type: 'function',
						function: {
							name: 'create_onto_document',
							arguments: JSON.stringify({
								project_id: projectId,
								title: 'Decision log',
								description: 'Project decisions'
							})
						}
					}
				]
			},
			{ type: 'done', finishedReason: 'tool_calls' }
		]);
		const adapter = new AgenticChatReadOnlyProviderAdapter(
			{
				client,
				capacity: new AgenticChatProviderCapacity({ configured: true, concurrency: 1 })
			},
			2_000,
			16,
			{ createOntoDocument: true }
		);
		const invocation = await adapter.prepare({
			executionInput: executionInputWithReadSurface([definition], ['create_onto_document']),
			processingToken: PROCESSING_TOKEN,
			signal: new AbortController().signal
		});

		await expect(collect(invocation.stream())).resolves.toEqual([
			expect.objectContaining({ type: 'semantic', eventType: 'agent_state' }),
			expect.objectContaining({
				type: 'mutating_tool',
				providerToolCallId: 'provider-create-document',
				operationName: 'onto.document.create',
				downstreamIdempotencySupported: false
			})
		]);
		expect(client.stream.mock.calls[0]?.[0].tools).toEqual([
			{
				...definition,
				function: {
					...definition.function,
					parameters: {
						...definition.function.parameters,
						additionalProperties: false,
						properties: {
							project_id: { type: 'string' },
							title: { type: 'string' },
							description: { type: 'string' },
							type_key: { type: 'string' },
							state_key: { type: 'string' },
							content: { type: 'string' },
							parent_id: { type: ['string', 'null'] },
							position: { type: 'number' }
						},
						required: ['project_id', 'title', 'description']
					}
				}
			}
		]);
	});

	it('projects every straightforward entity mutation through its reviewed row-only surface', async () => {
		const reviewedFields = {
			update_onto_document: [
				'document_id',
				'title',
				'type_key',
				'state_key',
				'content',
				'description',
				'update_strategy',
				'merge_instructions',
				'props'
			],
			move_document_in_tree: ['project_id', 'document_id', 'new_parent_id', 'new_position'],
			create_task_document: ['task_id', 'document_id', 'role'],
			move_onto_task: [
				'task_id',
				'expected_source_project_id',
				'destination_project_id',
				'confirmation_token'
			],
			link_onto_entities: ['src_kind', 'src_id', 'dst_kind', 'dst_id', 'rel', 'props'],
			unlink_onto_edge: ['edge_id'],
			create_onto_goal: [
				'project_id',
				'name',
				'description',
				'type_key',
				'state_key',
				'target_date',
				'measurement_criteria',
				'priority',
				'props'
			],
			update_onto_goal: [
				'goal_id',
				'name',
				'description',
				'type_key',
				'state_key',
				'priority',
				'target_date',
				'measurement_criteria',
				'props'
			],
			create_onto_plan: [
				'project_id',
				'name',
				'description',
				'plan',
				'type_key',
				'state_key',
				'start_date',
				'end_date',
				'props'
			],
			update_onto_plan: [
				'plan_id',
				'name',
				'description',
				'plan',
				'type_key',
				'start_date',
				'end_date',
				'state_key',
				'props'
			],
			create_onto_milestone: [
				'project_id',
				'title',
				'goal_id',
				'due_at',
				'state_key',
				'description',
				'milestone'
			],
			update_onto_milestone: [
				'milestone_id',
				'title',
				'due_at',
				'state_key',
				'description',
				'props'
			],
			create_onto_risk: [
				'project_id',
				'title',
				'impact',
				'probability',
				'state_key',
				'content',
				'description',
				'mitigation_strategy'
			],
			update_onto_risk: [
				'risk_id',
				'title',
				'impact',
				'probability',
				'state_key',
				'content',
				'description',
				'mitigation_strategy',
				'owner',
				'props'
			],
			create_onto_project: ['project', 'entities', 'relationships'],
			update_onto_project: [
				'project_id',
				'name',
				'description',
				'state_key',
				'start_at',
				'end_at',
				'props'
			]
		} as const;
		const compoundFields = ['goal_id', 'milestone_id', 'parent', 'parents', 'connections'];
		const definitions = Object.entries(reviewedFields).map(([name, fields]) => ({
			type: 'function' as const,
			function: {
				name,
				description: `Mutate with ${name}.`,
				parameters: {
					type: 'object',
					required: [],
					properties: Object.fromEntries(
						[...new Set([...fields, ...compoundFields, 'props'])].map((field) => [
							field,
							field === 'update_strategy'
								? { type: 'string', enum: ['replace', 'append', 'merge_llm'] }
								: { type: 'string' }
						])
					)
				}
			}
		}));
		const client = clientWith([
			{
				type: 'tool_call',
				toolCall: [
					{
						index: 0,
						id: 'provider-update-document',
						type: 'function',
						function: {
							name: 'update_onto_document',
							arguments: JSON.stringify({
								document_id: 'db000000-0000-4000-8000-000000000004',
								title: 'Updated'
							})
						}
					},
					{
						index: 1,
						id: 'provider-attach-document',
						type: 'function',
						function: {
							name: 'create_task_document',
							arguments: JSON.stringify({
								task_id: 'db000000-0000-4000-8000-000000000005',
								document_id: 'db000000-0000-4000-8000-000000000004'
							})
						}
					},
					{
						index: 2,
						id: 'provider-link-edge',
						type: 'function',
						function: {
							name: 'link_onto_entities',
							arguments: JSON.stringify({
								src_kind: 'task',
								src_id: 'db000000-0000-4000-8000-000000000005',
								dst_kind: 'goal',
								dst_id: 'db000000-0000-4000-8000-000000000006',
								rel: 'supports_goal'
							})
						}
					},
					{
						index: 3,
						id: 'provider-update-project',
						type: 'function',
						function: {
							name: 'update_onto_project',
							arguments: JSON.stringify({
								project_id: 'db000000-0000-4000-8000-000000000001',
								state_key: 'active'
							})
						}
					},
					{
						index: 4,
						id: 'provider-move-task',
						type: 'function',
						function: {
							name: 'move_onto_task',
							arguments: JSON.stringify({
								task_id: 'db000000-0000-4000-8000-000000000005',
								expected_source_project_id: 'db000000-0000-4000-8000-000000000001',
								destination_project_id: 'db000000-0000-4000-8000-000000000002'
							})
						}
					}
				]
			},
			{ type: 'done', finishedReason: 'tool_calls' }
		]);
		const adapter = new AgenticChatReadOnlyProviderAdapter(
			{
				client,
				capacity: new AgenticChatProviderCapacity({ configured: true, concurrency: 1 })
			},
			2_000,
			16,
			{
				updateOntoDocument: true,
				moveDocumentInTree: true,
				createTaskDocument: true,
				linkOntoEntities: true,
				unlinkOntoEdge: true,
				moveOntoTask: true,
				createOntoGoal: true,
				updateOntoGoal: true,
				createOntoPlan: true,
				updateOntoPlan: true,
				createOntoMilestone: true,
				updateOntoMilestone: true,
				createOntoRisk: true,
				updateOntoRisk: true,
				createOntoProject: true,
				updateOntoProject: true
			}
		);
		const toolNames = Object.keys(reviewedFields);
		const invocation = await adapter.prepare({
			executionInput: executionInputWithReadSurface(definitions, toolNames),
			processingToken: PROCESSING_TOKEN,
			signal: new AbortController().signal
		});

		await expect(collect(invocation.stream())).resolves.toEqual([
			expect.objectContaining({ type: 'semantic', eventType: 'agent_state' }),
			expect.objectContaining({
				type: 'mutating_tool',
				operationName: 'onto.document.update',
				downstreamIdempotencySupported: false
			}),
			expect.objectContaining({
				type: 'mutating_tool',
				providerToolCallId: 'provider-attach-document',
				operationName: 'onto.task.docs.create_or_attach',
				downstreamIdempotencySupported: true
			}),
			expect.objectContaining({
				type: 'mutating_tool',
				providerToolCallId: 'provider-link-edge',
				operationName: 'onto.edge.link',
				downstreamIdempotencySupported: false
			}),
			expect.objectContaining({
				type: 'mutating_tool',
				providerToolCallId: 'provider-update-project',
				operationName: 'onto.project.update',
				downstreamIdempotencySupported: false
			}),
			expect.objectContaining({
				type: 'mutating_tool',
				providerToolCallId: 'provider-move-task',
				operationName: 'onto.task.move',
				downstreamIdempotencySupported: false
			})
		]);
		const projected = client.stream.mock.calls[0]?.[0].tools ?? [];
		for (const [name, fields] of Object.entries(reviewedFields)) {
			const definition = projected.find((entry) => entry.function.name === name);
			expect(definition?.function.parameters.additionalProperties).toBe(false);
			expect(Object.keys(definition?.function.parameters.properties ?? {}).sort()).toEqual(
				[...fields].sort()
			);
		}
		const updateDocument = projected.find(
			(entry) => entry.function.name === 'update_onto_document'
		);
		expect(updateDocument?.function.parameters.properties.update_strategy).toMatchObject({
			enum: ['replace', 'append'],
			default: 'replace'
		});
		expect(
			projected.find((entry) => entry.function.name === 'create_onto_milestone')?.function
				.parameters.required
		).toEqual(['project_id', 'title', 'goal_id']);
		expect(
			projected.find((entry) => entry.function.name === 'create_onto_risk')?.function
				.parameters.required
		).toEqual(['project_id', 'title', 'impact']);
		expect(
			projected.find((entry) => entry.function.name === 'create_task_document')?.function
				.parameters.required
		).toEqual(['task_id', 'document_id']);
		expect(
			projected.find((entry) => entry.function.name === 'move_document_in_tree')?.function
				.description
		).toContain('Parent-by-title creation is not available');
		expect(
			projected.find((entry) => entry.function.name === 'create_task_document')?.function
				.description
		).toContain('does not create a new document');
		expect(
			projected.find((entry) => entry.function.name === 'link_onto_entities')?.function
				.parameters.required
		).toEqual(['src_kind', 'src_id', 'dst_kind', 'dst_id', 'rel']);
		expect(
			projected.find((entry) => entry.function.name === 'link_onto_entities')?.function
				.parameters.properties.src_kind
		).toMatchObject({
			enum: ['plan', 'goal', 'milestone', 'task', 'document', 'risk', 'metric', 'source']
		});
		expect(
			projected.find((entry) => entry.function.name === 'unlink_onto_edge')?.function
				.parameters.required
		).toEqual(['edge_id']);
		expect(
			projected.find((entry) => entry.function.name === 'create_onto_project')?.function
				.parameters.required
		).toEqual(['project', 'entities', 'relationships']);
		expect(
			projected.find((entry) => entry.function.name === 'create_onto_project')?.function
				.parameters.properties.entities
		).toMatchObject({ maxItems: 0 });
		expect(
			projected.find((entry) => entry.function.name === 'create_onto_project')?.function
				.description
		).toContain('standard project shell');
		expect(
			projected.find((entry) => entry.function.name === 'update_onto_project')?.function
				.parameters.required
		).toEqual(['project_id']);
		expect(
			projected.find((entry) => entry.function.name === 'move_onto_task')?.function.parameters
				.required
		).toEqual(['task_id', 'expected_source_project_id', 'destination_project_id']);
		expect(
			projected.find((entry) => entry.function.name === 'move_onto_task')?.function.parameters
				.properties.confirmation_token
		).toMatchObject({ minLength: 1, maxLength: 128 });
		expect(
			projected.find((entry) => entry.function.name === 'move_onto_task')?.function
				.description
		).toContain('later turn');
	});

	it('continues sequential read rounds with compacted durable feedback', async () => {
		const streams: AgenticChatReadOnlyProviderClientEventV1[][] = [
			[
				{ type: 'text', content: 'Let me check the first source.' },
				{
					type: 'tool_call',
					toolCall: [
						{
							index: 0,
							id: 'provider-read-1',
							type: 'function',
							function: {
								name: 'get_project_overview',
								arguments: '{"project_id":"40000000-0000-4000-8000-000000000004"}'
							}
						}
					]
				},
				{
					type: 'done',
					finishedReason: 'tool_calls',
					usage: { promptTokens: 7, completionTokens: 1, totalTokens: 8 }
				}
			],
			[
				{ type: 'text', content: 'I need one more detail.' },
				{
					type: 'tool_call',
					toolCall: [
						{
							index: 0,
							id: 'provider-read-2',
							type: 'function',
							function: {
								name: 'get_project_overview',
								arguments: '{"project_id":"40000000-0000-4000-8000-000000000004"}'
							}
						}
					]
				},
				{
					type: 'done',
					finishedReason: 'tool_calls',
					usage: { promptTokens: 11, completionTokens: 1, totalTokens: 12 }
				}
			],
			[
				{ type: 'text', content: 'The project and its second read are ready.' },
				{
					type: 'done',
					finishedReason: 'stop',
					usage: { promptTokens: 15, completionTokens: 3, totalTokens: 18 }
				}
			]
		];
		const client = {
			stream: vi.fn(() => {
				const events = streams.shift() ?? [];
				return (async function* () {
					for (const event of events) yield event;
				})();
			})
		};
		const capacity = new AgenticChatProviderCapacity({ configured: true, concurrency: 1 });
		const adapter = new AgenticChatReadOnlyProviderAdapter({ client, capacity });
		const invocation = await adapter.prepare({
			executionInput: executionInputWithReadSurface(),
			processingToken: PROCESSING_TOKEN,
			signal: new AbortController().signal
		});
		await expect(collect(invocation.stream())).resolves.toEqual([
			{ type: 'text_delta', text: 'Let me check the first source.' },
			expect.objectContaining({
				type: 'semantic',
				eventType: 'agent_state',
				currentActivity: 'Planning the first step...'
			}),
			expect.objectContaining({
				type: 'read_tool',
				providerToolCallId: 'provider-read-1',
				toolName: 'get_project_overview'
			})
		]);

		const firstFeedback = {
			providerToolCallId: 'provider-read-1',
			toolName: 'get_project_overview',
			arguments: {
				project_id: '40000000-0000-4000-8000-000000000004'
			},
			execution: {
				result: {
					project: { id: '40000000-0000-4000-8000-000000000004' },
					search_vector: 'must-not-reach-the-model'
				},
				executionTimeMs: 1,
				tokensConsumed: null,
				affectedEntities: [],
				toolCategory: 'utility',
				resultCount: 1,
				zeroResult: false,
				requiresUserAction: false
			}
		};
		await expect(
			collect(invocation.continueWithToolResults!({ round: 2, results: [firstFeedback] }))
		).resolves.toEqual([
			{ type: 'text_delta', text: 'I need one more detail.' },
			expect.objectContaining({
				type: 'read_tool',
				providerToolCallId: 'provider-read-2',
				toolName: 'get_project_overview',
				arguments: { project_id: '40000000-0000-4000-8000-000000000004' }
			})
		]);
		expect(capacity.getSnapshot()).toMatchObject({ available: false, activeRequests: 1 });

		const firstModelPayload = JSON.parse(
			client.stream.mock.calls[1]?.[0].messages.at(-1)?.content ?? ''
		) as Record<string, unknown>;
		expect(firstModelPayload).toMatchObject({
			model_context_source: 'tool_result_untrusted',
			tool_name: 'get_project_overview',
			project: { id: '40000000-0000-4000-8000-000000000004' }
		});
		expect(firstModelPayload).not.toHaveProperty('search_vector');
		expect(client.stream.mock.calls[1]?.[0]).toMatchObject({
			providerRound: 'synthesis',
			toolChoice: 'auto',
			tools: [
				expect.objectContaining({
					function: expect.objectContaining({ name: 'get_project_overview' })
				})
			]
		});

		await expect(
			collect(
				invocation.continueWithToolResults!({
					round: 3,
					results: [
						{
							providerToolCallId: 'provider-read-2',
							toolName: 'get_project_overview',
							arguments: {
								project_id: '40000000-0000-4000-8000-000000000004'
							},
							execution: {
								result: { project: { status: 'ready' } },
								executionTimeMs: 2,
								tokensConsumed: null,
								affectedEntities: [],
								toolCategory: 'utility',
								resultCount: 1,
								zeroResult: false,
								requiresUserAction: false
							}
						}
					]
				})
			)
		).resolves.toEqual([
			{ type: 'text_delta', text: 'The project and its second read are ready.' },
			{
				type: 'finish',
				finishedReason: 'stop',
				usage: { promptTokens: 33, completionTokens: 5, totalTokens: 38 }
			}
		]);
		expect(client.stream).toHaveBeenCalledTimes(3);
		expect(
			client.stream.mock.calls[2]?.[0].messages.filter(
				(message: { role: string }) => message.role === 'tool'
			)
		).toHaveLength(2);
		expect(capacity.getSnapshot()).toMatchObject({ available: true, activeRequests: 0 });
	});

	it('serves an exact successful pure-read repeat from the turn memo with a new call identity', async () => {
		const projectId = '40000000-0000-4000-8000-000000000004';
		const streams = [
			providerReadRound('provider-read-1', { project_id: projectId }),
			providerReadRound('provider-read-2', { project_id: projectId }),
			[
				{ type: 'text', content: 'The cached evidence is enough.' },
				{ type: 'done', finishedReason: 'stop' }
			] satisfies AgenticChatReadOnlyProviderClientEventV1[]
		];
		const client = {
			stream: vi.fn(() => {
				const events = streams.shift() ?? [];
				return (async function* () {
					for (const event of events) yield event;
				})();
			})
		};
		const capacity = new AgenticChatProviderCapacity({ configured: true, concurrency: 1 });
		const invocation = await new AgenticChatReadOnlyProviderAdapter({
			client,
			capacity
		}).prepare({
			executionInput: executionInputWithReadSurface(),
			processingToken: PROCESSING_TOKEN,
			signal: new AbortController().signal
		});

		await collect(invocation.stream());
		const firstExecution = {
			result: { project: { id: projectId, title: 'Memo project' } },
			executionTimeMs: 17,
			tokensConsumed: 4,
			affectedEntities: [],
			toolCategory: 'read',
			resultCount: null,
			zeroResult: null,
			requiresUserAction: false
		};
		const repeatSteps = await collect(
			invocation.continueWithToolResults!({
				round: 2,
				results: [
					{
						providerToolCallId: 'provider-read-1',
						toolName: 'get_project_overview',
						arguments: { project_id: projectId },
						execution: firstExecution
					}
				]
			})
		);
		const memoStep = repeatSteps.find(
			(step): step is Extract<AgenticChatProviderStepV1, { type: 'read_tool' }> =>
				step.type === 'read_tool'
		);
		expect(memoStep).toMatchObject({
			providerToolCallId: 'provider-read-2',
			toolName: 'get_project_overview',
			arguments: { project_id: projectId },
			memoServed: {
				result: {
					served_from_turn_memo: true,
					repeat_read_notice: expect.stringContaining('exact call already ran'),
					project: { id: projectId, title: 'Memo project' }
				},
				executionTimeMs: 0,
				tokensConsumed: 4,
				affectedEntities: [],
				toolCategory: 'read',
				resultCount: null,
				zeroResult: null,
				requiresUserAction: false
			}
		});
		expect(memoStep?.validationFailure).toBeUndefined();

		await expect(
			collect(
				invocation.continueWithToolResults!({
					round: 3,
					results: [
						{
							providerToolCallId: 'provider-read-2',
							toolName: 'get_project_overview',
							arguments: { project_id: projectId },
							execution: memoStep!.memoServed!
						}
					]
				})
			)
		).resolves.toEqual([
			{ type: 'text_delta', text: 'The cached evidence is enough.' },
			{ type: 'finish', finishedReason: 'stop', usage: null }
		]);
		const repeatedModelPayload = JSON.parse(
			client.stream.mock.calls[2]?.[0].messages.findLast(
				(message: { role: string }) => message.role === 'tool'
			)?.content ?? ''
		) as Record<string, unknown>;
		expect(repeatedModelPayload).toMatchObject({
			served_from_turn_memo: true,
			repeat_read_notice: expect.stringContaining('vary the arguments'),
			project: { id: projectId }
		});
		expect(
			client.stream.mock.calls[2]?.[0].messages.findLast(
				(message: { role: string }) => message.role === 'tool'
			)?.tool_call_id
		).toBe('provider-read-2');
		expect(capacity.getSnapshot()).toMatchObject({ available: true, activeRequests: 0 });
	});

	it('clears an already memoized read before the next provider round executes', async () => {
		const projectId = '40000000-0000-4000-8000-000000000004';
		const streams = [
			providerReadRound('provider-read-before-write', { project_id: projectId }),
			providerReadRound('provider-read-after-write', { project_id: projectId }),
			[
				{ type: 'text', content: 'Fresh post-write evidence is ready.' },
				{ type: 'done', finishedReason: 'stop' }
			] satisfies AgenticChatReadOnlyProviderClientEventV1[]
		];
		const client = {
			stream: vi.fn(() => {
				const events = streams.shift() ?? [];
				return (async function* () {
					for (const event of events) yield event;
				})();
			})
		};
		const capacity = new AgenticChatProviderCapacity({ configured: true, concurrency: 1 });
		const invocation = await new AgenticChatReadOnlyProviderAdapter({
			client,
			capacity
		}).prepare({
			executionInput: executionInputWithReadSurface(),
			processingToken: PROCESSING_TOKEN,
			signal: new AbortController().signal
		});

		await collect(invocation.stream());
		const postWriteRound = invocation.continueWithToolResults!({
			round: 2,
			results: [
				durableReadFeedback(
					'provider-read-before-write',
					{ project_id: projectId },
					{ project: { id: projectId, title: 'Before write' } }
				)
			]
		});
		invocation.invalidateReadMemo?.();
		const postWriteSteps = await collect(postWriteRound);
		const postWriteRead = postWriteSteps.find(
			(step): step is Extract<AgenticChatProviderStepV1, { type: 'read_tool' }> =>
				step.type === 'read_tool'
		);
		expect(postWriteRead).toMatchObject({
			providerToolCallId: 'provider-read-after-write'
		});
		expect(postWriteRead?.memoServed).toBeUndefined();

		await expect(
			collect(
				invocation.continueWithToolResults!({
					round: 3,
					results: [
						durableReadFeedback(
							'provider-read-after-write',
							{ project_id: projectId },
							{ project: { id: projectId, title: 'After write' } }
						)
					]
				})
			)
		).resolves.toEqual([
			{ type: 'text_delta', text: 'Fresh post-write evidence is ready.' },
			{ type: 'finish', finishedReason: 'stop', usage: null }
		]);
	});

	it('does not memoize reads with different arguments or requiring user action', async () => {
		const projectId = '40000000-0000-4000-8000-000000000004';
		for (const scenario of [
			{
				secondArgs: { project_id: projectId, marker: 'different' },
				requiresUserAction: false
			},
			{
				secondArgs: { project_id: projectId },
				requiresUserAction: true
			}
		]) {
			const streams = [
				providerReadRound('provider-read-1', { project_id: projectId }),
				providerReadRound('provider-read-2', scenario.secondArgs)
			];
			const client = {
				stream: vi.fn(() => {
					const events = streams.shift() ?? [];
					return (async function* () {
						for (const event of events) yield event;
					})();
				})
			};
			const capacity = new AgenticChatProviderCapacity({
				configured: true,
				concurrency: 1
			});
			const invocation = await new AgenticChatReadOnlyProviderAdapter({
				client,
				capacity
			}).prepare({
				executionInput: executionInputWithReadSurface(),
				processingToken: PROCESSING_TOKEN,
				signal: new AbortController().signal
			});
			await collect(invocation.stream());
			const steps = await collect(
				invocation.continueWithToolResults!({
					round: 2,
					results: [
						{
							...durableReadFeedback(
								'provider-read-1',
								{ project_id: projectId },
								{ project: { id: projectId } }
							),
							execution: {
								...durableReadFeedback('provider-read-1').execution,
								result: { project: { id: projectId } },
								requiresUserAction: scenario.requiresUserAction
							}
						}
					]
				})
			);
			const readStep = steps.find((step) => step.type === 'read_tool');
			expect(readStep).toMatchObject({
				type: 'read_tool',
				providerToolCallId: 'provider-read-2'
			});
			expect(readStep).not.toHaveProperty('memoServed');
			invocation.release();
			expect(capacity.getSnapshot()).toMatchObject({ available: true, activeRequests: 0 });
		}
	});

	it('exposes a durable validation failure before repairing the provider tool call', async () => {
		const projectId = '40000000-0000-4000-8000-000000000004';
		const definition = {
			type: 'function' as const,
			function: {
				name: 'get_project_overview',
				description: 'Read a project overview.',
				parameters: {
					type: 'object',
					properties: { project_id: { type: 'string' } },
					required: ['project_id']
				}
			}
		};
		const streams: AgenticChatReadOnlyProviderClientEventV1[][] = [
			[
				{
					type: 'tool_call',
					toolCall: [
						{
							index: 0,
							id: 'invalid-read',
							type: 'function',
							function: { name: 'get_project_overview', arguments: '{}' }
						}
					]
				},
				{
					type: 'done',
					finishedReason: 'tool_calls',
					usage: { promptTokens: 3, completionTokens: 1, totalTokens: 4 }
				}
			],
			[
				{
					type: 'tool_call',
					toolCall: [
						{
							index: 0,
							id: 'repaired-read',
							type: 'function',
							function: {
								name: 'get_project_overview',
								arguments: JSON.stringify({ project_id: projectId })
							}
						}
					]
				},
				{
					type: 'done',
					finishedReason: 'tool_calls',
					usage: { promptTokens: 5, completionTokens: 1, totalTokens: 6 }
				}
			],
			[
				{ type: 'text', content: 'The repaired read succeeded.' },
				{
					type: 'done',
					finishedReason: 'stop',
					usage: { promptTokens: 7, completionTokens: 2, totalTokens: 9 }
				}
			]
		];
		const client = {
			stream: vi.fn(() => {
				const events = streams.shift() ?? [];
				return (async function* () {
					for (const event of events) yield event;
				})();
			})
		};
		const capacity = new AgenticChatProviderCapacity({ configured: true, concurrency: 1 });
		const invocation = await new AgenticChatReadOnlyProviderAdapter({
			client,
			capacity
		}).prepare({
			executionInput: executionInputWithReadSurface([definition]),
			processingToken: PROCESSING_TOKEN,
			signal: new AbortController().signal
		});

		await expect(collect(invocation.stream())).resolves.toEqual([
			expect.objectContaining({
				type: 'read_tool',
				providerToolCallId: 'invalid-read',
				toolName: 'get_project_overview',
				arguments: {},
				validationFailure: {
					error: expect.stringContaining('Missing required parameter: project_id'),
					toolCategory: 'read'
				}
			}),
			expect.objectContaining({ type: 'semantic', eventType: 'agent_state' }),
			expect.objectContaining({
				type: 'read_tool',
				providerToolCallId: 'repaired-read',
				toolName: 'get_project_overview',
				arguments: { project_id: projectId }
			})
		]);
		expect(client.stream).toHaveBeenCalledTimes(2);
		const repairRequest = client.stream.mock.calls[1]?.[0];
		expect(repairRequest.messages.slice(-3).map((message) => message.role)).toEqual([
			'assistant',
			'tool',
			'system'
		]);
		const validationPayload = JSON.parse(
			repairRequest.messages.at(-2)?.content ?? ''
		) as Record<string, unknown>;
		expect(validationPayload).toMatchObject({
			error: expect.stringContaining('Missing required parameter: project_id'),
			op: 'util.project.overview',
			help_path: 'util.project.overview'
		});
		expect(repairRequest.messages.at(-1)?.content).toContain(
			'One or more tool calls failed validation.'
		);

		await expect(
			collect(
				invocation.continueWithToolResults!({
					round: 2,
					results: [
						durableReadFeedback(
							'repaired-read',
							{ project_id: projectId },
							{ project: { id: projectId } }
						)
					]
				})
			)
		).resolves.toEqual([
			{ type: 'text_delta', text: 'The repaired read succeeded.' },
			{
				type: 'finish',
				finishedReason: 'stop',
				usage: { promptTokens: 15, completionTokens: 4, totalTokens: 19 }
			}
		]);
		expect(
			client.stream.mock.calls[2]?.[0].messages.some(
				(message: { role: string; tool_call_id?: string }) =>
					message.role === 'tool' && message.tool_call_id === 'invalid-read'
			)
		).toBe(true);
		expect(capacity.getSnapshot()).toMatchObject({ available: true, activeRequests: 0 });
	});

	it('bounds repeated validation repairs and releases provider capacity', async () => {
		const invalidRound = (providerToolCallId: string) => [
			{
				type: 'tool_call' as const,
				toolCall: [
					{
						index: 0,
						id: providerToolCallId,
						type: 'function',
						function: { name: 'get_project_overview', arguments: '{}' }
					}
				]
			},
			{ type: 'done' as const, finishedReason: 'tool_calls' }
		];
		const streams = [
			invalidRound('invalid-read-1'),
			invalidRound('invalid-read-2'),
			invalidRound('invalid-read-3')
		];
		const client = {
			stream: vi.fn(() => {
				const events = streams.shift() ?? [];
				return (async function* () {
					for (const event of events) yield event;
				})();
			})
		};
		const capacity = new AgenticChatProviderCapacity({ configured: true, concurrency: 1 });
		const invocation = await new AgenticChatReadOnlyProviderAdapter({
			client,
			capacity
		}).prepare({
			executionInput: executionInputWithReadSurface([
				{
					type: 'function',
					function: {
						name: 'get_project_overview',
						description: 'Read a project overview.',
						parameters: {
							type: 'object',
							properties: { project_id: { type: 'string' } },
							required: ['project_id']
						}
					}
				}
			]),
			processingToken: PROCESSING_TOKEN,
			signal: new AbortController().signal
		});

		const exposedSteps: AgenticChatProviderStepV1[] = [];
		await expect(
			(async () => {
				for await (const step of invocation.stream()) exposedSteps.push(step);
			})()
		).rejects.toMatchObject({
			code: 'provider_tool_validation_repair_exhausted',
			failureClass: 'permanent'
		});
		expect(
			exposedSteps.flatMap((step) =>
				step.type === 'read_tool' && step.validationFailure ? [step.providerToolCallId] : []
			)
		).toEqual(['invalid-read-1', 'invalid-read-2', 'invalid-read-3']);
		expect(client.stream).toHaveBeenCalledTimes(3);
		expect(capacity.getSnapshot()).toMatchObject({ available: true, activeRequests: 0 });
	});

	it('emits monotonic context saturation and forces a true no-tool synthesis pass', async () => {
		const projectId = '40000000-0000-4000-8000-000000000004';
		const streams = [
			providerReadRound('provider-read-1', { project_id: projectId }),
			providerReadRound('provider-read-2', { project_id: projectId }),
			providerReadRound('provider-read-3', { project_id: projectId }),
			providerReadRound('provider-read-4', { project_id: projectId }),
			[
				{ type: 'text', content: 'Enough context.' },
				{ type: 'done', finishedReason: 'stop' }
			] satisfies AgenticChatReadOnlyProviderClientEventV1[]
		];
		const client = {
			stream: vi.fn(() => {
				const events = streams.shift() ?? [];
				return (async function* () {
					for (const event of events) yield event;
				})();
			})
		};
		const capacity = new AgenticChatProviderCapacity({ configured: true, concurrency: 1 });
		const invocation = await new AgenticChatReadOnlyProviderAdapter({
			client,
			capacity
		}).prepare({
			executionInput: executionInputWithReadSurface(),
			processingToken: PROCESSING_TOKEN,
			signal: new AbortController().signal
		});

		await collect(invocation.stream());
		await collect(
			invocation.continueWithToolResults!({
				round: 2,
				results: [
					durableReadFeedback(
						'provider-read-1',
						{ project_id: projectId },
						{ project: { id: projectId } }
					)
				]
			})
		);
		await collect(
			invocation.continueWithToolResults!({
				round: 3,
				results: [
					durableReadFeedback(
						'provider-read-2',
						{ project_id: projectId },
						{ project: { id: projectId } }
					)
				]
			})
		);
		await collect(
			invocation.continueWithToolResults!({
				round: 4,
				results: [
					durableReadFeedback(
						'provider-read-3',
						{ project_id: projectId },
						{ project: { id: projectId } }
					)
				]
			})
		);
		await expect(
			collect(
				invocation.continueWithToolResults!({
					round: 5,
					results: [
						durableReadFeedback(
							'provider-read-4',
							{ project_id: projectId },
							{ project: { id: projectId } }
						)
					]
				})
			)
		).resolves.toEqual([
			{ type: 'text_delta', text: 'Enough context.' },
			{ type: 'finish', finishedReason: 'stop', usage: null }
		]);

		const forcedRequest = client.stream.mock.calls[4]?.[0];
		expect(forcedRequest).toMatchObject({ tools: [], toolChoice: 'none' });
		const continuationMessages = forcedRequest.messages;
		const systemMessages = continuationMessages.filter(
			(message: { role: string }) => message.role === 'system'
		);
		expect(systemMessages.map((message: { content: string }) => message.content)).toEqual([
			'System prompt\n',
			expect.stringContaining('Context gathering: narrowing.'),
			expect.stringContaining('Context gathering: saturated.'),
			expect.stringContaining('Context gathering: must synthesize.')
		]);
		expect(systemMessages.at(-1)?.content).toContain('do not gather more context');
		expect(systemMessages.some((message) => message.content.includes('Read-loop nudge'))).toBe(
			false
		);
		expect(capacity.getSnapshot()).toMatchObject({ available: true, activeRequests: 0 });
	});

	it('resets the low-novelty ladder when a later read adds new evidence', async () => {
		const firstProjectId = '40000000-0000-4000-8000-000000000004';
		const secondProjectId = '50000000-0000-4000-8000-000000000005';
		const streams = [
			providerReadRound('provider-read-1', { project_id: firstProjectId }),
			providerReadRound('provider-read-2', { project_id: firstProjectId }),
			providerReadRound('provider-read-3', { project_id: secondProjectId }),
			providerReadRound('provider-read-4', { project_id: secondProjectId }),
			[
				{ type: 'text', content: 'Both projects are covered.' },
				{ type: 'done', finishedReason: 'stop' }
			] satisfies AgenticChatReadOnlyProviderClientEventV1[]
		];
		const client = {
			stream: vi.fn(() => {
				const events = streams.shift() ?? [];
				return (async function* () {
					for (const event of events) yield event;
				})();
			})
		};
		const capacity = new AgenticChatProviderCapacity({ configured: true, concurrency: 1 });
		const invocation = await new AgenticChatReadOnlyProviderAdapter({
			client,
			capacity
		}).prepare({
			executionInput: executionInputWithReadSurface(),
			processingToken: PROCESSING_TOKEN,
			signal: new AbortController().signal
		});
		await collect(invocation.stream());
		for (const [round, providerToolCallId, projectId] of [
			[2, 'provider-read-1', firstProjectId],
			[3, 'provider-read-2', firstProjectId],
			[4, 'provider-read-3', secondProjectId]
		] as const) {
			await collect(
				invocation.continueWithToolResults!({
					round,
					results: [
						durableReadFeedback(
							providerToolCallId,
							{ project_id: projectId },
							{ project: { id: projectId } }
						)
					]
				})
			);
		}
		await expect(
			collect(
				invocation.continueWithToolResults!({
					round: 5,
					results: [
						durableReadFeedback(
							'provider-read-4',
							{ project_id: secondProjectId },
							{ project: { id: secondProjectId } }
						)
					]
				})
			)
		).resolves.toEqual([
			{ type: 'text_delta', text: 'Both projects are covered.' },
			{ type: 'finish', finishedReason: 'stop', usage: null }
		]);
		const finalRequest = client.stream.mock.calls[4]?.[0];
		expect(finalRequest).toMatchObject({ toolChoice: 'auto' });
		expect(finalRequest.tools).not.toHaveLength(0);
		const contextMessages = finalRequest.messages.filter(
			(message: { role: string; content: string }) =>
				message.role === 'system' && message.content.startsWith('Context gathering:')
		);
		expect(contextMessages).toHaveLength(1);
		expect(contextMessages[0]?.content).toContain('narrowing');
		expect(capacity.getSnapshot()).toMatchObject({ available: true, activeRequests: 0 });
	});

	it('uses the admission context snapshot to force synthesis when context is already over budget', async () => {
		const projectId = '40000000-0000-4000-8000-000000000004';
		const baseInput = executionInputWithReadSurface();
		const input: AgenticChatWorkerExecutionInputV1 = {
			...baseInput,
			artifact: {
				...baseInput.artifact,
				artifactVersion: AGENTIC_CHAT_INPUT_ARTIFACT_VERSION,
				prepared: {
					...baseInput.artifact.prepared,
					sessionSnapshot: {},
					contextUsageSnapshot: {
						estimatedTokens: 81_000,
						tokenBudget: 80_000,
						usagePercent: 101,
						tokensRemaining: 0,
						status: 'over_budget'
					}
				}
			}
		};
		const streams = [
			providerReadRound('provider-read-1', { project_id: projectId }),
			[
				{ type: 'text', content: 'The loaded evidence answers it.' },
				{ type: 'done', finishedReason: 'stop' }
			] satisfies AgenticChatReadOnlyProviderClientEventV1[]
		];
		const client = {
			stream: vi.fn(() => {
				const events = streams.shift() ?? [];
				return (async function* () {
					for (const event of events) yield event;
				})();
			})
		};
		const capacity = new AgenticChatProviderCapacity({ configured: true, concurrency: 1 });
		const invocation = await new AgenticChatReadOnlyProviderAdapter({
			client,
			capacity
		}).prepare({
			executionInput: input,
			processingToken: PROCESSING_TOKEN,
			signal: new AbortController().signal
		});
		await collect(invocation.stream());
		await expect(
			collect(
				invocation.continueWithToolResults!({
					round: 2,
					results: [
						durableReadFeedback(
							'provider-read-1',
							{ project_id: projectId },
							{ project: { id: projectId } }
						)
					]
				})
			)
		).resolves.toEqual([
			{ type: 'text_delta', text: 'The loaded evidence answers it.' },
			{ type: 'finish', finishedReason: 'stop', usage: null }
		]);
		expect(client.stream.mock.calls[1]?.[0]).toMatchObject({
			tools: [],
			toolChoice: 'none',
			messages: expect.arrayContaining([
				expect.objectContaining({
					role: 'system',
					content: expect.stringContaining('Context gathering: must synthesize.')
				})
			])
		});
		expect(capacity.getSnapshot()).toMatchObject({ available: true, activeRequests: 0 });
	});

	it('buffers forced synthesis and retries once when the provider still requests a tool', async () => {
		const projectId = '40000000-0000-4000-8000-000000000004';
		const streams = [
			providerReadRound(
				'provider-read-1',
				{ project_id: projectId },
				'get_project_overview',
				{ promptTokens: 3, completionTokens: 1, totalTokens: 4 }
			),
			[
				{ type: 'text', content: 'This rejected partial must never be published.' },
				{
					type: 'tool_call',
					toolCall: [
						{
							index: 0,
							id: 'suppressed-read',
							type: 'function',
							function: {
								name: 'get_project_overview',
								arguments: JSON.stringify({ project_id: projectId })
							}
						}
					]
				},
				{
					type: 'done',
					finishedReason: 'tool_calls',
					usage: { promptTokens: 4, completionTokens: 1, totalTokens: 5 }
				}
			] satisfies AgenticChatReadOnlyProviderClientEventV1[],
			[
				{ type: 'text', content: 'Read-loop hard stop: synthesize now.\n' },
				{ type: 'text', content: 'The project evidence is ready.' },
				{
					type: 'done',
					finishedReason: 'end_turn',
					usage: { promptTokens: 6, completionTokens: 2, totalTokens: 8 }
				}
			] satisfies AgenticChatReadOnlyProviderClientEventV1[]
		];
		const client = {
			stream: vi.fn(() => {
				const events = streams.shift() ?? [];
				return (async function* () {
					for (const event of events) yield event;
				})();
			})
		};
		const capacity = new AgenticChatProviderCapacity({ configured: true, concurrency: 1 });
		const invocation = await new AgenticChatReadOnlyProviderAdapter(
			{ client, capacity },
			2_000,
			3
		).prepare({
			executionInput: executionInputWithReadSurface(),
			processingToken: PROCESSING_TOKEN,
			signal: new AbortController().signal
		});

		await collect(invocation.stream());
		await expect(
			collect(
				invocation.continueWithToolResults!({
					round: 2,
					results: [
						durableReadFeedback(
							'provider-read-1',
							{ project_id: projectId },
							{ project: { id: projectId } }
						)
					]
				})
			)
		).resolves.toEqual([
			{ type: 'text_delta', text: 'The project evidence is ready.' },
			{
				type: 'finish',
				finishedReason: 'end_turn',
				usage: { promptTokens: 13, completionTokens: 4, totalTokens: 17 }
			}
		]);
		expect(client.stream).toHaveBeenCalledTimes(3);
		for (const callIndex of [1, 2]) {
			expect(client.stream.mock.calls[callIndex]?.[0]).toMatchObject({
				tools: [],
				toolChoice: 'none'
			});
		}
		expect(client.stream.mock.calls[2]?.[0].messages.at(-1)?.content).toBe(
			'The previous synthesis attempt still requested tool calls even though tools are unavailable. Ignore all pending or implied tool calls and write the final user-facing answer now from the existing tool results. Do not say you will check, search, pull up, inspect, load, or update anything else.'
		);
		expect(capacity.getSnapshot()).toMatchObject({ available: true, activeRequests: 0 });
	});

	it('fails deterministically after one empty forced-synthesis retry', async () => {
		const projectId = '40000000-0000-4000-8000-000000000004';
		const streams = [
			providerReadRound('provider-read-1', { project_id: projectId }),
			[{ type: 'done', finishedReason: 'stop' }],
			[{ type: 'done', finishedReason: 'stop' }]
		] satisfies AgenticChatReadOnlyProviderClientEventV1[][];
		const client = {
			stream: vi.fn(() => {
				const events = streams.shift() ?? [];
				return (async function* () {
					for (const event of events) yield event;
				})();
			})
		};
		const capacity = new AgenticChatProviderCapacity({ configured: true, concurrency: 1 });
		const invocation = await new AgenticChatReadOnlyProviderAdapter(
			{ client, capacity },
			2_000,
			3
		).prepare({
			executionInput: executionInputWithReadSurface(),
			processingToken: PROCESSING_TOKEN,
			signal: new AbortController().signal
		});
		await collect(invocation.stream());

		await expect(
			collect(
				invocation.continueWithToolResults!({
					round: 2,
					results: [durableReadFeedback('provider-read-1', { project_id: projectId })]
				})
			)
		).rejects.toMatchObject({
			code: 'provider_forced_synthesis_failed',
			failureClass: 'permanent'
		});
		expect(client.stream).toHaveBeenCalledTimes(3);
		expect(client.stream.mock.calls[2]?.[0].messages.at(-1)?.content).toBe(
			'The previous synthesis attempt produced no visible answer. Write the final user-facing answer now from the existing tool results. Include the concrete entities you found (with their titles and states) and directly answer any definition question the user asked. Do not call tools.'
		);
		expect(capacity.getSnapshot()).toMatchObject({ available: true, activeRequests: 0 });
	});

	it('turns retryable provider errors into bounded pressure evidence', async () => {
		let nowMs = 1_000;
		const client = clientWith([{ type: 'error', error: 'rate limited', retryable: true }]);
		const capacity = new AgenticChatProviderCapacity({
			configured: true,
			concurrency: 1,
			now: () => nowMs
		});
		const adapter = new AgenticChatReadOnlyProviderAdapter({ client, capacity }, 2_000);
		const invocation = await adapter.prepare({
			executionInput: executionInput(),
			processingToken: PROCESSING_TOKEN,
			signal: new AbortController().signal
		});

		await expect(collect(invocation.stream())).rejects.toMatchObject({
			code: 'provider_stream_error',
			failureClass: 'provider_throttle'
		});
		expect(capacity.getSnapshot()).toMatchObject({
			available: false,
			activeRequests: 0,
			degradedUntilMs: 3_000
		});
		nowMs = 3_000;
		expect(capacity.getSnapshot().available).toBe(true);
	});

	it('rejects a non-allowlisted provider call without executing another round', async () => {
		const capacity = new AgenticChatProviderCapacity({ configured: true, concurrency: 1 });
		const adapter = new AgenticChatReadOnlyProviderAdapter({
			client: clientWith([
				{
					type: 'tool_call',
					toolCall: [
						{
							index: 0,
							id: 'provider-write-1',
							type: 'function',
							function: { name: 'update_onto_project', arguments: '{}' }
						}
					]
				},
				{ type: 'done', finishedReason: 'tool_calls' }
			]),
			capacity
		});
		const invocation = await adapter.prepare({
			executionInput: executionInputWithReadSurface(),
			processingToken: PROCESSING_TOKEN,
			signal: new AbortController().signal
		});

		await expect(collect(invocation.stream())).rejects.toMatchObject({
			code: 'provider_tool_not_allowlisted',
			failureClass: 'permanent'
		});
		expect(capacity.getSnapshot()).toMatchObject({ available: true, activeRequests: 0 });
	});

	it('executes parallel provider reads sequentially and replays their results in emission order', async () => {
		const streams: AgenticChatReadOnlyProviderClientEventV1[][] = [
			[
				{
					type: 'tool_call',
					toolCall: [
						{
							index: 0,
							id: 'provider-read-1',
							type: 'function',
							function: {
								name: 'get_project_overview',
								arguments: '{"marker":"first",'
							}
						},
						{
							index: 1,
							id: 'provider-read-2',
							type: 'function',
							function: {
								name: 'get_project_overview',
								arguments: '{"marker":"second",'
							}
						}
					]
				},
				{
					type: 'tool_call',
					toolCall: [
						{
							index: 0,
							function: {
								arguments: '"project_id":"40000000-0000-4000-8000-000000000004"}'
							}
						},
						{
							index: 1,
							function: {
								arguments: '"project_id":"40000000-0000-4000-8000-000000000004"}'
							}
						}
					]
				},
				{
					type: 'done',
					finishedReason: 'tool_calls',
					usage: { promptTokens: 10, completionTokens: 2, totalTokens: 12 }
				}
			],
			[
				{ type: 'text', content: 'Both reads are synthesized.' },
				{
					type: 'done',
					finishedReason: 'stop',
					usage: { promptTokens: 12, completionTokens: 3, totalTokens: 15 }
				}
			]
		];
		const client = {
			stream: vi.fn(() => {
				const events = streams.shift() ?? [];
				return (async function* () {
					for (const event of events) yield event;
				})();
			})
		};
		const capacity = new AgenticChatProviderCapacity({ configured: true, concurrency: 1 });
		const adapter = new AgenticChatReadOnlyProviderAdapter({ client, capacity });
		const invocation = await adapter.prepare({
			executionInput: executionInputWithReadSurface(),
			processingToken: PROCESSING_TOKEN,
			signal: new AbortController().signal
		});

		await expect(collect(invocation.stream())).resolves.toEqual([
			expect.objectContaining({ type: 'semantic', eventType: 'agent_state' }),
			expect.objectContaining({
				type: 'read_tool',
				providerToolCallId: 'provider-read-1',
				arguments: {
					marker: 'first',
					project_id: '40000000-0000-4000-8000-000000000004'
				}
			}),
			expect.objectContaining({
				type: 'read_tool',
				providerToolCallId: 'provider-read-2',
				arguments: {
					marker: 'second',
					project_id: '40000000-0000-4000-8000-000000000004'
				}
			})
		]);

		await expect(
			collect(
				invocation.continueWithToolResults!({
					round: 2,
					results: [
						durableReadFeedback(
							'provider-read-1',
							{
								marker: 'first',
								project_id: '40000000-0000-4000-8000-000000000004'
							},
							{ result: 'first' }
						),
						durableReadFeedback(
							'provider-read-2',
							{
								marker: 'second',
								project_id: '40000000-0000-4000-8000-000000000004'
							},
							{ result: 'second' }
						)
					]
				})
			)
		).resolves.toEqual([
			{ type: 'text_delta', text: 'Both reads are synthesized.' },
			{
				type: 'finish',
				finishedReason: 'stop',
				usage: { promptTokens: 22, completionTokens: 5, totalTokens: 27 }
			}
		]);

		const continuationMessages = client.stream.mock.calls[1]?.[0].messages;
		expect(continuationMessages.at(-3)).toMatchObject({
			role: 'assistant',
			tool_calls: [
				expect.objectContaining({ id: 'provider-read-1' }),
				expect.objectContaining({ id: 'provider-read-2' })
			]
		});
		expect(continuationMessages.slice(-2).map((message) => message.tool_call_id)).toEqual([
			'provider-read-1',
			'provider-read-2'
		]);
		expect(capacity.getSnapshot()).toMatchObject({ available: true, activeRequests: 0 });
	});

	it('rejects malformed completion and single-use invocation violations', async () => {
		const capacity = new AgenticChatProviderCapacity({ configured: true, concurrency: 1 });
		const missingDone = new AgenticChatReadOnlyProviderAdapter({
			client: clientWith([{ type: 'text', content: 'partial' }]),
			capacity
		});
		const first = await missingDone.prepare({
			executionInput: executionInput(),
			processingToken: PROCESSING_TOKEN,
			signal: new AbortController().signal
		});
		await expect(collect(first.stream())).rejects.toMatchObject({
			code: 'provider_missing_done',
			failureClass: 'unknown'
		});
		expect(capacity.getSnapshot().available).toBe(true);

		const noText = new AgenticChatReadOnlyProviderAdapter({
			client: clientWith([{ type: 'done' }]),
			capacity
		});
		const empty = await noText.prepare({
			executionInput: executionInput(),
			processingToken: PROCESSING_TOKEN,
			signal: new AbortController().signal
		});
		await expect(collect(empty.stream())).rejects.toMatchObject({
			code: 'provider_no_assistant_text',
			failureClass: 'permanent'
		});

		const valid = new AgenticChatReadOnlyProviderAdapter({
			client: clientWith([
				{ type: 'text', content: 'answer' },
				{ type: 'done', finishedReason: 'stop' }
			]),
			capacity
		});
		const released = await valid.prepare({
			executionInput: executionInput(),
			processingToken: PROCESSING_TOKEN,
			signal: new AbortController().signal
		});
		released.release();
		expect(() => released.stream()).toThrow(AgenticChatProviderExecutionError);

		const reused = await valid.prepare({
			executionInput: executionInput(),
			processingToken: PROCESSING_TOKEN,
			signal: new AbortController().signal
		});
		await collect(reused.stream());
		expect(() => reused.stream()).toThrow('released before streaming');
	});
});
