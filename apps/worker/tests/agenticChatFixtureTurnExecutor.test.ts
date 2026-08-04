// apps/worker/tests/agenticChatFixtureTurnExecutor.test.ts
import { createAgentStreamEventIdV1 } from '@buildos/shared-types';
import { describe, expect, it, vi } from 'vitest';
import type { ProcessingJob } from '../src/lib/supabaseQueue';
import { AgenticChatCancellationError } from '../src/workers/agentic-chat/cancellationObserver';
import { AgenticChatExecutionInputError } from '../src/workers/agentic-chat/executionInput';
import { AgenticChatEffectExecutionError } from '../src/workers/agentic-chat/fixtureMutationExecutor';
import {
	AgenticChatFixtureTurnExecutor,
	type AgenticChatFixtureProviderStepV1
} from '../src/workers/agentic-chat/fixtureTurnExecutor';
import { AgenticChatProviderExecutionError } from '../src/workers/agentic-chat/providerContract';
import { AgenticChatStreamPublisher } from '../src/workers/agentic-chat/streamPublisher';

const USER_ID = '10000000-0000-4000-8000-000000000001';
const SESSION_ID = '20000000-0000-4000-8000-000000000002';
const TURN_RUN_ID = '30000000-0000-4000-8000-000000000003';
const QUEUE_JOB_ID = '40000000-0000-4000-8000-000000000004';
const CORRELATION_ID = '50000000-0000-4000-8000-000000000005';
const PROCESSING_TOKEN = '60000000-0000-4000-8000-000000000006';
const INPUT_ARTIFACT_ID = '70000000-0000-4000-8000-000000000007';
const USER_MESSAGE_ID = '80000000-0000-4000-8000-000000000008';
const ASSISTANT_MESSAGE_ID = '90000000-0000-4000-8000-000000000009';
const CALL_TRANSITION_ID = 'a0000000-0000-4000-8000-00000000000a';
const RESULT_TRANSITION_ID = 'b0000000-0000-4000-8000-00000000000b';
const LOGICAL_OPERATION_ID = 'c0000000-0000-4000-8000-00000000000c';
const EFFECT_ID = 'd0000000-0000-5000-8000-00000000000d';
const EXECUTION_GENERATION = 1;

const claim = {
	outcome: 'claimed',
	executionMayStart: true,
	turnRunId: TURN_RUN_ID,
	queueJobId: QUEUE_JOB_ID,
	sessionId: SESSION_ID,
	userId: USER_ID,
	correlationId: CORRELATION_ID,
	executionGeneration: EXECUTION_GENERATION,
	status: 'running',
	inputArtifactId: INPUT_ARTIFACT_ID,
	userMessageId: USER_MESSAGE_ID
} as const;

const executionInput = {
	claim,
	streamRunId: 'stream-run-1',
	clientTurnId: 'client-turn-1',
	requestPayload: {
		clientTurnId: 'client-turn-1',
		streamRunId: 'stream-run-1',
		message: 'Use the fixture',
		context: {}
	},
	artifact: {
		artifactVersion: 'agentic_chat_input_v2',
		historySource: 'admission_window',
		history: [],
		prepared: {
			sourcePreparedPromptId: null,
			contextPayload: {},
			conversationSummary: null,
			surfaceProfile: 'fixture',
			systemPrompt: 'Fixture only',
			promptSections: [],
			toolSurface: {}
		},
		createdAt: '2026-08-03T12:00:00.000Z',
		retainUntil: '2026-08-10T12:00:00.000Z',
		contentHash: '0'.repeat(64)
	}
} as const;

function job(signal: AbortSignal = new AbortController().signal) {
	return {
		id: 'human-job-id',
		queueRowId: QUEUE_JOB_ID,
		processingToken: PROCESSING_TOKEN,
		correlationId: CORRELATION_ID,
		userId: USER_ID,
		data: { turnRunId: TURN_RUN_ID, correlationId: CORRELATION_ID },
		attempts: 0,
		signal,
		updateProgress: vi.fn(),
		log: vi.fn()
	} satisfies ProcessingJob<{ turnRunId: string; correlationId: string }>;
}

