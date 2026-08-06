// apps/worker/tests/agenticChatFixtureTurnExecutor.test.ts
import {
	AGENTIC_CHAT_INPUT_ARTIFACT_VERSION,
	AGENTIC_CHAT_INPUT_ARTIFACT_VERSION_V2,
	createAgentStreamEventIdV1
} from '@buildos/shared-types';
import {
	AGENTIC_CHAT_PARTIAL_CANCELLATION_FIXTURE_V1,
	AGENTIC_CHAT_PARTIAL_CANCELLATION_GOLDEN_V1,
	AGENTIC_CHAT_PROVIDER_ERROR_FIXTURE_V1,
	AGENTIC_CHAT_PROVIDER_ERROR_GOLDEN_V1,
	AGENTIC_CHAT_READ_ONLY_TOOL_FIXTURE_V1,
	AGENTIC_CHAT_READ_ONLY_TOOL_GOLDEN_V1,
	AGENTIC_CHAT_TEXT_ONLY_SUCCESS_FIXTURE_V1,
	AGENTIC_CHAT_TEXT_ONLY_SUCCESS_GOLDEN_V1,
	diffAgenticChatParityRunsV1,
	normalizeAgenticChatParityRunV1,
	projectAgenticChatWorkerLifecycleObservationsV1
} from '@buildos/agentic-chat-runtime';
import { describe, expect, it, vi } from 'vitest';
import type { ProcessingJob } from '../src/lib/supabaseQueue';
import { AgenticChatCancellationError } from '../src/workers/agentic-chat/cancellationObserver';
import type { AgenticChatTerminalFinalizeInputV1 } from '../src/workers/agentic-chat/executionControl';
import type { AgenticChatExecutionObservationInputV1 } from '../src/workers/agentic-chat/executionObservation';
import { AgenticChatExecutionInputError } from '../src/workers/agentic-chat/executionInput';
import { AgenticChatEffectExecutionError } from '../src/workers/agentic-chat/fixtureMutationExecutor';
import { createStableAgenticChatLifecycleTransitionIdV1 } from '../src/workers/agentic-chat/lifecycleIdentity';
import {
	AgenticChatFixtureTurnExecutor,
	type AgenticChatFixtureProviderStepV1
} from '../src/workers/agentic-chat/fixtureTurnExecutor';
import { AgenticChatProviderExecutionError } from '../src/workers/agentic-chat/providerContract';
import type { AgenticChatPreparedPromptSnapshotV1 } from '../src/workers/agentic-chat/providerContract';
import { AgenticChatReadOnlyToolAdapter } from '../src/workers/agentic-chat/readOnlyTool';
import { createStableAgenticChatPromptSnapshotIdV1 } from '../src/workers/agentic-chat/promptSnapshot';
import type { AgenticChatRuntimeTimingSnapshotV1 } from '../src/workers/agentic-chat/runtimeTiming';
import { AgenticChatStreamPublisher } from '../src/workers/agentic-chat/streamPublisher';
import { AgenticChatToolExecutionTimeoutError } from '../src/workers/agentic-chat/toolExecution';

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

