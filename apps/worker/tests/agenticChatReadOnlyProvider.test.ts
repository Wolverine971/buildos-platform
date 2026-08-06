// apps/worker/tests/agenticChatReadOnlyProvider.test.ts
import type { AgenticChatTurnClaimResultV1, TurnInputArtifactV1 } from '@buildos/shared-types';
import { describe, expect, it, vi } from 'vitest';
import type { AgenticChatWorkerExecutionInputV1 } from '../src/workers/agentic-chat/executionInput';
import {
	AgenticChatProviderExecutionError,
	type AgenticChatProviderStepV1
} from '../src/workers/agentic-chat/providerContract';
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

async function collect(stream: AsyncIterable<AgenticChatProviderStepV1>) {
	const result: AgenticChatProviderStepV1[] = [];
	for await (const step of stream) result.push(step);
	return result;
}

function executionInputWithReadSurface(): AgenticChatWorkerExecutionInputV1 {
	const input = executionInput();
	return {
		...input,
		artifact: {
			...input.artifact,
			prepared: {
				...input.artifact.prepared,
				toolSurface: {
					surfaceProfile: 'project_default',
					toolNames: ['get_project_overview']
				}
			}
		}
	};
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

	it('rejects a second provider tool round and releases capacity', async () => {
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
								arguments: '{"project_id":"40000000-0000-4000-8000-000000000004"}'
							}
						}
					]
				},
				{ type: 'done', finishedReason: 'tool_calls' }
			],
			[
				{
					type: 'tool_call',
					toolCall: [
						{
							index: 0,
							id: 'provider-read-2',
							type: 'function',
							function: { name: 'get_project_overview', arguments: '{}' }
						}
					]
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
		await collect(invocation.stream());

		await expect(
			collect(
				invocation.synthesize!({
					providerToolCallId: 'provider-read-1',
					toolName: 'get_project_overview',
					arguments: {
						project_id: '40000000-0000-4000-8000-000000000004'
					},
					execution: {
						result: {
							project: { id: '40000000-0000-4000-8000-000000000004' }
						},
						executionTimeMs: 1,
						tokensConsumed: null,
						affectedEntities: [],
						toolCategory: 'utility',
						resultCount: 1,
						zeroResult: false,
						requiresUserAction: false
					}
				})
			)
		).rejects.toMatchObject({
			code: 'provider_additional_tool_round_disabled',
			failureClass: 'permanent'
		});
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

	it('rejects non-allowlisted and multi-call provider output without executing another round', async () => {
		for (const events of [
			[
				{
					type: 'tool_call' as const,
					toolCall: [
						{
							index: 0,
							id: 'provider-write-1',
							type: 'function',
							function: { name: 'update_onto_project', arguments: '{}' }
						}
					]
				},
				{ type: 'done' as const, finishedReason: 'tool_calls' }
			],
			[
				{
					type: 'tool_call' as const,
					toolCall: [
						{
							index: 0,
							id: 'provider-read-1',
							type: 'function',
							function: { name: 'get_project_overview', arguments: '{}' }
						},
						{
							index: 1,
							id: 'provider-read-2',
							type: 'function',
							function: { name: 'get_project_overview', arguments: '{}' }
						}
					]
				}
			]
		] satisfies AgenticChatReadOnlyProviderClientEventV1[][]) {
			const capacity = new AgenticChatProviderCapacity({
				configured: true,
				concurrency: 1
			});
			const adapter = new AgenticChatReadOnlyProviderAdapter({
				client: clientWith(events),
				capacity
			});
			const invocation = await adapter.prepare({
				executionInput: executionInputWithReadSurface(),
				processingToken: PROCESSING_TOKEN,
				signal: new AbortController().signal
			});

			await expect(collect(invocation.stream())).rejects.toMatchObject({
				failureClass: 'permanent'
			});
			expect(capacity.getSnapshot()).toMatchObject({ available: true, activeRequests: 0 });
		}
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