function recoveryReceipt(
	outcome:
		| 'retry_scheduled'
		| 'finalize_failed'
		| 'finalize_cancelled'
		| 'effect_reconciliation_required'
		| 'stale_generation'
		| 'queue_reconciled',
	overrides: Record<string, unknown> = {}
) {
	return {
		outcome,
		execution_may_retry: outcome === 'retry_scheduled',
		failure_code:
			outcome === 'finalize_cancelled'
				? 'cancelled'
				: outcome === 'queue_reconciled'
					? null
					: 'transient_infra',
		turn_run_id: TURN_RUN_ID,
		queue_job_id: QUEUE_JOB_ID,
		session_id: SESSION_ID,
		user_id: USER_ID,
		correlation_id: CORRELATION_ID,
		execution_generation: EXECUTION_GENERATION,
		status: outcome === 'retry_scheduled' ? 'queued' : 'running',
		...overrides
	};
}

function terminalReceipt(
	status: 'completed' | 'failed' | 'cancelled',
	sequence: number,
	overrides: Record<string, unknown> = {}
) {
	return {
		outcome: 'finalized',
		turn_run_id: TURN_RUN_ID,
		queue_job_id: QUEUE_JOB_ID,
		session_id: SESSION_ID,
		user_id: USER_ID,
		execution_generation: EXECUTION_GENERATION,
		status,
		finished_reason: status === 'completed' ? 'stop' : status,
		failure_code: status === 'completed' ? null : status,
		assistant_message_id: status === 'completed' ? ASSISTANT_MESSAGE_ID : null,
		terminal_event_id: createAgentStreamEventIdV1(TURN_RUN_ID, EXECUTION_GENERATION, sequence),
		terminal_sequence_index: sequence,
		terminalized_at: '2026-08-03T12:00:00.000Z',
		...overrides
	};
}