const fixturePromptSnapshot = {
	snapshotVersion: 'agentic_chat_worker_prompt_v1',
	modelMessages: [
		{ role: 'system', content: 'Fixture only' },
		{ role: 'user', content: 'Use the fixture' }
	],
	systemPromptSha256: 'a'.repeat(64),
	messagesSha256: 'b'.repeat(64),
	systemPromptChars: 12,
	messageChars: 27,
	approxPromptTokens: 7
} satisfies AgenticChatPreparedPromptSnapshotV1;

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
		rawHistoryCount: 0,
		historyForModelCount: 0,
		preparedPromptId: null,
		preparedPromptHit: false,
		preparedPromptMissReason: null,
		preparedSurfaceProfile: null
	},
	artifact: {
		artifactVersion: AGENTIC_CHAT_INPUT_ARTIFACT_VERSION,
		historySource: 'admission_window',
		history: [],
		prepared: {
			sourcePreparedPromptId: null,
			contextPayload: {},
			conversationSummary: null,
			surfaceProfile: 'fixture',
			systemPrompt: 'Fixture only',
			promptSections: [],
			toolSurface: {},
			sessionSnapshot: {
				summary: null,
				agent_metadata: {}
			},
			contextUsageSnapshot: {
				estimatedTokens: 12,
				tokenBudget: 1_000,
				usagePercent: 1,
				tokensRemaining: 988,
				status: 'ok',
				lastCompressedAt: null,
				lastCompression: null
			}
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

function executionBoundaryLogs(processingJob: ReturnType<typeof job>) {
	return processingJob.log.mock.calls.map(
		([message]) => JSON.parse(message) as Record<string, unknown>
	);
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
		timingClockValues?: number[];
		failBroadcastType?: string;
		promptSnapshot?: AgenticChatPreparedPromptSnapshotV1;
		promptSnapshotError?: Error;
		providerBudgetMs?: number;
		overheadTimeoutMs?: number;
	} = {}
) {
	let sequence = 0;
	const semanticInputs: Array<Record<string, unknown>> = [];
	const broadcastMessages: Array<Record<string, unknown>> = [];
	const timingSnapshots: AgenticChatRuntimeTimingSnapshotV1[] = [];
	const log: string[] = [];
	const timingClockValues = options.timingClockValues ? [...options.timingClockValues] : null;
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
			const payload = input.event_payload as Record<string, unknown>;
			log.push(`semantic:${String(payload.type)}:${String(payload.turn_phase ?? '')}`);
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
					if (
						message.kind === 'event' &&
						(message.payload as Record<string, unknown>).type ===
							options.failBroadcastType
					) {
						return 'failed';
					}
					return 'sent';
				}
			}
		},
		options.publisherConfig
	);
	publisher.start();

	const recovery = [...(options.recovery ?? [])];
	let claimCount = 0;
	const control = {
		claim: vi.fn(async () => {
			claimCount += 1;
			return claimCount === 1
				? claim
				: {
						...claim,
						outcome: 'matching_current_claim' as const,
						executionMayStart: false
					};
		}),
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
		finalize: vi.fn(async (input: AgenticChatTerminalFinalizeInputV1) => {
			const lastTurnContext = input.lastTurnContext ?? null;
			if (
				input.status === 'failed' &&
				input.publicError &&
				input.errorTransitionId &&
				input.timingDraft &&
				input.timingTransitionId
			) {
				const timingDraft = input.timingDraft as Record<string, unknown>;
				const draftPhases = timingDraft.phases as Record<string, unknown>;
				const errorSequence = sequence + 1;
				const timingSequence = sequence + 2;
				const terminalSequence = sequence + 3;
				const terminalCommittedAt = AGENTIC_CHAT_PROVIDER_ERROR_FIXTURE_V1.clockIso;
				sequence = timingSequence;
				return terminalReceipt('failed', terminalSequence, {
					finished_reason: input.finishedReason,
					failure_code: input.failureCode,
					assistant_message_id: null,
					terminalized_at: terminalCommittedAt,
					preterminal_events: [
						{
							outcome: 'persisted',
							publish_allowed: true,
							turn_run_id: TURN_RUN_ID,
							queue_job_id: QUEUE_JOB_ID,
							session_id: SESSION_ID,
							user_id: USER_ID,
							stream_run_id: executionInput.streamRunId,
							client_turn_id: executionInput.clientTurnId,
							execution_generation: EXECUTION_GENERATION,
							sequence_index: errorSequence,
							event_id: createAgentStreamEventIdV1(
								TURN_RUN_ID,
								EXECUTION_GENERATION,
								errorSequence
							),
							phase: 'finalize',
							event_type: 'error',
							durable: true,
							transition_id: input.errorTransitionId,
							event_payload: { type: 'error', error: input.publicError },
							reconcile_required: true,
							persisted_at: terminalCommittedAt
						},
						{
							outcome: 'persisted',
							publish_allowed: true,
							turn_run_id: TURN_RUN_ID,
							queue_job_id: QUEUE_JOB_ID,
							session_id: SESSION_ID,
							user_id: USER_ID,
							stream_run_id: executionInput.streamRunId,
							client_turn_id: executionInput.clientTurnId,
							execution_generation: EXECUTION_GENERATION,
							sequence_index: timingSequence,
							event_id: createAgentStreamEventIdV1(
								TURN_RUN_ID,
								EXECUTION_GENERATION,
								timingSequence
							),
							phase: 'finalize',
							event_type: 'timing',
							durable: true,
							transition_id: input.timingTransitionId,
							event_payload: {
								type: 'timing',
								timing: {
									...timingDraft,
									assistant_persisted_at: null,
									done_emitted_at: null,
									terminal_committed_at: terminalCommittedAt,
									phases: { ...draftPhases, total_request_ms: 3_000 }
								}
							},
							reconcile_required: true,
							persisted_at: terminalCommittedAt
						}
					]
				});
			}
			const terminalCommittedAt =
				input.status === 'cancelled'
					? AGENTIC_CHAT_PARTIAL_CANCELLATION_FIXTURE_V1.clockIso
					: AGENTIC_CHAT_TEXT_ONLY_SUCCESS_FIXTURE_V1.clockIso;
			if ((input.status === 'completed' || input.status === 'cancelled') && lastTurnContext) {
				if (input.timingDraft && input.timingTransitionId) {
					const timingDraft = input.timingDraft as Record<string, unknown>;
					const draftPhases = timingDraft.phases as Record<string, unknown>;
					const contextSequence = sequence + 1;
					const timingSequence = sequence + 2;
					const terminalSequence = sequence + 3;
					sequence = timingSequence;
					return terminalReceipt(input.status, terminalSequence, {
						failure_code: input.failureCode,
						assistant_message_id: input.assistantMessageId,
						preterminal_events: [
							{
								outcome: 'persisted',
								publish_allowed: true,
								turn_run_id: TURN_RUN_ID,
								queue_job_id: QUEUE_JOB_ID,
								session_id: SESSION_ID,
								user_id: USER_ID,
								stream_run_id: executionInput.streamRunId,
								client_turn_id: executionInput.clientTurnId,
								execution_generation: EXECUTION_GENERATION,
								sequence_index: contextSequence,
								event_id: createAgentStreamEventIdV1(
									TURN_RUN_ID,
									EXECUTION_GENERATION,
									contextSequence
								),
								phase: 'finalize',
								event_type: 'last_turn_context',
								durable: true,
								transition_id: input.lastTurnContextTransitionId,
								event_payload: {
									type: 'last_turn_context',
									context: {
										...lastTurnContext,
										timestamp: terminalCommittedAt
									}
								},
								reconcile_required: true,
								persisted_at: '2026-08-03T12:00:00.000Z'
							},
							{
								outcome: 'persisted',
								publish_allowed: true,
								turn_run_id: TURN_RUN_ID,
								queue_job_id: QUEUE_JOB_ID,
								session_id: SESSION_ID,
								user_id: USER_ID,
								stream_run_id: executionInput.streamRunId,
								client_turn_id: executionInput.clientTurnId,
								execution_generation: EXECUTION_GENERATION,
								sequence_index: timingSequence,
								event_id: createAgentStreamEventIdV1(
									TURN_RUN_ID,
									EXECUTION_GENERATION,
									timingSequence
								),
								phase: 'finalize',
								event_type: 'timing',
								durable: true,
								transition_id: input.timingTransitionId,
								event_payload: {
									type: 'timing',
									timing: {
										...timingDraft,
										assistant_persisted_at: terminalCommittedAt,
										done_emitted_at: null,
										terminal_committed_at: terminalCommittedAt,
										phases: { ...draftPhases, total_request_ms: 3_000 }
									}
								},
								reconcile_required: true,
								persisted_at: '2026-08-03T12:00:00.000Z'
							}
						]
					});
				}
				sequence += 1;
				return terminalReceipt(input.status, sequence + 1, {
					failure_code: input.failureCode,
					assistant_message_id: input.assistantMessageId,
					preterminal_event: {
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
						phase: 'finalize',
						event_type: 'last_turn_context',
						durable: true,
						transition_id: input.lastTurnContextTransitionId,
						event_payload: {
							type: 'last_turn_context',
							context: {
								...lastTurnContext,
								timestamp: terminalCommittedAt
							}
						},
						reconcile_required: true,
						persisted_at: '2026-08-03T12:00:00.010Z'
					}
				});
			}
			return terminalReceipt(input.status, sequence + 1, {
				failure_code: input.failureCode,
				assistant_message_id: input.assistantMessageId
			});
		}),
		completeQueueJob: vi.fn(async () => true)
	};
	const providerStream = vi.fn(() => {
		log.push('provider');
		return (async function* () {
			for (const step of steps) yield step;
		})();
	});
	const provider = options.promptSnapshot
		? {
				stream: providerStream,
				prepare: vi.fn(async () => ({
					promptSnapshot: options.promptSnapshot,
					stream: providerStream,
					release: vi.fn()
				}))
			}
		: {
				stream: providerStream
			};
	const promptSnapshots = {
		persist: vi.fn(async () => {
			log.push('prompt_snapshot');
			if (options.promptSnapshotError) throw options.promptSnapshotError;
			return {
				outcome: 'persisted' as const,
				snapshotAvailable: true,
				promptSnapshotId: createStableAgenticChatPromptSnapshotIdV1(TURN_RUN_ID)
			};
		})
	};
	const promptSnapshotErrors: unknown[] = [];
	const input = { load: vi.fn(async () => executionInput) };
	const readTool = {
		execute: vi.fn(async () => ({
			result: { title: 'Fixture project' },
			executionTimeMs: null,
			tokensConsumed: null,
			affectedEntities: [],
			toolCategory: null,
			resultCount: null,
			zeroResult: null,
			requiresUserAction: null
		}))
	};
	const toolExecutions = { persistRead: vi.fn(async () => undefined) };
	const executionObservationInputs: AgenticChatExecutionObservationInputV1[] = [];
	const executionObservations = {
		observe: vi.fn(async (observation: AgenticChatExecutionObservationInputV1) => {
			executionObservationInputs.push(observation);
		})
	};
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
	const executor = new AgenticChatFixtureTurnExecutor(
		{
			control: control as never,
			input: input as never,
			publisher,
			cancellation: cancellation as never,
			provider,
			promptSnapshots,
			executionObservations,
			onPromptSnapshotError: (error) => promptSnapshotErrors.push(error),
			readTool,
			toolExecutions,
			mutation,
			createId: () => ASSISTANT_MESSAGE_ID,
			timingClock: timingClockValues
				? {
						nowMs() {
							const value = timingClockValues.shift();
							if (value === undefined) {
								throw new Error('Fixture executor monotonic clock exhausted');
							}
							return value;
						}
					}
				: undefined,
			onTimingSnapshot: (snapshot) => timingSnapshots.push(snapshot)
		},
		{
			providerBudgetMs: options.providerBudgetMs,
			overheadTimeoutMs: options.overheadTimeoutMs
		}
	);

	return {
		executor,
		publisher,
		control,
		input,
		provider,
		promptSnapshots,
		promptSnapshotErrors,
		readTool,
		toolExecutions,
		executionObservations,
		executionObservationInputs,
		mutation,
		cancellation,
		cancellationController,
		semanticInputs,
		broadcastMessages,
		timingSnapshots,
		log,
		getSequence: () => sequence
	};
}

describe('AgenticChatFixtureTurnExecutor', () => {
	it('persists one exact prompt snapshot after the first durable response only', async () => {
		const harness = createHarness(
			[
				{ type: 'text_delta', text: 'first' },
				{ type: 'text_delta', text: ' second' },
				{ type: 'finish', finishedReason: 'stop', usage: null }
			],
			{ promptSnapshot: fixturePromptSnapshot }
		);

		await expect(harness.executor.execute(job())).resolves.toMatchObject({
			outcome: 'completed',
			terminalStatus: 'completed'
		});
		expect(harness.promptSnapshots.persist).toHaveBeenCalledOnce();
		expect(harness.promptSnapshots.persist).toHaveBeenCalledWith({
			turnRunId: TURN_RUN_ID,
			userId: USER_ID,
			queueJobId: QUEUE_JOB_ID,
			processingToken: PROCESSING_TOKEN,
			executionGeneration: EXECUTION_GENERATION,
			promptSnapshotId: createStableAgenticChatPromptSnapshotIdV1(TURN_RUN_ID),
			prompt: fixturePromptSnapshot
		});
		expect(harness.log.indexOf('prompt_snapshot')).toBeGreaterThan(
			harness.log.indexOf('provider')
		);
		await harness.publisher.stop();
	});

	it('reports prompt-snapshot failure without overturning durable response truth', async () => {
		const error = new Error('snapshot database unavailable');
		const harness = createHarness(
			[
				{ type: 'text_delta', text: 'response survives' },
				{ type: 'finish', finishedReason: 'stop', usage: null }
			],
			{ promptSnapshot: fixturePromptSnapshot, promptSnapshotError: error }
		);

		await expect(harness.executor.execute(job())).resolves.toMatchObject({
			outcome: 'completed',
			terminalStatus: 'completed'
		});
		expect(harness.promptSnapshotErrors).toEqual([error]);
		expect(harness.control.finalize).toHaveBeenCalledWith(
			expect.objectContaining({ assistantText: 'response survives' })
		);
		await harness.publisher.stop();
	});

	it('does not create a snapshot when the provider produces no response text', async () => {
		const harness = createHarness([{ type: 'finish', finishedReason: 'stop', usage: null }], {
			promptSnapshot: fixturePromptSnapshot
		});

		await expect(harness.executor.execute(job())).resolves.toMatchObject({
			outcome: 'completed'
		});
		expect(harness.promptSnapshots.persist).not.toHaveBeenCalled();
		await harness.publisher.stop();
	});

	it('commits and publishes deterministic timing between context and done', async () => {
		const harness = createHarness(
			[
				{ type: 'text_delta', text: 'timed response' },
				{ type: 'finish', finishedReason: 'stop', usage: null }
			],
			{ timingClockValues: [100, 110, 120, 150, 160, 190] }
		);

		await expect(harness.executor.execute(job())).resolves.toMatchObject({
			outcome: 'completed',
			terminalStatus: 'completed'
		});
		expect(harness.timingSnapshots).toEqual([
			expect.objectContaining({
				database: expect.objectContaining({
					admittedAt: executionInput.timingBaseline.admittedAt,
					executionStartedAt: '2026-08-03T12:00:00.000Z'
				}),
				preterminal: {
					providerAuthorityObservedAtMs: 100,
					firstEventPersistedAt: '2026-08-03T12:00:00.000Z',
					firstEventPersistenceObservedAtMs: 110,
					firstResponsePersistedAt: '2026-08-03T12:00:00.000Z',
					firstResponsePersistenceObservedAtMs: 120,
					providerFinishedAtMs: 150,
					terminalCallStartedAtMs: 160,
					durationsMs: {
						authorityToFirstEventPersistence: 10,
						authorityToFirstResponsePersistence: 20,
						firstResponsePersistenceToProviderFinish: 30,
						authorityToProviderFinish: 50,
						providerFinishToTerminalCall: 10
					}
				},
				postcallTelemetry: {
					terminalCallCompletedAtMs: 190,
					terminalCall: 30
				}
			})
		]);
		const terminalTypes = harness.broadcastMessages
			.map((message) => (message.payload as Record<string, unknown>).type)
			.filter((type) => type === 'last_turn_context' || type === 'timing' || type === 'done');
		expect(terminalTypes).toEqual(['last_turn_context', 'timing', 'done']);
		expect(harness.control.finalize).toHaveBeenCalledWith(
			expect.objectContaining({
				timingDraft: expect.objectContaining({
					timing_contract_version: 'agentic_chat_async_v1',
					finished_reason: 'stop',
					phases: expect.objectContaining({
						provider_authority_to_finish_ms: 50,
						provider_finish_to_terminal_call_ms: 10
					})
				}),
				timingTransitionId: createStableAgenticChatLifecycleTransitionIdV1({
					turnRunId: TURN_RUN_ID,
					stage: 'timing'
				})
			})
		);
		await harness.publisher.stop();
	});

	it('does not publish done when the committed timing prefix degrades to reconciliation', async () => {
		const harness = createHarness(
			[
				{ type: 'text_delta', text: 'timed response' },
				{ type: 'finish', finishedReason: 'stop', usage: null }
			],
			{
				timingClockValues: [100, 110, 120, 150, 160, 190],
				failBroadcastType: 'timing'
			}
		);

		await expect(harness.executor.execute(job())).resolves.toMatchObject({
			outcome: 'completed',
			terminalStatus: 'completed',
			queueReconciled: true
		});
		const terminalTypes = harness.broadcastMessages
			.map((message) => (message.payload as Record<string, unknown>).type)
			.filter((type) => type === 'last_turn_context' || type === 'timing' || type === 'done');
		expect(terminalTypes).toEqual(['last_turn_context', 'timing']);
		await harness.publisher.stop();
	});

	it('keeps queue delay in database time instead of inflating monotonic provider duration', async () => {
		const harness = createHarness(
			[
				{ type: 'text_delta', text: 'queued response' },
				{ type: 'finish', finishedReason: 'stop', usage: null }
			],
			{ timingClockValues: [200, 210, 220, 250, 260, 290] }
		);
		const queuedInput = {
			...executionInput,
			timingBaseline: {
				...executionInput.timingBaseline,
				admittedAt: '2026-08-03T11:00:00.000Z',
				startedAt: '2026-08-03T11:00:01.000Z',
				historyCutoffAt: '2026-08-03T11:00:01.000Z'
			}
		};
		harness.input.load.mockResolvedValueOnce(queuedInput);

		await expect(harness.executor.execute(job())).resolves.toMatchObject({
			outcome: 'completed'
		});
		expect(harness.timingSnapshots[0]).toMatchObject({
			database: {
				admittedAt: '2026-08-03T11:00:00.000Z',
				workerStartedAt: '2026-08-03T11:59:59.000Z',
				executionStartedAt: '2026-08-03T12:00:00.000Z'
			},
			preterminal: {
				durationsMs: {
					authorityToProviderFinish: 50,
					authorityToFirstResponsePersistence: 20
				}
			}
		});
		expect(
			harness.broadcastMessages.some(
				(message) => (message.payload as Record<string, unknown>).type === 'timing'
			)
		).toBe(true);
		await harness.publisher.stop();
	});

	it('does not let observational clock failure change terminal truth', async () => {
		const harness = createHarness(
			[
				{ type: 'text_delta', text: 'clock-safe response' },
				{ type: 'finish', finishedReason: 'stop', usage: null }
			],
			{ timingClockValues: [100, 99] }
		);

		await expect(harness.executor.execute(job())).resolves.toMatchObject({
			outcome: 'completed',
			terminalStatus: 'completed',
			queueReconciled: true
		});
		expect(harness.timingSnapshots).toEqual([]);
		expect(harness.control.finalize).toHaveBeenCalledOnce();
		await harness.publisher.stop();
	});

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
		harness.readTool.execute.mockResolvedValueOnce({
			result: {
				project: {
					id: 'da000000-0000-4000-8000-000000000001',
					name: 'Fixture project'
				}
			},
			executionTimeMs: null,
			tokensConsumed: null,
			affectedEntities: [],
			toolCategory: null,
			resultCount: null,
			zeroResult: null,
			requiresUserAction: null
		});

		await expect(harness.executor.execute(job())).resolves.toEqual({
			outcome: 'completed',
			turnRunId: TURN_RUN_ID,
			executionGeneration: EXECUTION_GENERATION,
			terminalStatus: 'completed',
			queueReconciled: true
		});
		expect(harness.log.slice(0, 5)).toEqual([
			'begin',
			'semantic:turn_phase:acknowledged',
			'semantic:session:',
			'semantic:context_usage:',
			'provider'
		]);
		expect(harness.provider.stream).toHaveBeenCalledOnce();
		expect(harness.readTool.execute).toHaveBeenCalledWith(
			expect.objectContaining({
				toolName: 'fixture_project_read',
				arguments: { projectId: 'project-1' },
				executionInput
			})
		);
		expect(
			harness.executionObservationInputs.map(({ eventType, payload }) => ({
				eventType,
				status: payload.status ?? null,
				toolName: payload.tool_name
			}))
		).toEqual([
			{
				eventType: 'tool_execution_started',
				status: null,
				toolName: 'fixture_project_read'
			},
			{
				eventType: 'tool_execution_ended',
				status: 'success',
				toolName: 'fixture_project_read'
			}
		]);
		expect(JSON.stringify(harness.executionObservationInputs)).not.toContain('Fixture project');
		expect(harness.control.finalize).toHaveBeenCalledWith(
			expect.objectContaining({
				status: 'completed',
				assistantText: 'Hello done',
				promptTokens: 10,
				completionTokens: 4,
				totalTokens: 14,
				lastTurnContext: expect.objectContaining({
					summary: 'Hello done',
					data_accessed: ['fixture_project_read'],
					entities: expect.objectContaining({
						projects: [
							expect.objectContaining({
								id: 'da000000-0000-4000-8000-000000000001',
								name: 'Fixture project'
							})
						]
					})
				})
			})
		);
		const toolResultInput = harness.semanticInputs.find(
			(input) => (input.event_payload as Record<string, unknown>)?.type === 'tool_result'
		);
		const toolResultProjection = toolResultInput?.projection as {
			version: string;
			semantic_events: Array<Record<string, unknown>>;
		};
		expect(toolResultProjection.version).toBe('agentic_chat_ui_projection_v1');
		expect(toolResultProjection.semantic_events).toMatchObject([
			{
				type: 'turn_phase',
				turn_phase: 'acknowledged',
				sequence_index: 1,
				event_id: createAgentStreamEventIdV1(TURN_RUN_ID, EXECUTION_GENERATION, 1)
			},
			{
				type: 'session',
				sequence_index: 2,
				event_id: createAgentStreamEventIdV1(TURN_RUN_ID, EXECUTION_GENERATION, 2)
			},
			{
				type: 'context_usage',
				sequence_index: 3,
				event_id: createAgentStreamEventIdV1(TURN_RUN_ID, EXECUTION_GENERATION, 3)
			},
			{
				type: 'tool_call',
				sequence_index: 5,
				event_id: createAgentStreamEventIdV1(TURN_RUN_ID, EXECUTION_GENERATION, 5)
			},
			{
				type: 'tool_result',
				sequence_index: 6,
				event_id: createAgentStreamEventIdV1(TURN_RUN_ID, EXECUTION_GENERATION, 6)
			}
		]);
		expect(
			harness.semanticInputs
				.filter((input) => input.event_type === 'turn_phase')
				.map((input) => ({
					transition_id: input.transition_id,
					event_payload: input.event_payload
				}))
		).toEqual([
			{
				transition_id: createStableAgenticChatLifecycleTransitionIdV1({
					turnRunId: TURN_RUN_ID,
					stage: 'acknowledged'
				}),
				event_payload: {
					type: 'turn_phase',
					turn_phase: 'acknowledged',
					message: 'Request received. Preparing the workspace context...'
				}
			},
			{
				transition_id: createStableAgenticChatLifecycleTransitionIdV1({
					turnRunId: TURN_RUN_ID,
					stage: 'finalizing'
				}),
				event_payload: {
					type: 'turn_phase',
					turn_phase: 'finalizing',
					message: 'Finalizing the response...'
				}
			}
		]);
		expect(
			harness.semanticInputs
				.filter(
					(input) =>
						input.event_type === 'session' || input.event_type === 'context_usage'
				)
				.map((input) => ({
					event_type: input.event_type,
					transition_id: input.transition_id,
					event_payload: input.event_payload
				}))
		).toEqual([
			{
				event_type: 'session',
				transition_id: createStableAgenticChatLifecycleTransitionIdV1({
					turnRunId: TURN_RUN_ID,
					stage: 'session'
				}),
				event_payload: {
					type: 'session',
					session: {
						id: SESSION_ID,
						summary: null,
						agent_metadata: {}
					}
				}
			},
			{
				event_type: 'context_usage',
				transition_id: createStableAgenticChatLifecycleTransitionIdV1({
					turnRunId: TURN_RUN_ID,
					stage: 'context_usage'
				}),
				event_payload: {
					type: 'context_usage',
					usage: executionInput.artifact.prepared.contextUsageSnapshot
				}
			}
		]);
		expect(
			harness.broadcastMessages.map(
				(message) => (message.payload as Record<string, unknown>).type
			)
		).toEqual([
			'turn_phase',
			'session',
			'context_usage',
			'text_delta',
			'tool_call',
			'tool_result',
			'text_delta',
			'turn_phase',
			'last_turn_context',
			'timing',
			'done'
		]);
		expect(harness.cancellation.unregisterTurn).toHaveBeenCalledWith(
			TURN_RUN_ID,
			EXECUTION_GENERATION
		);
		await harness.publisher.stop();
	});

	it('keeps rolling v2 artifacts executable without fabricating v3 snapshots', async () => {
		const harness = createHarness([
			{ type: 'text_delta', text: 'legacy artifact' },
			{ type: 'finish', finishedReason: 'stop', usage: null }
		]);
		const {
			sessionSnapshot: _sessionSnapshot,
			contextUsageSnapshot: _contextUsageSnapshot,
			...legacyPrepared
		} = executionInput.artifact.prepared;
		harness.input.load.mockResolvedValueOnce({
			...executionInput,
			artifact: {
				...executionInput.artifact,
				artifactVersion: AGENTIC_CHAT_INPUT_ARTIFACT_VERSION_V2,
				prepared: legacyPrepared
			}
		} as never);

		await expect(harness.executor.execute(job())).resolves.toMatchObject({
			outcome: 'completed',
			terminalStatus: 'completed'
		});
		expect(
			harness.broadcastMessages.map(
				(message) => (message.payload as Record<string, unknown>).type
			)
		).toEqual([
			'turn_phase',
			'text_delta',
			'turn_phase',
			'last_turn_context',
			'timing',
			'done'
		]);
		await harness.publisher.stop();
	});

	it('starts synthesis only after the single read is fenced, durable, and publicly committed', async () => {
		const harness = createHarness([]);
		const readExecution = {
			result: {
				project: {
					id: 'da000000-0000-4000-8000-000000000001',
					name: 'Fixture project'
				}
			},
			executionTimeMs: 12,
			tokensConsumed: null,
			affectedEntities: [],
			toolCategory: 'utility',
			resultCount: 1,
			zeroResult: false,
			requiresUserAction: false
		};
		harness.readTool.execute.mockResolvedValueOnce(readExecution);
		harness.toolExecutions.persistRead.mockImplementationOnce(async () => {
			harness.log.push('tool_ledger');
		});
		const synthesize = vi.fn((feedback) => {
			harness.log.push('synthesize');
			expect(feedback).toEqual({
				providerToolCallId: 'provider-read-1',
				toolName: 'get_project_overview',
				arguments: { project_id: 'da000000-0000-4000-8000-000000000001' },
				execution: readExecution
			});
			return (async function* () {
				yield { type: 'text_delta', text: 'The fixture project is ready.' } as const;
				yield {
					type: 'finish',
					finishedReason: 'stop',
					usage: { promptTokens: 10, completionTokens: 6, totalTokens: 16 }
				} as const;
			})();
		});
		Object.assign(harness.provider, {
			prepare: vi.fn(async () => ({
				stream: () =>
					(async function* () {
						yield {
							type: 'read_tool',
							callTransitionId: CALL_TRANSITION_ID,
							resultTransitionId: RESULT_TRANSITION_ID,
							providerToolCallId: 'provider-read-1',
							toolName: 'get_project_overview',
							arguments: {
								project_id: 'da000000-0000-4000-8000-000000000001'
							}
						} as const;
					})(),
				synthesize,
				release: vi.fn()
			}))
		});

		const processingJob = job();
		await expect(harness.executor.execute(processingJob)).resolves.toMatchObject({
			outcome: 'completed',
			terminalStatus: 'completed'
		});
		expect(synthesize).toHaveBeenCalledOnce();
		expect(harness.control.claim).toHaveBeenCalledTimes(2);
		const ledgerIndex = harness.log.indexOf('tool_ledger');
		const publicResultIndex = harness.log.indexOf('semantic:tool_result:');
		const synthesisIndex = harness.log.indexOf('synthesize');
		expect(ledgerIndex).toBeGreaterThan(-1);
		expect(publicResultIndex).toBeGreaterThan(ledgerIndex);
		expect(synthesisIndex).toBeGreaterThan(publicResultIndex);
		expect(
			executionBoundaryLogs(processingJob).map(({ stage, state }) => `${stage}:${state}`)
		).toEqual([
			'read_op:started',
			'read_op:finished',
			'ledger_persist:started',
			'ledger_persist:finished',
			'tool_result_publish:started',
			'tool_result_publish:finished',
			'synthesis:started'
		]);
		expect(executionBoundaryLogs(processingJob)).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					event: 'agentic_chat_execution_boundary',
					turn_run_id: TURN_RUN_ID,
					queue_job_id: QUEUE_JOB_ID,
					execution_generation: EXECUTION_GENERATION,
					provider_tool_call_id: 'provider-read-1',
					tool_name: 'get_project_overview'
				})
			])
		);
		for (const boundary of executionBoundaryLogs(processingJob)) {
			expect(boundary).not.toHaveProperty('arguments');
			expect(boundary).not.toHaveProperty('result');
		}
		expect(harness.control.finalize).toHaveBeenCalledWith(
			expect.objectContaining({
				assistantText: 'The fixture project is ready.',
				promptTokens: 10,
				completionTokens: 6,
				totalTokens: 16
			})
		);
		await harness.publisher.stop();
	});

	it('writes a terminal outcome when a read-tool network call exceeds its local deadline', async () => {
		const harness = createHarness(
			[
				{
					type: 'read_tool',
					callTransitionId: CALL_TRANSITION_ID,
					resultTransitionId: RESULT_TRANSITION_ID,
					providerToolCallId: 'provider-read-timeout',
					toolName: 'get_project_overview',
					arguments: { project_id: 'da000000-0000-4000-8000-000000000001' }
				}
			],
			{
				recovery: [
					recoveryReceipt('finalize_failed', { failure_code: 'transient_infra' }),
					recoveryReceipt('queue_reconciled', {
						status: 'failed',
						failure_code: 'read_tool_timeout'
					})
				]
			}
		);
		let deadlineSignal: AbortSignal | null = null;
		const readAdapter = new AgenticChatReadOnlyToolAdapter({} as never, {
			timeoutMs: 10,
			runOp: (input) =>
				new Promise<never>(() => {
					deadlineSignal = input.signal;
				})
		});
		harness.readTool.execute.mockImplementation(readAdapter.execute.bind(readAdapter));

		const processingJob = job();
		try {
			await expect(harness.executor.execute(processingJob)).resolves.toMatchObject({
				outcome: 'failed',
				terminalStatus: 'failed',
				queueReconciled: true
			});
			expect(deadlineSignal).toMatchObject({ aborted: true });
			expect(harness.control.recover.mock.calls[0]?.[0]).toMatchObject({
				failureClass: 'transient_infra',
				errorMessage: expect.stringContaining('read tool exceeded its 10ms deadline')
			});
			expect(harness.control.finalize).toHaveBeenCalledWith(
				expect.objectContaining({
					status: 'failed',
					failureCode: 'read_tool_timeout'
				})
			);
			expect(
				executionBoundaryLogs(processingJob).map(({ stage, state, error_code }) => ({
					stage,
					state,
					error_code
				}))
			).toEqual([
				{ stage: 'read_op', state: 'started', error_code: undefined },
				{ stage: 'read_op', state: 'failed', error_code: 'read_tool_timeout' }
			]);
		} finally {
			await harness.publisher.stop();
		}
	});

	it('identifies ledger persistence as the failed boundary without logging tool data', async () => {
		const harness = createHarness(
			[
				{
					type: 'read_tool',
					callTransitionId: CALL_TRANSITION_ID,
					resultTransitionId: RESULT_TRANSITION_ID,
					providerToolCallId: 'provider-ledger-timeout',
					toolName: 'get_project_overview',
					arguments: { project_id: 'da000000-0000-4000-8000-000000000001' }
				}
			],
			{ recovery: [recoveryReceipt('retry_scheduled')] }
		);
		harness.toolExecutions.persistRead.mockRejectedValueOnce(
			new AgenticChatToolExecutionTimeoutError(10)
		);
		const processingJob = job();

		try {
			await expect(harness.executor.execute(processingJob)).resolves.toMatchObject({
				outcome: 'requeued',
				terminalStatus: null,
				queueReconciled: false
			});
			expect(
				executionBoundaryLogs(processingJob).map(({ stage, state, error_code }) => ({
					stage,
					state,
					error_code
				}))
			).toEqual([
				{ stage: 'read_op', state: 'started', error_code: undefined },
				{ stage: 'read_op', state: 'finished', error_code: undefined },
				{ stage: 'ledger_persist', state: 'started', error_code: undefined },
				{
					stage: 'ledger_persist',
					state: 'failed',
					error_code: 'tool_execution_persist_timeout'
				}
			]);
			for (const boundary of executionBoundaryLogs(processingJob)) {
				expect(boundary).not.toHaveProperty('arguments');
				expect(boundary).not.toHaveProperty('result');
			}
		} finally {
			await harness.publisher.stop();
		}
	});

	it('isolates the intentional async timing divergence from the remaining legacy differential', async () => {
		const harness = createHarness(
			[
				{
					type: 'text_delta',
					text: AGENTIC_CHAT_TEXT_ONLY_SUCCESS_FIXTURE_V1.response.assistantText
				},
				{
					type: 'finish',
					finishedReason:
						AGENTIC_CHAT_TEXT_ONLY_SUCCESS_FIXTURE_V1.response.finishedReason,
					usage: AGENTIC_CHAT_TEXT_ONLY_SUCCESS_FIXTURE_V1.response.usage
				}
			],
			{ promptSnapshot: fixturePromptSnapshot }
		);
		const fixtureExecutionInput = {
			...executionInput,
			requestPayload: {
				...executionInput.requestPayload,
				message: AGENTIC_CHAT_TEXT_ONLY_SUCCESS_FIXTURE_V1.request.message,
				context: { type: AGENTIC_CHAT_TEXT_ONLY_SUCCESS_FIXTURE_V1.request.contextType }
			}
		};
		harness.input.load.mockResolvedValueOnce(fixtureExecutionInput);

		try {
			await expect(harness.executor.execute(job())).resolves.toMatchObject({
				outcome: 'completed',
				terminalStatus: 'completed'
			});
			const terminalInput = harness.control.finalize.mock.calls[0]?.[0];
			if (!terminalInput) throw new Error('Phase 4 worker fixture did not finalize');
			const worker = normalizeAgenticChatParityRunV1({
				events: harness.broadcastMessages.map((message) => message.payload) as never,
				messages: [
					{
						role: 'user',
						content: fixtureExecutionInput.requestPayload.message
					},
					{
						role: 'assistant',
						content: terminalInput.assistantText,
						metadata: {
							completion_status: terminalInput.assistantMetadata.completion_status,
							answer_source: terminalInput.assistantMetadata.answer_source
						}
					}
				],
				toolExecutions: [],
				checkpoints: [],
				outcome: {
					status: terminalInput.status,
					finished_reason: terminalInput.finishedReason,
					assistant_message_linked: terminalInput.assistantMessageId !== null,
					total_tokens: terminalInput.totalTokens
				},
				metadata: {
					admission: {
						status: claim.status,
						context_type: fixtureExecutionInput.requestPayload.context.type,
						user_message_linked:
							claim.userMessageId === executionInput.claim.userMessageId
					},
					lifecycle_events: projectAgenticChatWorkerLifecycleObservationsV1({
						admissionObserved: true,
						publicEvents: harness.broadcastMessages.map((message) => message.payload),
						terminalStatus: terminalInput.status,
						promptSnapshotCount: harness.promptSnapshots.persist.mock.calls.length
					}),
					prompt_snapshot_count: harness.promptSnapshots.persist.mock.calls.length
				}
			});
			const differential = diffAgenticChatParityRunsV1(
				AGENTIC_CHAT_TEXT_ONLY_SUCCESS_GOLDEN_V1,
				worker
			);
			const timingDifferences = differential.differences.filter(({ path }) =>
				path.startsWith('/events/6/payload/timing/')
			);
			const nonTimingDifferences = differential.differences
				.filter(({ path }) => !path.startsWith('/events/6/payload/timing/'))
				.map(({ path, kind }) => ({ path, kind }));
			expect(differential.matches).toBe(false);
			expect(differential.truncated).toBe(false);
			expect(differential.differences).not.toContainEqual(
				expect.objectContaining({ path: '/events/6', kind: 'missing_in_actual' })
			);
			expect(timingDifferences.length).toBeGreaterThan(0);
			expect(
				(harness.broadcastMessages[6]?.payload as Record<string, unknown>).timing
			).toMatchObject({
				timing_contract_version: 'agentic_chat_async_v1',
				done_emitted_at: null
			});
			expect(nonTimingDifferences).toEqual([
				{ path: '/events/7/payload/failure_code', kind: 'unexpected_in_actual' },
				{ path: '/events/7/payload/status', kind: 'unexpected_in_actual' }
			]);
		} finally {
			await harness.publisher.stop();
		}
	});

	it('exposes the exact deterministic read-only tool parity gaps', async () => {
		const harness = createHarness(
			[
				{
					type: 'semantic',
					transitionId: 'e0000000-0000-4000-8000-00000000000e',
					phase: 'stream',
					eventType: 'agent_state',
					currentActivity: 'Planning the first step...',
					eventPayload: {
						type: 'agent_state',
						state: 'thinking',
						contextType: 'global',
						details: 'Planning the first step...',
						activity_visibility: 'activity_log'
					}
				},
				{
					type: 'read_tool',
					callTransitionId: CALL_TRANSITION_ID,
					resultTransitionId: RESULT_TRANSITION_ID,
					providerToolCallId: AGENTIC_CHAT_READ_ONLY_TOOL_FIXTURE_V1.tool.callId,
					toolName: AGENTIC_CHAT_READ_ONLY_TOOL_FIXTURE_V1.tool.name,
					arguments: AGENTIC_CHAT_READ_ONLY_TOOL_FIXTURE_V1.tool.arguments
				},
				{
					type: 'text_delta',
					text: AGENTIC_CHAT_READ_ONLY_TOOL_FIXTURE_V1.response.assistantText
				},
				{
					type: 'finish',
					finishedReason: AGENTIC_CHAT_READ_ONLY_TOOL_FIXTURE_V1.response.finishedReason,
					usage: AGENTIC_CHAT_READ_ONLY_TOOL_FIXTURE_V1.response.usage
				}
			],
			{ promptSnapshot: fixturePromptSnapshot }
		);
		harness.readTool.execute.mockResolvedValueOnce({
			result: AGENTIC_CHAT_READ_ONLY_TOOL_FIXTURE_V1.tool.result,
			executionTimeMs: AGENTIC_CHAT_READ_ONLY_TOOL_FIXTURE_V1.tool.durationMs,
			tokensConsumed: AGENTIC_CHAT_READ_ONLY_TOOL_FIXTURE_V1.tool.tokensConsumed,
			affectedEntities: [],
			toolCategory: null,
			resultCount: null,
			zeroResult: null,
			requiresUserAction: null
		});
		const fixtureExecutionInput = {
			...executionInput,
			requestPayload: {
				...executionInput.requestPayload,
				message: AGENTIC_CHAT_READ_ONLY_TOOL_FIXTURE_V1.request.message,
				context: { type: AGENTIC_CHAT_READ_ONLY_TOOL_FIXTURE_V1.request.contextType }
			}
		};
		harness.input.load.mockResolvedValueOnce(fixtureExecutionInput);

		try {
			await expect(harness.executor.execute(job())).resolves.toMatchObject({
				outcome: 'completed',
				terminalStatus: 'completed'
			});
			const terminalInput = harness.control.finalize.mock.calls[0]?.[0];
			if (!terminalInput) throw new Error('Phase 4 read-only fixture did not finalize');
			const worker = normalizeAgenticChatParityRunV1({
				events: harness.broadcastMessages.map((message) => message.payload) as never,
				messages: [
					{
						role: 'user',
						content: fixtureExecutionInput.requestPayload.message
					},
					{
						role: 'assistant',
						content: terminalInput.assistantText,
						metadata: {
							completion_status: terminalInput.assistantMetadata.completion_status,
							answer_source: terminalInput.assistantMetadata.answer_source
						}
					}
				],
				toolExecutions: harness.toolExecutions.persistRead.mock.calls.map(([input]) => ({
					tool_name: input.toolName,
					tool_category: input.execution.toolCategory,
					sequence_index: input.sequenceIndex,
					arguments: input.arguments,
					result: input.execution.result,
					execution_time_ms: input.execution.executionTimeMs,
					tokens_consumed: input.execution.tokensConsumed,
					success: true,
					affected_entities: input.execution.affectedEntities,
					message_linked: terminalInput.assistantMessageId !== null
				})),
				checkpoints: [],
				outcome: {
					status: terminalInput.status,
					finished_reason: terminalInput.finishedReason,
					assistant_message_linked: terminalInput.assistantMessageId !== null,
					tool_round_count: terminalInput.assistantMetadata.tool_round_count,
					tool_call_count: terminalInput.assistantMetadata.tool_call_count,
					total_tokens: terminalInput.totalTokens
				},
				metadata: {
					admission: {
						status: claim.status,
						context_type: fixtureExecutionInput.requestPayload.context.type,
						user_message_linked:
							claim.userMessageId === fixtureExecutionInput.claim.userMessageId
					},
					lifecycle_events: projectAgenticChatWorkerLifecycleObservationsV1({
						admissionObserved: true,
						publicEvents: harness.broadcastMessages.map((message) => message.payload),
						terminalStatus: terminalInput.status,
						promptSnapshotCount: harness.promptSnapshots.persist.mock.calls.length
					}),
					prompt_snapshot_count: harness.promptSnapshots.persist.mock.calls.length
				}
			});
			const differential = diffAgenticChatParityRunsV1(
				AGENTIC_CHAT_READ_ONLY_TOOL_GOLDEN_V1,
				worker
			);
			const timingDifferences = differential.differences.filter(({ path }) =>
				path.startsWith('/events/9/payload/timing/')
			);
			const nonTimingDifferences = differential.differences
				.filter(({ path }) => !path.startsWith('/events/9/payload/timing/'))
				.map(({ path, kind }) => ({ path, kind }));
			expect(differential.matches).toBe(false);
			expect(differential.truncated).toBe(false);
			expect(timingDifferences.length).toBeGreaterThan(0);
			expect(nonTimingDifferences).toEqual([
				{ path: '/events/10/payload/failure_code', kind: 'unexpected_in_actual' },
				{ path: '/events/10/payload/status', kind: 'unexpected_in_actual' }
			]);
		} finally {
			await harness.publisher.stop();
		}
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
		const toolResultInput = harness.semanticInputs.find(
			(input) => (input.event_payload as Record<string, unknown>)?.type === 'tool_result'
		);
		expect(toolResultInput?.event_payload).toMatchObject({
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

	it('classifies a queue timeout before provider authority as the one safe timeout retry', async () => {
		const harness = createHarness([], {
			recovery: [recoveryReceipt('retry_scheduled', { failure_code: 'timeout_pre_start' })]
		});
		const timeout = new AbortController();
		timeout.abort(new Error('Queue processing deadline exceeded'));

		await expect(harness.executor.execute(job(timeout.signal))).resolves.toMatchObject({
			outcome: 'requeued',
			terminalStatus: null,
			queueReconciled: false
		});
		expect(harness.control.recover).toHaveBeenCalledWith(
			expect.objectContaining({ failureClass: 'timeout_pre_start' })
		);
		expect(harness.input.load).not.toHaveBeenCalled();
		expect(harness.control.begin).not.toHaveBeenCalled();
		expect(harness.provider.stream).not.toHaveBeenCalled();
		expect(harness.control.finalize).not.toHaveBeenCalled();
		await harness.publisher.stop();
	});

	it('terminalizes a never-resolving provider stream inside the executor budget', async () => {
		const harness = createHarness([], {
			providerBudgetMs: 20,
			overheadTimeoutMs: 100,
			recovery: [
				recoveryReceipt('finalize_failed', { failure_code: 'timeout_post_start' }),
				recoveryReceipt('queue_reconciled', {
					status: 'failed',
					failure_code: 'provider_budget_exhausted'
				})
			]
		});
		harness.provider.stream.mockImplementation(() =>
			(async function* () {
				await new Promise<never>(() => undefined);
			})()
		);
		const startedAt = Date.now();

		await expect(harness.executor.execute(job())).resolves.toMatchObject({
			outcome: 'failed',
			terminalStatus: 'failed',
			queueReconciled: true
		});
		expect(Date.now() - startedAt).toBeLessThan(250);
		expect(harness.control.recover.mock.calls[0]?.[0]).toMatchObject({
			failureClass: 'timeout_post_start'
		});
		expect(harness.control.finalize).toHaveBeenCalledWith(
			expect.objectContaining({
				status: 'failed',
				failureCode: 'provider_budget_exhausted'
			})
		);
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
		expect(harness.log).toEqual([
			'prepare',
			'begin',
			'semantic:turn_phase:acknowledged',
			'semantic:session:',
			'semantic:context_usage:',
			'provider',
			'semantic:turn_phase:finalizing',
			'release'
		]);
		expect(prepare).toHaveBeenCalledWith({
			executionInput,
			processingToken: PROCESSING_TOKEN,
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
				failureCode: 'cancelled',
				assistantMetadata: expect.objectContaining({
					interrupted: true,
					interrupted_reason: 'user_cancelled',
					finished_reason: 'cancelled',
					partial_tokens: 2
				})
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

	it('exposes the remaining partial-cancellation differential after durable metadata parity', async () => {
		const harness = createHarness([], {
			recovery: [
				recoveryReceipt('finalize_cancelled'),
				recoveryReceipt('queue_reconciled', {
					status: 'cancelled',
					failure_code: 'cancelled'
				})
			],
			promptSnapshot: fixturePromptSnapshot
		});
		(harness.provider.prepare as ReturnType<typeof vi.fn>).mockImplementationOnce(async () => ({
			promptSnapshot: fixturePromptSnapshot,
			stream: () =>
				(async function* () {
					yield {
						type: 'text_delta',
						text: AGENTIC_CHAT_PARTIAL_CANCELLATION_FIXTURE_V1.response.assistantText
					} as const;
					harness.cancellationController.abort(
						new AgenticChatCancellationError({
							turn_run_id: TURN_RUN_ID,
							execution_generation: EXECUTION_GENERATION,
							signal_id: 'c0000000-0000-4000-8000-00000000000c',
							cancel_reason:
								AGENTIC_CHAT_PARTIAL_CANCELLATION_FIXTURE_V1.response
									.interruptedReason,
							cancel_source: 'user',
							cancel_requested_at: '2026-08-04T12:05:00.000Z',
							consumed_at: '2026-08-04T12:05:00.100Z'
						})
					);
					yield { type: 'text_delta', text: ' must-not-persist' } as const;
				})(),
			release: vi.fn()
		}));
		const fixtureExecutionInput = {
			...executionInput,
			requestPayload: {
				...executionInput.requestPayload,
				message: AGENTIC_CHAT_PARTIAL_CANCELLATION_FIXTURE_V1.request.message,
				context: { type: AGENTIC_CHAT_PARTIAL_CANCELLATION_FIXTURE_V1.request.contextType }
			}
		};
		harness.input.load.mockResolvedValueOnce(fixtureExecutionInput);

		try {
			await expect(harness.executor.execute(job())).resolves.toMatchObject({
				outcome: 'cancelled',
				terminalStatus: 'cancelled'
			});
			const terminalInput = harness.control.finalize.mock.calls[0]?.[0];
			if (!terminalInput)
				throw new Error('Partial-cancellation worker fixture did not finalize');
			const worker = normalizeAgenticChatParityRunV1({
				events: harness.broadcastMessages.map((message) => message.payload) as never,
				messages: [
					{
						role: 'user',
						content: fixtureExecutionInput.requestPayload.message
					},
					{
						role: 'assistant',
						content: terminalInput.assistantText,
						metadata: {
							finished_reason: terminalInput.assistantMetadata.finished_reason,
							interrupted: terminalInput.assistantMetadata.interrupted,
							interrupted_reason: terminalInput.assistantMetadata.interrupted_reason,
							partial_tokens: terminalInput.assistantMetadata.partial_tokens
						}
					}
				],
				toolExecutions: [],
				checkpoints: [],
				outcome: {
					status: terminalInput.status,
					finished_reason: terminalInput.finishedReason,
					assistant_message_linked: terminalInput.assistantMessageId !== null,
					total_tokens: terminalInput.totalTokens
				},
				metadata: {
					admission: {
						status: claim.status,
						context_type: fixtureExecutionInput.requestPayload.context.type,
						user_message_linked:
							claim.userMessageId === executionInput.claim.userMessageId
					},
					lifecycle_events: projectAgenticChatWorkerLifecycleObservationsV1({
						admissionObserved: true,
						publicEvents: harness.broadcastMessages.map((message) => message.payload),
						terminalStatus: terminalInput.status,
						promptSnapshotCount: harness.promptSnapshots.persist.mock.calls.length
					}),
					prompt_snapshot_count: harness.promptSnapshots.persist.mock.calls.length
				}
			});
			const differential = diffAgenticChatParityRunsV1(
				AGENTIC_CHAT_PARTIAL_CANCELLATION_GOLDEN_V1,
				worker
			);
			const timingDifferences = differential.differences.filter(({ path }) =>
				path.startsWith('/events/5/payload/timing/')
			);
			const nonTimingDifferences = differential.differences
				.filter(({ path }) => !path.startsWith('/events/5/payload/timing/'))
				.map(({ path, kind }) => ({ path, kind }));
			expect(differential.matches).toBe(false);
			expect(differential.truncated).toBe(false);
			expect(differential.differences).not.toContainEqual(
				expect.objectContaining({ path: '/events/4', kind: 'missing_in_actual' })
			);
			expect(differential.differences).not.toContainEqual(
				expect.objectContaining({ path: '/events/5', kind: 'missing_in_actual' })
			);
			expect(timingDifferences.length).toBeGreaterThan(0);
			expect(
				(harness.broadcastMessages[5]?.payload as Record<string, unknown>).timing
			).toMatchObject({
				timing_contract_version: 'agentic_chat_async_v1',
				done_emitted_at: null,
				finished_reason: 'cancelled'
			});
			expect(nonTimingDifferences).toEqual([
				{ path: '/events/6/payload/failure_code', kind: 'unexpected_in_actual' },
				{ path: '/events/6/payload/status', kind: 'unexpected_in_actual' }
			]);
		} finally {
			await harness.publisher.stop();
		}
	});

	it('matches provider-error structure while retaining only reconnect-safe failed text', async () => {
		const harness = createHarness([], {
			recovery: [
				recoveryReceipt('finalize_failed', { failure_code: 'permanent' }),
				recoveryReceipt('queue_reconciled', {
					status: 'failed',
					failure_code: 'permanent'
				})
			],
			promptSnapshot: fixturePromptSnapshot
		});
		(harness.provider.prepare as ReturnType<typeof vi.fn>).mockImplementationOnce(async () => ({
			promptSnapshot: fixturePromptSnapshot,
			stream: () =>
				(async function* () {
					yield {
						type: 'text_delta',
						text: AGENTIC_CHAT_PROVIDER_ERROR_FIXTURE_V1.response.assistantText
					} as const;
					throw new AgenticChatProviderExecutionError(
						'provider_stream_failed',
						'permanent',
						'Provider stream failed after a partial response'
					);
				})(),
			release: vi.fn()
		}));
		const fixtureExecutionInput = {
			...executionInput,
			requestPayload: {
				...executionInput.requestPayload,
				message: AGENTIC_CHAT_PROVIDER_ERROR_FIXTURE_V1.request.message,
				context: { type: AGENTIC_CHAT_PROVIDER_ERROR_FIXTURE_V1.request.contextType }
			}
		};
		harness.input.load.mockResolvedValueOnce(fixtureExecutionInput);

		try {
			await expect(harness.executor.execute(job())).resolves.toMatchObject({
				outcome: 'failed',
				terminalStatus: 'failed',
				queueReconciled: true
			});
			const terminalInput = harness.control.finalize.mock.calls[0]?.[0];
			if (!terminalInput) throw new Error('Provider-error worker fixture did not finalize');
			const worker = normalizeAgenticChatParityRunV1({
				events: harness.broadcastMessages.map((message) => message.payload) as never,
				messages: [
					{
						role: 'user',
						content: fixtureExecutionInput.requestPayload.message
					}
				],
				toolExecutions: [],
				checkpoints: [],
				outcome: {
					status: terminalInput.status,
					finished_reason: terminalInput.finishedReason,
					assistant_message_linked: terminalInput.assistantMessageId !== null,
					total_tokens: 0
				},
				metadata: {
					admission: {
						status: claim.status,
						context_type: fixtureExecutionInput.requestPayload.context.type,
						user_message_linked:
							claim.userMessageId === executionInput.claim.userMessageId
					},
					lifecycle_events: projectAgenticChatWorkerLifecycleObservationsV1({
						admissionObserved: true,
						publicEvents: harness.broadcastMessages.map((message) => message.payload),
						terminalStatus: terminalInput.status,
						promptSnapshotCount: harness.promptSnapshots.persist.mock.calls.length
					}),
					prompt_snapshot_count: harness.promptSnapshots.persist.mock.calls.length
				}
			});
			const differential = diffAgenticChatParityRunsV1(
				AGENTIC_CHAT_PROVIDER_ERROR_GOLDEN_V1,
				worker
			);
			const workerEventTypes = worker.events.map(({ type }) => type);

			expect(differential.matches).toBe(false);
			expect(differential.truncated).toBe(false);
			expect(
				differential.differences.filter(({ path }) =>
					path.startsWith('/metadata/lifecycle_events/')
				)
			).toEqual([]);
			expect(workerEventTypes).toEqual([
				'turn_phase',
				'session',
				'context_usage',
				'assistant_text',
				'error',
				'timing',
				'done'
			]);
			expect(AGENTIC_CHAT_PROVIDER_ERROR_GOLDEN_V1.events.map(({ type }) => type)).toEqual([
				'turn_phase',
				'session',
				'context_usage',
				'assistant_text',
				'error',
				'timing',
				'done'
			]);
			expect(worker.messages).toHaveLength(1);
			expect(AGENTIC_CHAT_PROVIDER_ERROR_GOLDEN_V1.messages).toHaveLength(1);
			expect(worker.outcome).toMatchObject({
				assistant_message_linked: false,
				total_tokens: 0
			});
			expect(AGENTIC_CHAT_PROVIDER_ERROR_GOLDEN_V1.outcome).toMatchObject({
				assistant_message_linked: false,
				total_tokens: 0
			});
			expect(worker.metadata.prompt_snapshot_count).toBe(1);
		} finally {
			await harness.publisher.stop();
		}
	});

	it('finalizes a post-start timeout without text as error, timing, and done', async () => {
		const harness = createHarness([], {
			recovery: [
				recoveryReceipt('finalize_failed', { failure_code: 'timeout_post_start' }),
				recoveryReceipt('queue_reconciled', {
					status: 'failed',
					failure_code: 'timeout_post_start'
				})
			]
		});
		const timeout = new AbortController();
		Object.assign(harness.provider, {
			prepare: vi.fn(async () => ({
				stream: () =>
					(async function* () {
						timeout.abort(new Error('Provider execution deadline exceeded'));
						yield { type: 'finish', finishedReason: 'stop', usage: null } as const;
					})(),
				release: vi.fn()
			}))
		});

		try {
			await expect(harness.executor.execute(job(timeout.signal))).resolves.toMatchObject({
				outcome: 'failed',
				terminalStatus: 'failed',
				queueReconciled: true
			});
			const terminalInput = harness.control.finalize.mock.calls[0]?.[0];
			expect(terminalInput).toMatchObject({
				status: 'failed',
				finishedReason: 'error',
				failureCode: 'timeout_post_start',
				assistantMessageId: null,
				assistantText: '',
				publicError: 'An error occurred while streaming.',
				timingDraft: expect.objectContaining({
					finished_reason: 'error',
					first_response_at: null
				})
			});
			expect(
				harness.broadcastMessages.map(
					(message) => (message.payload as Record<string, unknown>).type
				)
			).toEqual(['turn_phase', 'session', 'context_usage', 'error', 'timing', 'done']);
		} finally {
			await harness.publisher.stop();
		}
	});

	it('keeps a post-start timeout partial reconnectable but out of assistant history', async () => {
		const harness = createHarness([], {
			recovery: [
				recoveryReceipt('finalize_failed', { failure_code: 'timeout_post_start' }),
				recoveryReceipt('queue_reconciled', {
					status: 'failed',
					failure_code: 'timeout_post_start'
				})
			]
		});
		const timeout = new AbortController();
		Object.assign(harness.provider, {
			prepare: vi.fn(async () => ({
				stream: () =>
					(async function* () {
						yield { type: 'text_delta', text: 'Timed partial.' } as const;
						timeout.abort(new Error('Provider execution deadline exceeded'));
						yield { type: 'finish', finishedReason: 'stop', usage: null } as const;
					})(),
				release: vi.fn()
			}))
		});

		try {
			await expect(harness.executor.execute(job(timeout.signal))).resolves.toMatchObject({
				outcome: 'failed',
				terminalStatus: 'failed'
			});
			expect(harness.control.finalize.mock.calls[0]?.[0]).toMatchObject({
				status: 'failed',
				failureCode: 'timeout_post_start',
				assistantMessageId: null,
				assistantText: 'Timed partial.',
				publicError: 'An error occurred while streaming.'
			});
			expect(
				harness.broadcastMessages.map(
					(message) => (message.payload as Record<string, unknown>).type
				)
			).toEqual([
				'turn_phase',
				'session',
				'context_usage',
				'text_delta',
				'error',
				'timing',
				'done'
			]);
		} finally {
			await harness.publisher.stop();
		}
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
		const overloadText = 'x'.repeat(4_097);
		const harness = createHarness(
			[
				{ type: 'text_delta', text: overloadText },
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
					turnPendingSoftBytes: 2_048,
					turnPendingHardBytes: 4_096
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
				assistantText: overloadText,
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