function createHarness(
	steps: AgenticChatFixtureProviderStepV1[],
	options: {
		recovery?: unknown[];
		publisherConfig?: ConstructorParameters<typeof AgenticChatStreamPublisher>[1];
	} = {}
) {
	let sequence = 0;
	const semanticInputs: Array<Record<string, unknown>> = [];
	const broadcastMessages: Array<Record<string, unknown>> = [];
	const log: string[] = [];
	const persistence = {
		async flushTextBatches(inputs: Array<Record<string, unknown>>) {
			return {
				outcome: 'flushed',
				input_count: inputs.length,
				persisted_count: inputs.length,
				rejected_count: 0,
				results: inputs.map((input, index) => {
					sequence += 1;
					return {
						outcome: 'persisted',
						publish_allowed: true,
						turn_run_id: TURN_RUN_ID,
						queue_job_id: QUEUE_JOB_ID,
						session_id: SESSION_ID,
						user_id: USER_ID,
						stream_run_id: executionInput.streamRunId,
						client_turn_id: executionInput.clientTurnId,
						execution_generation: EXECUTION_GENERATION,
						sequence_index: sequence,
						event_id: createAgentStreamEventIdV1(
							TURN_RUN_ID,
							EXECUTION_GENERATION,
							sequence
						),
						phase: 'llm',
						event_type: 'text_delta',
						durable: true,
						batch_id: input.batch_id,
						text_delta: input.text_delta,
						assistant_text_bytes: Buffer.byteLength(String(input.assistant_text)),
						reconcile_required: true,
						persisted_at: '2026-08-03T12:00:00.000Z',
						input_index: index
					};
				})
			};
		},
		async persistSemantic(input: Record<string, unknown>) {
			semanticInputs.push(input);
			sequence += 1;
			return {
				outcome: 'persisted',
				publish_allowed: true,
				turn_run_id: TURN_RUN_ID,
				queue_job_id: QUEUE_JOB_ID,
				session_id: SESSION_ID,
				user_id: USER_ID,
				stream_run_id: executionInput.streamRunId,
				client_turn_id: executionInput.clientTurnId,
				execution_generation: EXECUTION_GENERATION,
				sequence_index: sequence,
				event_id: createAgentStreamEventIdV1(TURN_RUN_ID, EXECUTION_GENERATION, sequence),
				phase: input.phase,
				event_type: input.event_type,
				durable: true,
				transition_id: input.transition_id,
				event_payload: input.event_payload,
				reconcile_required: true,
				persisted_at: '2026-08-03T12:00:00.000Z'
			};
		},
		async acknowledge(input: Record<string, unknown>) {
			return {
				outcome: 'acknowledged',
				turn_run_id: TURN_RUN_ID,
				queue_job_id: QUEUE_JOB_ID,
				execution_generation: EXECUTION_GENERATION,
				acknowledged_sequence: input.acknowledged_sequence,
				current_sequence: input.acknowledged_sequence,
				reconcile_required: false
			};
		}
	};
	const publisher = new AgenticChatStreamPublisher(
		{
			persistence: persistence as never,
			broadcast: {
				async publish(message) {
					broadcastMessages.push(message as unknown as Record<string, unknown>);
					return 'sent';
				}
			}
		},
		options.publisherConfig
	);
	publisher.start();

	const recovery = [...(options.recovery ?? [])];
	const control = {
		claim: vi.fn(async () => claim),
		begin: vi.fn(async () => {
			log.push('begin');
			return {
				outcome: 'started',
				invoke_provider: true,
				turn_run_id: TURN_RUN_ID,
				queue_job_id: QUEUE_JOB_ID,
				session_id: SESSION_ID,
				user_id: USER_ID,
				correlation_id: CORRELATION_ID,
				execution_generation: EXECUTION_GENERATION,
				execution_started_at: '2026-08-03T12:00:00.000Z',
				status: 'running'
			};
		}),
		recover: vi.fn(async () => {
			const receipt = recovery.shift();
			if (!receipt) throw new Error('Unexpected recovery call');
			return receipt;
		}),
		finalize: vi.fn(async (input: { status: 'completed' | 'failed' | 'cancelled' }) =>
			terminalReceipt(input.status, sequence + 1, {
				failure_code: input.status === 'completed' ? null : input.status,
				assistant_message_id: input.status === 'completed' ? ASSISTANT_MESSAGE_ID : null
			})
		),
		completeQueueJob: vi.fn(async () => true)
	};
	const provider = {
		stream: vi.fn(() => {
			log.push('provider');
			return (async function* () {
				for (const step of steps) yield step;
			})();
		})
	};
	const input = { load: vi.fn(async () => executionInput) };
	const readTool = { execute: vi.fn(async () => ({ title: 'Fixture project' })) };
	const mutation = {
		execute: vi.fn(async () => ({
			effectId: EFFECT_ID,
			downstreamIdempotencyKey: `chat-effect:${EFFECT_ID}`,
			downstreamReceipt: { mutationId: 'fixture-mutation-1' },
			replayed: false
		}))
	};
	const cancellationController = new AbortController();
	const cancellation = {
		registerTurn: vi.fn(() => cancellationController.signal),
		unregisterTurn: vi.fn(() => true)
	};
	const executor = new AgenticChatFixtureTurnExecutor({
		control: control as never,
		input: input as never,
		publisher,
		cancellation: cancellation as never,
		provider,
		readTool,
		mutation,
		createId: () => ASSISTANT_MESSAGE_ID
	});

	return {
		executor,
		publisher,
		control,
		input,
		provider,
		readTool,
		mutation,
		cancellation,
		cancellationController,
		semanticInputs,
		broadcastMessages,
		log,
		getSequence: () => sequence
	};
}

describe('AgenticChatFixtureTurnExecutor', () => {
	it('durably terminalizes an impossible out-of-cohort claimed row without provider work', async () => {
		const harness = createHarness([], {
			recovery: [
				recoveryReceipt('queue_reconciled', {
					status: 'failed',
					failure_code: 'internal_cohort_rejected'
				})
			]
		});

		await expect(
			harness.executor.reject(job(), {
				code: 'internal_cohort_rejected',
				message: 'Agentic Chat turn is outside the configured internal cohort'
			})
		).resolves.toMatchObject({
			outcome: 'failed',
			terminalStatus: 'failed',
			queueReconciled: true
		});
		expect(harness.control.claim).toHaveBeenCalledOnce();
		expect(harness.control.finalize).toHaveBeenCalledWith(
			expect.objectContaining({
				status: 'failed',
				failureCode: 'internal_cohort_rejected',
				assistantText: ''
			})
		);
		expect(harness.control.recover).toHaveBeenCalledWith(
			expect.objectContaining({ failureClass: 'permanent' })
		);
		expect(harness.input.load).not.toHaveBeenCalled();
		expect(harness.control.begin).not.toHaveBeenCalled();
		expect(harness.provider.stream).not.toHaveBeenCalled();
		await harness.publisher.stop();
	});

	it('streams text, executes a read-only tool, persists reconnect-safe projection, and finalizes', async () => {
		const harness = createHarness([
			{ type: 'text_delta', text: 'Hello ' },
			{
				type: 'read_tool',
				callTransitionId: CALL_TRANSITION_ID,
				resultTransitionId: RESULT_TRANSITION_ID,
				providerToolCallId: 'provider-call-1',
				toolName: 'fixture_project_read',
				arguments: { projectId: 'project-1' }
			},
			{ type: 'text_delta', text: 'done' },
			{
				type: 'finish',
				finishedReason: 'stop',
				usage: { promptTokens: 10, completionTokens: 4, totalTokens: 14 }
			}
		]);

		await expect(harness.executor.execute(job())).resolves.toEqual({
			outcome: 'completed',
			turnRunId: TURN_RUN_ID,
			executionGeneration: EXECUTION_GENERATION,
			terminalStatus: 'completed',
			queueReconciled: true
		});
		expect(harness.log.slice(0, 2)).toEqual(['begin', 'provider']);
		expect(harness.provider.stream).toHaveBeenCalledOnce();
		expect(harness.readTool.execute).toHaveBeenCalledWith(
			expect.objectContaining({
				toolName: 'fixture_project_read',
				arguments: { projectId: 'project-1' },
				executionInput
			})
		);
		expect(harness.control.finalize).toHaveBeenCalledWith(
			expect.objectContaining({
				status: 'completed',
				assistantText: 'Hello done',
				promptTokens: 10,
				completionTokens: 4,
				totalTokens: 14
			})
		);
		const secondProjection = harness.semanticInputs[1]?.projection as {
			version: string;
			semantic_events: Array<Record<string, unknown>>;
		};
		expect(secondProjection.version).toBe('agentic_chat_ui_projection_v1');
		expect(secondProjection.semantic_events).toMatchObject([
			{
				type: 'tool_call',
				sequence_index: 2,
				event_id: createAgentStreamEventIdV1(TURN_RUN_ID, EXECUTION_GENERATION, 2)
			},
			{
				type: 'tool_result',
				sequence_index: 3,
				event_id: createAgentStreamEventIdV1(TURN_RUN_ID, EXECUTION_GENERATION, 3)
			}
		]);
		expect(
			harness.broadcastMessages.map(
				(message) => (message.payload as Record<string, unknown>).type
			)
		).toEqual(['text_delta', 'tool_call', 'tool_result', 'text_delta', 'done']);
		expect(harness.cancellation.unregisterTurn).toHaveBeenCalledWith(
			TURN_RUN_ID,
			EXECUTION_GENERATION
		);
		await harness.publisher.stop();
	});

	it('routes a mutating tool through the effect-boundary port and persists its receipt', async () => {
		const harness = createHarness([
			{
				type: 'mutating_tool',
				callTransitionId: CALL_TRANSITION_ID,
				resultTransitionId: RESULT_TRANSITION_ID,
				logicalOperationId: LOGICAL_OPERATION_ID,
				providerToolCallId: 'provider-mutation-call-1',
				toolName: 'fixture_project_write',
				operationName: 'update_project',
				arguments: { projectId: 'project-1', name: 'Updated' },
				downstreamIdempotencySupported: true
			},
			{ type: 'finish', finishedReason: 'stop', usage: null }
		]);

		await expect(harness.executor.execute(job())).resolves.toMatchObject({
			outcome: 'completed',
			terminalStatus: 'completed'
		});
		expect(harness.mutation.execute).toHaveBeenCalledWith(
			expect.objectContaining({
				processingToken: PROCESSING_TOKEN,
				step: expect.objectContaining({
					logicalOperationId: LOGICAL_OPERATION_ID,
					providerToolCallId: 'provider-mutation-call-1'
				})
			})
		);
		expect(harness.semanticInputs[1]?.event_payload).toMatchObject({
			type: 'tool_result',
			result: {
				effect_id: EFFECT_ID,
				replayed: false,
				result: { mutationId: 'fixture-mutation-1' }
			}
		});
		await harness.publisher.stop();
	});

	it('stops at effect reconciliation when a non-queryable mutation outcome is uncertain', async () => {
		const harness = createHarness(
			[
				{
					type: 'mutating_tool',
					callTransitionId: CALL_TRANSITION_ID,
					resultTransitionId: RESULT_TRANSITION_ID,
					logicalOperationId: LOGICAL_OPERATION_ID,
					providerToolCallId: 'provider-mutation-call-1',
					toolName: 'fixture_project_write',
					operationName: 'update_project',
					arguments: { projectId: 'project-1', name: 'Updated' },
					downstreamIdempotencySupported: false
				},
				{ type: 'finish', finishedReason: 'stop', usage: null }
			],
			{
				recovery: [
					recoveryReceipt('effect_reconciliation_required', {
						failure_code: 'uncertain_external_commit'
					})
				]
			}
		);
		harness.mutation.execute.mockRejectedValueOnce(
			new AgenticChatEffectExecutionError(
				'uncertain_external_commit',
				EFFECT_ID,
				'connection closed after possible commit'
			)
		);

		await expect(harness.executor.execute(job())).resolves.toMatchObject({
			outcome: 'effect_reconciliation_required',
			terminalStatus: null,
			queueReconciled: false
		});
		expect(harness.control.recover).toHaveBeenCalledWith(
			expect.objectContaining({ failureClass: 'uncertain_external_commit' })
		);
		expect(harness.control.finalize).not.toHaveBeenCalled();
		await harness.publisher.stop();
	});

	it('requeues a transient immutable-input load failure before provider start', async () => {
		const harness = createHarness([], {
			recovery: [recoveryReceipt('retry_scheduled')]
		});
		harness.input.load.mockRejectedValueOnce(
			new AgenticChatExecutionInputError('database_error', 'temporary database error')
		);

		await expect(harness.executor.execute(job())).resolves.toMatchObject({
			outcome: 'requeued',
			queueReconciled: false
		});
		expect(harness.control.recover).toHaveBeenCalledWith(
			expect.objectContaining({
				failureClass: 'transient_infra',
				executionGeneration: EXECUTION_GENERATION
			})
		);
		expect(harness.control.begin).not.toHaveBeenCalled();
		expect(harness.provider.stream).not.toHaveBeenCalled();
		await harness.publisher.stop();
	});

	it('reserves provider capacity before begin and starts the network stream only after begin wins', async () => {
		const harness = createHarness([]);
		const release = vi.fn(() => harness.log.push('release'));
		const prepare = vi.fn(async () => {
			harness.log.push('prepare');
			return {
				stream: () => {
					harness.log.push('provider');
					return (async function* () {
						yield { type: 'finish', finishedReason: 'stop', usage: null } as const;
					})();
				},
				release
			};
		});
		Object.assign(harness.provider, { prepare });

		await expect(harness.executor.execute(job())).resolves.toMatchObject({
			outcome: 'completed',
			terminalStatus: 'completed'
		});
		expect(harness.log).toEqual(['prepare', 'begin', 'provider', 'release']);
		expect(prepare).toHaveBeenCalledWith({
			executionInput,
			signal: expect.any(AbortSignal)
		});
		expect(harness.provider.stream).not.toHaveBeenCalled();
		expect(release).toHaveBeenCalledOnce();
		await harness.publisher.stop();
	});

	it('releases a prepared provider without streaming when the start fence denies invocation', async () => {
		const harness = createHarness([], {
			recovery: [
				recoveryReceipt('finalize_failed', { failure_code: 'unknown' }),
				recoveryReceipt('queue_reconciled', {
					status: 'failed',
					failure_code: 'unknown'
				})
			]
		});
		const preparedStream = vi.fn();
		const release = vi.fn();
		Object.assign(harness.provider, {
			prepare: vi.fn(async () => ({ stream: preparedStream, release }))
		});
		harness.control.begin.mockResolvedValueOnce({
			outcome: 'already_started',
			invoke_provider: false,
			turn_run_id: TURN_RUN_ID,
			queue_job_id: QUEUE_JOB_ID,
			session_id: SESSION_ID,
			user_id: USER_ID,
			correlation_id: CORRELATION_ID,
			execution_generation: EXECUTION_GENERATION,
			execution_started_at: '2026-08-03T12:00:00.000Z',
			status: 'running'
		} as never);

		await expect(harness.executor.execute(job())).resolves.toMatchObject({
			outcome: 'failed',
			terminalStatus: 'failed'
		});
		expect(preparedStream).not.toHaveBeenCalled();
		expect(harness.provider.stream).not.toHaveBeenCalled();
		expect(release).toHaveBeenCalledOnce();
		await harness.publisher.stop();
	});

	it('routes a pre-start provider-capacity failure through typed retry recovery', async () => {
		const harness = createHarness([], {
			recovery: [recoveryReceipt('retry_scheduled', { failure_code: 'provider_throttle' })]
		});
		Object.assign(harness.provider, {
			prepare: vi.fn(async () => {
				throw new AgenticChatProviderExecutionError(
					'provider_capacity_unavailable',
					'provider_throttle',
					'provider saturated'
				);
			})
		});

		await expect(harness.executor.execute(job())).resolves.toMatchObject({
			outcome: 'requeued',
			queueReconciled: false
		});
		expect(harness.control.begin).not.toHaveBeenCalled();
		expect(harness.control.recover).toHaveBeenCalledWith(
			expect.objectContaining({ failureClass: 'provider_throttle' })
		);
		expect(harness.provider.stream).not.toHaveBeenCalled();
		await harness.publisher.stop();
	});

	it('never invokes the provider for a lost-response already-started receipt', async () => {
		const harness = createHarness([], {
			recovery: [
				recoveryReceipt('finalize_failed', { failure_code: 'unknown' }),
				recoveryReceipt('queue_reconciled', {
					status: 'failed',
					failure_code: 'unknown'
				})
			]
		});
		harness.control.begin.mockResolvedValueOnce({
			outcome: 'already_started',
			invoke_provider: false,
			turn_run_id: TURN_RUN_ID,
			queue_job_id: QUEUE_JOB_ID,
			session_id: SESSION_ID,
			user_id: USER_ID,
			correlation_id: CORRELATION_ID,
			execution_generation: EXECUTION_GENERATION,
			execution_started_at: '2026-08-03T12:00:00.000Z',
			status: 'running'
		} as never);

		await expect(harness.executor.execute(job())).resolves.toMatchObject({
			outcome: 'failed',
			terminalStatus: 'failed'
		});
		expect(harness.provider.stream).not.toHaveBeenCalled();
		expect(harness.control.recover.mock.calls[0]?.[0]).toMatchObject({
			failureClass: 'unknown'
		});
		await harness.publisher.stop();
	});

	it('uses durable recovery when the provider-start response is lost', async () => {
		const harness = createHarness([], {
			recovery: [
				recoveryReceipt('finalize_failed', { failure_code: 'transient_infra' }),
				recoveryReceipt('queue_reconciled', {
					status: 'failed',
					failure_code: 'transient_infra'
				})
			]
		});
		const preparedStream = vi.fn();
		const release = vi.fn();
		Object.assign(harness.provider, {
			prepare: vi.fn(async () => ({ stream: preparedStream, release }))
		});
		harness.control.begin.mockRejectedValueOnce(new Error('begin response lost'));

		await expect(harness.executor.execute(job())).resolves.toMatchObject({
			outcome: 'failed',
			terminalStatus: 'failed'
		});
		expect(preparedStream).not.toHaveBeenCalled();
		expect(harness.provider.stream).not.toHaveBeenCalled();
		expect(release).toHaveBeenCalledOnce();
		expect(harness.control.recover.mock.calls[0]?.[0]).toMatchObject({
			failureClass: 'transient_infra'
		});
		await harness.publisher.stop();
	});

	it('cannot publish or finalize after the start fence reports a stale generation', async () => {
		const harness = createHarness([], {
			recovery: [recoveryReceipt('stale_generation')]
		});
		harness.control.begin.mockResolvedValueOnce({
			outcome: 'stale_generation',
			invoke_provider: false,
			turn_run_id: TURN_RUN_ID,
			queue_job_id: QUEUE_JOB_ID,
			session_id: SESSION_ID,
			user_id: USER_ID,
			correlation_id: CORRELATION_ID,
			execution_generation: EXECUTION_GENERATION + 1,
			requested_execution_generation: EXECUTION_GENERATION,
			status: 'running'
		} as never);

		await expect(harness.executor.execute(job())).resolves.toMatchObject({
			outcome: 'stale_generation',
			terminalStatus: null
		});
		expect(harness.provider.stream).not.toHaveBeenCalled();
		expect(harness.control.finalize).not.toHaveBeenCalled();
		expect(harness.semanticInputs).toHaveLength(0);
		expect(harness.broadcastMessages).toHaveLength(0);
		await harness.publisher.stop();
	});

	it('cannot invoke or publish provider output when cancellation wins the provider-start fence', async () => {
		const harness = createHarness([], {
			recovery: [
				recoveryReceipt('finalize_cancelled'),
				recoveryReceipt('queue_reconciled', {
					status: 'cancelled',
					failure_code: 'cancelled'
				})
			]
		});
		harness.control.begin.mockResolvedValueOnce({
			outcome: 'cancel_requested',
			invoke_provider: false,
			turn_run_id: TURN_RUN_ID,
			queue_job_id: QUEUE_JOB_ID,
			session_id: SESSION_ID,
			user_id: USER_ID,
			correlation_id: CORRELATION_ID,
			execution_generation: EXECUTION_GENERATION,
			status: 'running',
			cancel_requested_at: '2026-08-03T12:00:00.000Z',
			cancel_reason: 'user_cancelled'
		} as never);

		await expect(harness.executor.execute(job())).resolves.toMatchObject({
			outcome: 'cancelled',
			terminalStatus: 'cancelled',
			queueReconciled: true
		});
		expect(harness.provider.stream).not.toHaveBeenCalled();
		expect(harness.semanticInputs).toHaveLength(0);
		expect(harness.broadcastMessages).toHaveLength(1);
		expect(harness.broadcastMessages[0]?.payload).toMatchObject({
			type: 'done',
			status: 'cancelled'
		});
		expect(harness.control.recover.mock.calls[0]?.[0]).toMatchObject({
			failureClass: 'cancelled'
		});
		await harness.publisher.stop();
	});

	it('finalizes exact durable partial text even when the provider ignores abort', async () => {
		const harness = createHarness([], {
			recovery: [
				recoveryReceipt('finalize_cancelled'),
				recoveryReceipt('queue_reconciled', {
					status: 'cancelled',
					failure_code: 'cancelled'
				})
			]
		});
		let providerContinuedAfterAbort = false;
		harness.provider.stream.mockImplementationOnce(() =>
			(async function* () {
				yield { type: 'text_delta', text: 'partial' } as const;
				harness.cancellationController.abort(
					new AgenticChatCancellationError({
						turn_run_id: TURN_RUN_ID,
						execution_generation: EXECUTION_GENERATION,
						signal_id: 'c0000000-0000-4000-8000-00000000000c',
						cancel_reason: 'user_cancelled',
						cancel_source: 'user',
						cancel_requested_at: '2026-08-03T12:00:00.000Z',
						consumed_at: '2026-08-03T12:00:00.100Z'
					})
				);
				providerContinuedAfterAbort = true;
				yield { type: 'text_delta', text: ' must-not-persist' } as const;
			})()
		);

		await expect(harness.executor.execute(job())).resolves.toMatchObject({
			outcome: 'cancelled',
			terminalStatus: 'cancelled',
			queueReconciled: true
		});
		expect(harness.control.recover.mock.calls[0]?.[0]).toMatchObject({
			failureClass: 'cancelled'
		});
		expect(harness.control.finalize).toHaveBeenCalledWith(
			expect.objectContaining({
				status: 'cancelled',
				assistantText: 'partial',
				failureCode: 'cancelled'
			})
		);
		expect(harness.control.completeQueueJob).not.toHaveBeenCalled();
		expect(providerContinuedAfterAbort).toBe(true);
		expect(harness.control.finalize.mock.calls[0]?.[0]).not.toMatchObject({
			assistantText: expect.stringContaining('must-not-persist')
		});
		expect(
			harness.broadcastMessages.some((message) =>
				JSON.stringify(message).includes('must-not-persist')
			)
		).toBe(false);
		await harness.publisher.stop();
	});

	it('honors a cancellation terminal winner returned to a completion replay', async () => {
		const harness = createHarness(
			[
				{ type: 'text_delta', text: 'complete prefix' },
				{ type: 'finish', finishedReason: 'stop', usage: null }
			],
			{
				recovery: [
					recoveryReceipt('queue_reconciled', {
						status: 'cancelled',
						failure_code: 'cancelled'
					})
				]
			}
		);
		harness.control.finalize.mockImplementationOnce(async () =>
			terminalReceipt('cancelled', harness.getSequence() + 1, {
				outcome: 'already_terminal',
				failure_code: 'cancelled',
				assistant_message_id: ASSISTANT_MESSAGE_ID
			})
		);

		await expect(harness.executor.execute(job())).resolves.toMatchObject({
			outcome: 'cancelled',
			terminalStatus: 'cancelled',
			queueReconciled: true
		});
		expect(harness.control.completeQueueJob).not.toHaveBeenCalled();
		expect(
			harness.broadcastMessages.some(
				(message) => (message.payload as Record<string, unknown>).type === 'done'
			)
		).toBe(false);
		await harness.publisher.stop();
	});

	it('turns publisher hard-bound overload into a failed terminal partial without retry', async () => {
		const harness = createHarness(
			[
				{ type: 'text_delta', text: '123456' },
				{ type: 'finish', finishedReason: 'stop', usage: null }
			],
			{
				recovery: [
					recoveryReceipt('finalize_failed', {
						failure_code: 'publisher_overload'
					}),
					recoveryReceipt('queue_reconciled', {
						status: 'failed',
						failure_code: 'publisher_overload'
					})
				],
				publisherConfig: {
					turnPendingSoftBytes: 2,
					turnPendingHardBytes: 5
				}
			}
		);

		await expect(harness.executor.execute(job())).resolves.toMatchObject({
			outcome: 'failed',
			terminalStatus: 'failed',
			queueReconciled: true
		});
		expect(harness.control.recover.mock.calls[0]?.[0]).toMatchObject({
			failureClass: 'publisher_overload'
		});
		expect(harness.control.finalize).toHaveBeenCalledWith(
			expect.objectContaining({
				status: 'failed',
				assistantText: '123456',
				failureCode: 'publisher_overload'
			})
		);
		await harness.publisher.stop();
	});

	it('keeps committed completion truth when queue completion cannot be acknowledged', async () => {
		const harness = createHarness([
			{ type: 'text_delta', text: 'done' },
			{ type: 'finish', finishedReason: 'stop', usage: null }
		]);
		harness.control.completeQueueJob.mockResolvedValueOnce(false);

		await expect(harness.executor.execute(job())).resolves.toMatchObject({
			outcome: 'completed',
			terminalStatus: 'completed',
			queueReconciled: false
		});
		await harness.publisher.stop();
	});
});
