// apps/worker/tests/agenticChatTurnExecutor.test.ts
import {
	AGENTIC_CHAT_INPUT_ARTIFACT_VERSION,
	AGENTIC_CHAT_INPUT_ARTIFACT_VERSION_V2,
	createAgentStreamEventIdV1
} from '@buildos/shared-types';
import { projectAgenticChatWorkerLifecycleObservationsV1 } from '@buildos/agentic-chat-runtime';
import {
	AGENTIC_CHAT_MUTATING_TOOL_FIXTURE_V1,
	AGENTIC_CHAT_PARTIAL_CANCELLATION_FIXTURE_V1,
	AGENTIC_CHAT_PROVIDER_ERROR_FIXTURE_V1,
	AGENTIC_CHAT_READ_ONLY_TOOL_FIXTURE_V1,
	AGENTIC_CHAT_TEXT_ONLY_SUCCESS_FIXTURE_V1,
	AGENTIC_CHAT_TIMEOUT_FIXTURE_V1
} from './fixtures/agenticChatTurnFixtures';
import { provideAgenticChatLoopToolCatalog } from '@buildos/agentic-chat-runtime/loop';
import { describe, expect, it, vi } from 'vitest';
import type { ProcessingJob } from '../src/lib/supabaseQueue';
import { AgenticChatCancellationError } from '../src/workers/agentic-chat/cancellationObserver';
import type { AgenticChatTerminalFinalizeInputV1 } from '../src/workers/agentic-chat/executionControl';
import type { AgenticChatExecutionObservationInputV1 } from '../src/workers/agentic-chat/executionObservation';
import { AgenticChatExecutionInputError } from '../src/workers/agentic-chat/executionInput';
import { createStableAgenticChatEffectIdentityV1 } from '../src/workers/agentic-chat/effectIdentity';
import {
	AgenticChatEffectExecutionError,
	AgenticChatMutationExecutor
} from '../src/workers/agentic-chat/mutation-executor';
import { createStableAgenticChatLifecycleTransitionIdV1 } from '../src/workers/agentic-chat/lifecycleIdentity';
import {
	AgenticChatTurnExecutor,
	type AgenticChatTurnProviderStepV1
} from '../src/workers/agentic-chat/turn-executor';
import {
	AgenticChatProviderExecutionError,
	type AgenticChatPreparedPromptSnapshotV1,
	type AgenticChatProviderToolRoundInputV1
} from '../src/workers/agentic-chat/provider/contracts';
import { AgenticChatToolExecutionAdapter } from '../src/workers/agentic-chat/tools/execution-adapter';
import { createStableAgenticChatPromptSnapshotIdV1 } from '../src/workers/agentic-chat/promptSnapshot';
import type { AgenticChatRuntimeTimingSnapshotV1 } from '../src/workers/agentic-chat/runtimeTiming';
import { AgenticChatStreamPublisher } from '../src/workers/agentic-chat/streamPublisher';
import {
	AgenticChatToolExecutionTimeoutError,
	SupabaseAgenticChatToolExecutionAdapter
} from '../src/workers/agentic-chat/toolExecution';
import { AgenticChatTableMutationAdapter } from '../src/workers/agentic-chat/tableMutationAdapter';

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
const VALIDATION_CALL_TRANSITION_ID = 'a0500000-0000-4000-8000-00000000005a';
const VALIDATION_RESULT_TRANSITION_ID = 'b0500000-0000-4000-8000-00000000005b';
const SECOND_CALL_TRANSITION_ID = 'a1000000-0000-4000-8000-00000000001a';
const SECOND_RESULT_TRANSITION_ID = 'b1000000-0000-4000-8000-00000000001b';
const THIRD_CALL_TRANSITION_ID = 'a2000000-0000-4000-8000-00000000002a';
const THIRD_RESULT_TRANSITION_ID = 'b2000000-0000-4000-8000-00000000002b';
const LOGICAL_OPERATION_ID = 'c0000000-0000-4000-8000-00000000000c';
const EFFECT_ID = 'd0000000-0000-5000-8000-00000000000d';
const SHIFT_PROJECT_ID = 'e0000000-0000-4000-8000-00000000000e';
const EXECUTION_GENERATION = 1;

provideAgenticChatLoopToolCatalog(() => ({ ops: {}, byToolName: {} }));

const fixturePromptSnapshot = {
	snapshotVersion: 'agentic_chat_worker_prompt_v1',
	modelMessages: [
		{ role: 'system', content: 'Fixture only' },
		{ role: 'user', content: 'Use the fixture' }
	],
	toolDefinitions: [],
	systemPromptSha256: 'a'.repeat(64),
	messagesSha256: 'b'.repeat(64),
	toolsSha256: 'c'.repeat(64),
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
	return processingJob.log.mock.calls
		.map(([message]) => JSON.parse(message) as Record<string, unknown>)
		.filter((record) => record.event === 'agentic_chat_execution_boundary');
}

function toolExecutionGraphLogs(processingJob: ReturnType<typeof job>) {
	return processingJob.log.mock.calls
		.map(([message]) => JSON.parse(message) as Record<string, unknown>)
		.filter((record) => record.event === 'agentic_chat_tool_execution_graph');
}

function typedExecutionFailureLog(processingJob: ReturnType<typeof job>) {
	return processingJob.log.mock.calls
		.map(([message]) => JSON.parse(message) as Record<string, unknown>)
		.find((record) => record.event === 'agentic_chat_typed_execution_failure');
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
	steps: AgenticChatTurnProviderStepV1[],
	options: {
		recovery?: unknown[];
		publisherConfig?: ConstructorParameters<typeof AgenticChatStreamPublisher>[1];
		timingClockValues?: number[];
		failBroadcastType?: string;
		promptSnapshot?: AgenticChatPreparedPromptSnapshotV1;
		promptSnapshotError?: Error;
		providerBudgetMs?: number;
		overheadTimeoutMs?: number;
		maxProviderRounds?: number;
		maxToolCalls?: number;
		maxToolConcurrency?: number;
		concurrentReadsEnabled?: boolean;
		concurrentMutationsEnabled?: boolean;
		failSemanticType?: string;
		researchCaptureError?: Error;
		statedFutureCaptureError?: Error;
		consumptionBillingError?: Error;
		beforeFlushTextBatches?: (inputs: Array<Record<string, unknown>>) => Promise<void>;
		beforePersistSemantic?: (input: Record<string, unknown>) => Promise<void>;
	} = {}
) {
	let sequence = 0;
	const semanticInputs: Array<Record<string, unknown>> = [];
	const broadcastMessages: Array<Record<string, unknown>> = [];
	const textFlushBatches: Array<Array<Record<string, unknown>>> = [];
	const timingSnapshots: AgenticChatRuntimeTimingSnapshotV1[] = [];
	const log: string[] = [];
	const timingClockValues = options.timingClockValues ? [...options.timingClockValues] : null;
	const persistence = {
		async flushTextBatches(inputs: Array<Record<string, unknown>>) {
			textFlushBatches.push(inputs);
			await options.beforeFlushTextBatches?.(inputs);
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
			await options.beforePersistSemantic?.(input);
			semanticInputs.push(input);
			const payload = input.event_payload as Record<string, unknown>;
			log.push(`semantic:${String(payload.type)}:${String(payload.turn_phase ?? '')}`);
			if (payload.type === options.failSemanticType) {
				throw new Error(`fixture semantic persistence failed: ${String(payload.type)}`);
			}
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
	const researchCaptureErrors: unknown[] = [];
	const statedFutureCaptureErrors: unknown[] = [];
	const consumptionBillingErrors: unknown[] = [];
	const terminalControlErrors: Array<{
		stage: 'finalize' | 'finalize_retry' | 'recover';
		turnRunId: string;
		executionGeneration: number;
		error: unknown;
	}> = [];
	const input = { load: vi.fn(async () => executionInput) };
	const readTool = {
		prepareTurnToolBatchSecurity: vi.fn(),
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
	const toolExecutions = {
		persistRead: vi.fn(async () => undefined),
		persistFailure: vi.fn(async () => undefined),
		persistMutation: vi.fn(async () => {
			log.push('mutation_ledger');
		})
	};
	const executionObservationInputs: AgenticChatExecutionObservationInputV1[] = [];
	const executionObservations = {
		observe: vi.fn(async (observation: AgenticChatExecutionObservationInputV1) => {
			executionObservationInputs.push(observation);
		})
	};
	const sessionHandoff = {
		persist: vi.fn(async () => {
			log.push('session_handoff');
		})
	};
	const mutation = {
		execute: vi.fn(async () => ({
			effectId: EFFECT_ID,
			canonicalArgumentHash: 'a'.repeat(64),
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
	const researchCapture = options.researchCaptureError
		? {
				capture: vi.fn(async () => {
					throw options.researchCaptureError;
				})
			}
		: undefined;
	const statedFutureCapture = options.statedFutureCaptureError
		? {
				capture: vi.fn(async () => {
					throw options.statedFutureCaptureError;
				})
			}
		: undefined;
	const consumptionBilling = {
		evaluate: vi.fn(async () => {
			if (options.consumptionBillingError) throw options.consumptionBillingError;
			return {
				userId: USER_ID,
				billingState: 'explorer_active',
				billingTier: 'explorer',
				isFrozen: false,
				projectCount: 1,
				lifetimeCreditsUsed: 10,
				triggerReason: null
			};
		})
	};
	const executor = new AgenticChatTurnExecutor(
		{
			control: control as never,
			input: input as never,
			publisher,
			cancellation: cancellation as never,
			provider,
			promptSnapshots,
			executionObservations,
			onPromptSnapshotError: (error) => promptSnapshotErrors.push(error),
			onResearchCaptureError: (error) => researchCaptureErrors.push(error),
			onStatedFutureCaptureError: (error) => statedFutureCaptureErrors.push(error),
			onConsumptionBillingError: (error) => consumptionBillingErrors.push(error),
			onTerminalControlError: (report) => terminalControlErrors.push(report),
			readTool,
			toolExecutions,
			sessionHandoff,
			researchCapture,
			statedFutureCapture,
			consumptionBilling,
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
			overheadTimeoutMs: options.overheadTimeoutMs,
			maxProviderRounds: options.maxProviderRounds,
			maxToolCalls: options.maxToolCalls,
			maxToolConcurrency: options.maxToolConcurrency,
			concurrentReadsEnabled: options.concurrentReadsEnabled,
			concurrentMutationsEnabled: options.concurrentMutationsEnabled
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
		researchCaptureErrors,
		statedFutureCaptureErrors,
		consumptionBillingErrors,
		terminalControlErrors,
		readTool,
		toolExecutions,
		executionObservations,
		executionObservationInputs,
		sessionHandoff,
		researchCapture,
		statedFutureCapture,
		consumptionBilling,
		mutation,
		cancellation,
		cancellationController,
		semanticInputs,
		broadcastMessages,
		textFlushBatches,
		timingSnapshots,
		log,
		getSequence: () => sequence
	};
}

function streamBroadcastMessages(messages: Array<Record<string, unknown>>) {
	return messages.filter((message) => message.kind === 'event');
}

/**
 * Public event types with consecutive assistant text collapsed into one
 * `assistant_text` entry, so a delta-count change does not churn the assertion.
 */
function normalizedBroadcastEventTypes(messages: Array<Record<string, unknown>>): string[] {
	const types: string[] = [];
	for (const message of streamBroadcastMessages(messages)) {
		const rawType = (message.payload as Record<string, unknown>).type;
		const type =
			rawType === 'text' || rawType === 'text_delta' ? 'assistant_text' : String(rawType);
		if (type === 'assistant_text' && types.at(-1) === 'assistant_text') continue;
		types.push(type);
	}
	return types;
}

describe('AgenticChatTurnExecutor', () => {
	it('consumes provider text without waiting for each durable delivery', async () => {
		let releasePersistence!: () => void;
		const persistenceGate = new Promise<void>((resolve) => {
			releasePersistence = resolve;
		});
		let providerFinished = false;
		const harness = createHarness([], {
			beforeFlushTextBatches: () => persistenceGate
		});
		const deltas = Array.from({ length: 40 }, () => 'x');
		Object.assign(harness.provider, {
			stream: vi.fn(() =>
				(async function* () {
					for (const text of deltas) yield { type: 'text_delta', text } as const;
					providerFinished = true;
					yield { type: 'finish', finishedReason: 'stop', usage: null } as const;
				})()
			)
		});

		const execution = harness.executor.execute(job());
		await vi.waitFor(() => expect(providerFinished).toBe(true));
		expect(harness.control.finalize).not.toHaveBeenCalled();

		releasePersistence();
		await expect(execution).resolves.toMatchObject({
			outcome: 'completed',
			terminalStatus: 'completed'
		});
		expect(harness.control.finalize).toHaveBeenCalledWith(
			expect.objectContaining({ assistantText: 'x'.repeat(deltas.length) })
		);
		expect(harness.textFlushBatches.flat()).toHaveLength(2);
		await harness.publisher.stop();
	});

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

	it('finalizes an appended terminal correction with the immutable streamed prefix', async () => {
		const emittedText = 'Done — I marked the task complete.';
		const contractArguments = {
			outcomes: [
				{
					action: 'complete',
					entity_kind: 'task',
					target_ids: ['task-1'],
					required_fields: ['state_key'],
					minimum_successful_effects: 1
				}
			]
		};
		const harness = createHarness([
			{
				type: 'read_tool',
				logicalProviderRound: 1,
				callTransitionId: CALL_TRANSITION_ID,
				resultTransitionId: RESULT_TRANSITION_ID,
				providerToolCallId: 'provider-declare-contract',
				toolName: 'declare_turn_contract',
				arguments: contractArguments
			},
			{ type: 'text_delta', text: emittedText },
			{ type: 'finish', finishedReason: 'stop', usage: null }
		]);
		harness.readTool.execute.mockResolvedValueOnce({
			result: {
				status: 'declared',
				contract: {
					version: 1,
					source: 'declared',
					outcomes: [
						{
							id: 'declared-1',
							action: 'complete',
							entityKind: 'task',
							targetIds: ['task-1'],
							requiredFields: ['state_key'],
							minimumSuccessfulEffects: 1
						}
					]
				}
			},
			executionTimeMs: 0,
			tokensConsumed: null,
			affectedEntities: [],
			toolCategory: 'control',
			resultCount: null,
			zeroResult: null,
			requiresUserAction: false
		});

		await expect(harness.executor.execute(job())).resolves.toMatchObject({
			outcome: 'completed',
			terminalStatus: 'completed'
		});
		const terminalInput = harness.control.finalize.mock.calls[0]?.[0];
		if (!terminalInput) throw new Error('Terminal correction fixture did not finalize');
		expect(terminalInput.assistantText.startsWith(`${emittedText}\n\n`)).toBe(true);
		expect(terminalInput.assistantText).toContain('Nothing changed');
		await harness.publisher.stop();
	});

	it('reports deterministic research-capture failure without overturning the completed answer', async () => {
		const error = new Error('research log unavailable');
		const harness = createHarness(
			[
				{ type: 'text_delta', text: 'completed research answer' },
				{ type: 'finish', finishedReason: 'stop', usage: null }
			],
			{ researchCaptureError: error }
		);

		await expect(harness.executor.execute(job())).resolves.toMatchObject({
			outcome: 'completed',
			terminalStatus: 'completed'
		});
		expect(harness.researchCapture?.capture).toHaveBeenCalledOnce();
		expect(harness.researchCaptureErrors).toEqual([error]);
		expect(harness.control.finalize).toHaveBeenCalledWith(
			expect.objectContaining({
				assistantText: 'completed research answer',
				status: 'completed'
			})
		);
		expect(harness.researchCapture!.capture.mock.invocationCallOrder[0]).toBeLessThan(
			harness.control.finalize.mock.invocationCallOrder[0]!
		);
		await harness.publisher.stop();
	});

	it('reports deterministic stated-future failure without overturning the completed answer', async () => {
		const error = new Error('stated-future task unavailable');
		const harness = createHarness(
			[
				{ type: 'text_delta', text: 'completed answer' },
				{ type: 'finish', finishedReason: 'stop', usage: null }
			],
			{ statedFutureCaptureError: error }
		);

		await expect(harness.executor.execute(job())).resolves.toMatchObject({
			outcome: 'completed',
			terminalStatus: 'completed'
		});
		expect(harness.statedFutureCapture?.capture).toHaveBeenCalledOnce();
		expect(harness.statedFutureCaptureErrors).toEqual([error]);
		expect(harness.control.finalize).toHaveBeenCalledWith(
			expect.objectContaining({ assistantText: 'completed answer', status: 'completed' })
		);
		expect(harness.statedFutureCapture!.capture.mock.invocationCallOrder[0]).toBeLessThan(
			harness.control.finalize.mock.invocationCallOrder[0]!
		);
		await harness.publisher.stop();
	});

	it('re-evaluates consumption billing after execution and before terminal finalization', async () => {
		const harness = createHarness([
			{ type: 'text_delta', text: 'accounted answer' },
			{ type: 'finish', finishedReason: 'stop', usage: null }
		]);

		await expect(harness.executor.execute(job())).resolves.toMatchObject({
			outcome: 'completed',
			terminalStatus: 'completed'
		});
		expect(harness.consumptionBilling.evaluate).toHaveBeenCalledOnce();
		expect(harness.consumptionBilling.evaluate).toHaveBeenCalledWith(USER_ID);
		expect(harness.consumptionBilling.evaluate.mock.invocationCallOrder[0]).toBeLessThan(
			harness.control.finalize.mock.invocationCallOrder[0]!
		);
		await harness.publisher.stop();
	});

	it('reports consumption-billing failure without overturning terminal truth', async () => {
		const error = new Error('billing gate unavailable');
		const harness = createHarness(
			[
				{ type: 'text_delta', text: 'answer survives billing telemetry failure' },
				{ type: 'finish', finishedReason: 'stop', usage: null }
			],
			{ consumptionBillingError: error }
		);

		await expect(harness.executor.execute(job())).resolves.toMatchObject({
			outcome: 'completed',
			terminalStatus: 'completed'
		});
		expect(harness.consumptionBillingErrors).toEqual([error]);
		expect(harness.control.finalize).toHaveBeenCalledOnce();
		await harness.publisher.stop();
	});

	it('does not turn immutable lexical intent into terminal mutation authority', async () => {
		const harness = createHarness([
			{ type: 'text_delta', text: 'I could not complete the write.' },
			{ type: 'finish', finishedReason: 'stop', usage: null }
		]);
		harness.input.load.mockResolvedValueOnce({
			...executionInput,
			requestPayload: {
				...executionInput.requestPayload,
				context: { type: 'project', projectId: '22000000-0000-4000-8000-000000000022' }
			},
			artifact: {
				...executionInput.artifact,
				prepared: {
					...executionInput.artifact.prepared,
					turnIntent: {
						version: 1,
						requiresWrite: true,
						action: 'create',
						entityKind: 'document',
						operations: [{ action: 'create', entityKind: 'document' }],
						source: 'current_message',
						originalRequestText: 'Create a handoff document.',
						originatingTurnRunId: null,
						clearPending: false,
						expectedWriteToolNames: ['create_onto_document']
					}
				}
			}
		} as never);

		await expect(harness.executor.execute(job())).resolves.toMatchObject({
			outcome: 'completed',
			terminalStatus: 'completed'
		});
		expect(harness.control.finalize).toHaveBeenCalledWith(
			expect.objectContaining({
				assistantMetadata: expect.objectContaining({
					outcome_status: 'fulfilled'
				})
			})
		);
		const metadata = harness.control.finalize.mock.calls[0]?.[0].assistantMetadata;
		expect(metadata).not.toHaveProperty('turn_intent');
		expect(metadata).not.toHaveProperty('turn_contract');
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
			{ timingClockValues: [100, 110, 120, 150, 150, 150, 160, 190] }
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
				preterminal: expect.objectContaining({
					providerAuthorityObservedAtMs: 100,
					firstEventPersistedAt: '2026-08-03T12:00:00.000Z',
					firstEventPersistenceObservedAtMs: 110,
					firstResponsePersistedAt: '2026-08-03T12:00:00.000Z',
					firstResponsePersistenceObservedAtMs: 120,
					providerFinishedAtMs: 150,
					publisherDrainStartedAtMs: 150,
					publisherDrainCompletedAtMs: 150,
					terminalCallStartedAtMs: 160,
					durationsMs: {
						authorityToFirstEventPersistence: 10,
						authorityToFirstResponsePersistence: 20,
						firstResponsePersistenceToProviderFinish: 30,
						authorityToProviderFinish: 50,
						providerFinishToTerminalCall: 10
					}
				}),
				postcallTelemetry: {
					terminalCallCompletedAtMs: 190,
					terminalCall: 30
				}
			})
		]);
		const terminalTypes = streamBroadcastMessages(harness.broadcastMessages)
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

	it('retries a rejected timing finalize once without the draft instead of abandoning the turn', async () => {
		const harness = createHarness(
			[
				{ type: 'text_delta', text: 'timed response' },
				{ type: 'finish', finishedReason: 'stop', usage: null }
			],
			{ timingClockValues: [100, 110, 120, 150, 150, 150, 160, 190] }
		);
		harness.control.finalize.mockImplementationOnce(async () => {
			throw new Error('agentic_chat_terminal_events_finalize_timing_evidence_mismatch');
		});

		await expect(harness.executor.execute(job())).resolves.toMatchObject({
			outcome: 'completed',
			terminalStatus: 'completed'
		});
		expect(harness.control.finalize).toHaveBeenCalledTimes(2);
		const firstInput = harness.control.finalize.mock.calls[0][0];
		const retryInput = harness.control.finalize.mock.calls[1][0];
		expect(firstInput.timingDraft).not.toBeNull();
		expect(retryInput.timingDraft).toBeNull();
		expect(retryInput.timingTransitionId).toBeNull();
		expect(retryInput.lastTurnContext).not.toBeNull();
		expect(retryInput.assistantText).toBe(firstInput.assistantText);
		expect(harness.terminalControlErrors).toEqual([
			expect.objectContaining({
				stage: 'finalize',
				turnRunId: TURN_RUN_ID,
				executionGeneration: EXECUTION_GENERATION
			})
		]);
		await harness.publisher.stop();
	});

	it('reports both terminal-control failures when the timing-stripped retry also fails', async () => {
		const harness = createHarness(
			[
				{ type: 'text_delta', text: 'timed response' },
				{ type: 'finish', finishedReason: 'stop', usage: null }
			],
			{
				timingClockValues: [100, 110, 120, 150, 150, 150, 160, 190],
				recovery: [
					{
						outcome: 'queue_reconciled',
						turn_run_id: TURN_RUN_ID,
						queue_job_id: QUEUE_JOB_ID,
						session_id: SESSION_ID,
						user_id: USER_ID,
						execution_generation: EXECUTION_GENERATION,
						status: 'failed'
					}
				]
			}
		);
		harness.control.finalize
			.mockImplementationOnce(async () => {
				throw new Error('agentic_chat_terminal_events_finalize_timing_evidence_mismatch');
			})
			.mockImplementationOnce(async () => {
				throw new Error('terminal finalization retry unavailable');
			});

		const outcome = await harness.executor.execute(job());
		expect(harness.control.finalize).toHaveBeenCalledTimes(2);
		expect(harness.terminalControlErrors.map((report) => report.stage)).toEqual([
			'finalize',
			'finalize_retry'
		]);
		expect(outcome.outcome).not.toBe('completed');
		await harness.publisher.stop();
	});

	it('does not publish done when the committed timing prefix degrades to reconciliation', async () => {
		const harness = createHarness(
			[
				{ type: 'text_delta', text: 'timed response' },
				{ type: 'finish', finishedReason: 'stop', usage: null }
			],
			{
				timingClockValues: [100, 110, 120, 150, 150, 150, 160, 190],
				failBroadcastType: 'timing'
			}
		);

		await expect(harness.executor.execute(job())).resolves.toMatchObject({
			outcome: 'completed',
			terminalStatus: 'completed',
			queueReconciled: true
		});
		const terminalTypes = streamBroadcastMessages(harness.broadcastMessages)
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
			{ timingClockValues: [200, 210, 220, 250, 250, 250, 260, 290] }
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
			streamBroadcastMessages(harness.broadcastMessages).some(
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

	it('streams text, executes a read-only tool, persists reconnect-safe projection, and finalizes', async () => {
		const harness = createHarness([
			{ type: 'text_delta', text: 'Hello ' },
			{
				type: 'read_tool',
				logicalProviderRound: 1,
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
			streamBroadcastMessages(harness.broadcastMessages).map(
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
			streamBroadcastMessages(harness.broadcastMessages).map(
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

	it('carries an acknowledged tool row into recovery when public result persistence fails', async () => {
		const harness = createHarness(
			[
				{
					type: 'read_tool',
					logicalProviderRound: 1,
					callTransitionId: CALL_TRANSITION_ID,
					resultTransitionId: RESULT_TRANSITION_ID,
					providerToolCallId: 'provider-read-public-failure',
					toolName: 'get_workspace_overview',
					arguments: {}
				}
			],
			{
				failSemanticType: 'tool_result',
				providerBudgetMs: 50,
				publisherConfig: { retryDelayMs: 1 },
				recovery: [
					recoveryReceipt('finalize_failed', { failure_code: 'timeout_post_start' })
				]
			}
		);

		await expect(harness.executor.execute(job())).resolves.toMatchObject({
			outcome: 'failed',
			terminalStatus: 'failed'
		});
		expect(harness.toolExecutions.persistRead).toHaveBeenCalledOnce();
		expect(harness.control.finalize).toHaveBeenCalledWith(
			expect.objectContaining({
				status: 'failed',
				assistantMetadata: expect.objectContaining({
					tool_round_count: 1,
					tool_call_count: 1
				})
			})
		);
		await harness.publisher.stop();
	});

	it('does not advance the provider when memo-result publication fails after ledger acknowledgement', async () => {
		const harness = createHarness([], {
			failSemanticType: 'tool_result',
			providerBudgetMs: 50,
			publisherConfig: { retryDelayMs: 1 },
			recovery: [recoveryReceipt('finalize_failed', { failure_code: 'timeout_post_start' })]
		});
		const continueWithToolResults = vi.fn();
		Object.assign(harness.provider, {
			prepare: vi.fn(async () => ({
				stream: () =>
					(async function* () {
						yield {
							type: 'read_tool',
							callTransitionId: CALL_TRANSITION_ID,
							resultTransitionId: RESULT_TRANSITION_ID,
							providerToolCallId: 'provider-memo-public-failure',
							toolName: 'fixture_project_read',
							arguments: {},
							memoServed: {
								result: {
									served_from_turn_memo: true,
									repeat_read_notice: 'Repeat read: use the earlier result.'
								},
								executionTimeMs: 0,
								tokensConsumed: null,
								affectedEntities: [],
								toolCategory: 'read',
								resultCount: null,
								zeroResult: null,
								requiresUserAction: false
							}
						} as const;
					})(),
				continueWithToolResults,
				release: vi.fn()
			}))
		});

		try {
			await expect(harness.executor.execute(job())).resolves.toMatchObject({
				outcome: 'failed',
				terminalStatus: 'failed'
			});
			expect(harness.readTool.execute).not.toHaveBeenCalled();
			expect(harness.toolExecutions.persistRead).toHaveBeenCalledOnce();
			expect(continueWithToolResults).not.toHaveBeenCalled();
			expect(harness.control.finalize).toHaveBeenCalledWith(
				expect.objectContaining({
					assistantMetadata: expect.objectContaining({
						tool_round_count: 1,
						tool_call_count: 1
					})
				})
			);
		} finally {
			await harness.publisher.stop();
		}
	});

	it('writes a terminal outcome when a read-tool network call exceeds its local deadline', async () => {
		const harness = createHarness(
			[
				{
					type: 'read_tool',
					logicalProviderRound: 1,
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
		// S3 swap: the adapter no longer takes a gateway runOp; hang the shared
		// read's first network hop (project summaries) behind the access port.
		let readHangStarted = false;
		const readAdapter = new AgenticChatToolExecutionAdapter({} as never, {
			timeoutMs: 10,
			createAccessAdapter: () => ({
				getActorId: async () => 'a0000000-0000-4000-8000-00000000000a',
				resolveProjectSummaries: () =>
					new Promise<never>(() => {
						readHangStarted = true;
					}),
				assertProjectAccess: async () => {},
				assertEntityAccess: async () => {}
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
			expect(readHangStarted).toBe(true);
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
					logicalProviderRound: 1,
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

	it('does not advance the provider when a memo-served execution is not durable', async () => {
		const harness = createHarness([], {
			recovery: [recoveryReceipt('retry_scheduled')]
		});
		const continueWithToolResults = vi.fn();
		Object.assign(harness.provider, {
			prepare: vi.fn(async () => ({
				stream: () =>
					(async function* () {
						yield {
							type: 'read_tool',
							callTransitionId: CALL_TRANSITION_ID,
							resultTransitionId: RESULT_TRANSITION_ID,
							providerToolCallId: 'provider-memo-ledger-failure',
							toolName: 'fixture_project_read',
							arguments: {},
							memoServed: {
								result: {
									served_from_turn_memo: true,
									repeat_read_notice: 'Repeat read: use the earlier result.'
								},
								executionTimeMs: 0,
								tokensConsumed: null,
								affectedEntities: [],
								toolCategory: 'read',
								resultCount: null,
								zeroResult: null,
								requiresUserAction: false
							}
						} as const;
					})(),
				continueWithToolResults,
				release: vi.fn()
			}))
		});
		harness.toolExecutions.persistRead.mockRejectedValueOnce(
			new AgenticChatToolExecutionTimeoutError(10)
		);

		try {
			await expect(harness.executor.execute(job())).resolves.toMatchObject({
				outcome: 'requeued',
				terminalStatus: null
			});
			expect(harness.readTool.execute).not.toHaveBeenCalled();
			expect(harness.toolExecutions.persistRead).toHaveBeenCalledOnce();
			expect(continueWithToolResults).not.toHaveBeenCalled();
			expect(harness.semanticInputs).not.toEqual(
				expect.arrayContaining([expect.objectContaining({ event_type: 'tool_result' })])
			);
		} finally {
			await harness.publisher.stop();
		}
	});

	it('commits async timing without a done timestamp on a deterministic text-only turn', async () => {
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
			expect(
				(
					streamBroadcastMessages(harness.broadcastMessages)[6]?.payload as Record<
						string,
						unknown
					>
				).timing
			).toMatchObject({
				timing_contract_version: 'agentic_chat_async_v1',
				done_emitted_at: null
			});
		} finally {
			await harness.publisher.stop();
		}
	});

	it('orders durable and public receipts across a deterministic validation repair', async () => {
		const harness = createHarness([]);
		const firstReadExecution = {
			result: AGENTIC_CHAT_READ_ONLY_TOOL_FIXTURE_V1.tool.result,
			executionTimeMs: AGENTIC_CHAT_READ_ONLY_TOOL_FIXTURE_V1.tool.durationMs,
			tokensConsumed: AGENTIC_CHAT_READ_ONLY_TOOL_FIXTURE_V1.tool.tokensConsumed,
			affectedEntities: [],
			toolCategory: AGENTIC_CHAT_READ_ONLY_TOOL_FIXTURE_V1.tool.toolCategory,
			resultCount: null,
			zeroResult: null,
			requiresUserAction: null
		};
		const secondReadExecution = {
			result: AGENTIC_CHAT_READ_ONLY_TOOL_FIXTURE_V1.secondTool.result,
			executionTimeMs: AGENTIC_CHAT_READ_ONLY_TOOL_FIXTURE_V1.secondTool.durationMs,
			tokensConsumed: AGENTIC_CHAT_READ_ONLY_TOOL_FIXTURE_V1.secondTool.tokensConsumed,
			affectedEntities: [],
			toolCategory: AGENTIC_CHAT_READ_ONLY_TOOL_FIXTURE_V1.secondTool.toolCategory,
			resultCount: null,
			zeroResult: null,
			requiresUserAction: null
		};
		const thirdReadExecution = {
			result: AGENTIC_CHAT_READ_ONLY_TOOL_FIXTURE_V1.thirdTool.result,
			executionTimeMs: AGENTIC_CHAT_READ_ONLY_TOOL_FIXTURE_V1.thirdTool.durationMs,
			tokensConsumed: AGENTIC_CHAT_READ_ONLY_TOOL_FIXTURE_V1.thirdTool.tokensConsumed,
			affectedEntities: [],
			toolCategory: AGENTIC_CHAT_READ_ONLY_TOOL_FIXTURE_V1.thirdTool.toolCategory,
			resultCount: null,
			zeroResult: null,
			requiresUserAction: null
		};
		harness.readTool.execute
			.mockResolvedValueOnce(firstReadExecution)
			.mockResolvedValueOnce(secondReadExecution)
			.mockResolvedValueOnce(thirdReadExecution);
		harness.toolExecutions.persistFailure.mockImplementationOnce(async () => {
			harness.log.push('validation_ledger');
		});
		const continueWithToolResults = vi.fn(
			({
				round,
				results
			}: {
				round: number;
				results: ReadonlyArray<{ providerToolCallId: string }>;
			}) => {
				if (round === 2) {
					expect(results.map((result) => result.providerToolCallId)).toEqual([
						AGENTIC_CHAT_READ_ONLY_TOOL_FIXTURE_V1.tool.callId
					]);
					return (async function* () {
						yield {
							type: 'read_tool',
							callTransitionId: VALIDATION_CALL_TRANSITION_ID,
							resultTransitionId: VALIDATION_RESULT_TRANSITION_ID,
							providerToolCallId:
								AGENTIC_CHAT_READ_ONLY_TOOL_FIXTURE_V1.validationFailure.callId,
							toolName: AGENTIC_CHAT_READ_ONLY_TOOL_FIXTURE_V1.validationFailure.name,
							arguments:
								AGENTIC_CHAT_READ_ONLY_TOOL_FIXTURE_V1.validationFailure.arguments,
							validationFailure: {
								error: AGENTIC_CHAT_READ_ONLY_TOOL_FIXTURE_V1.validationFailure
									.error,
								toolCategory:
									AGENTIC_CHAT_READ_ONLY_TOOL_FIXTURE_V1.validationFailure
										.toolCategory
							}
						} as const;
						harness.log.push('repair_provider');
						yield {
							type: 'read_tool',
							callTransitionId: SECOND_CALL_TRANSITION_ID,
							resultTransitionId: SECOND_RESULT_TRANSITION_ID,
							providerToolCallId:
								AGENTIC_CHAT_READ_ONLY_TOOL_FIXTURE_V1.secondTool.callId,
							toolName: AGENTIC_CHAT_READ_ONLY_TOOL_FIXTURE_V1.secondTool.name,
							arguments: AGENTIC_CHAT_READ_ONLY_TOOL_FIXTURE_V1.secondTool.arguments
						} as const;
					})();
				}
				if (round === 3) {
					expect(results.map((result) => result.providerToolCallId)).toEqual([
						AGENTIC_CHAT_READ_ONLY_TOOL_FIXTURE_V1.secondTool.callId
					]);
					return (async function* () {
						yield {
							type: 'read_tool',
							callTransitionId: THIRD_CALL_TRANSITION_ID,
							resultTransitionId: THIRD_RESULT_TRANSITION_ID,
							providerToolCallId:
								AGENTIC_CHAT_READ_ONLY_TOOL_FIXTURE_V1.thirdTool.callId,
							toolName: AGENTIC_CHAT_READ_ONLY_TOOL_FIXTURE_V1.thirdTool.name,
							arguments: AGENTIC_CHAT_READ_ONLY_TOOL_FIXTURE_V1.thirdTool.arguments
						} as const;
					})();
				}
				expect(round).toBe(4);
				expect(results.map((result) => result.providerToolCallId)).toEqual([
					AGENTIC_CHAT_READ_ONLY_TOOL_FIXTURE_V1.thirdTool.callId
				]);
				return (async function* () {
					yield {
						type: 'text_delta',
						text: AGENTIC_CHAT_READ_ONLY_TOOL_FIXTURE_V1.response.assistantText
					} as const;
					yield {
						type: 'finish',
						finishedReason:
							AGENTIC_CHAT_READ_ONLY_TOOL_FIXTURE_V1.response.finishedReason,
						usage: AGENTIC_CHAT_READ_ONLY_TOOL_FIXTURE_V1.response.usage
					} as const;
				})();
			}
		);
		Object.assign(harness.provider, {
			prepare: vi.fn(async () => ({
				promptSnapshot: fixturePromptSnapshot,
				stream: () =>
					(async function* () {
						yield {
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
						} as const;
						yield {
							type: 'read_tool',
							callTransitionId: CALL_TRANSITION_ID,
							resultTransitionId: RESULT_TRANSITION_ID,
							providerToolCallId: AGENTIC_CHAT_READ_ONLY_TOOL_FIXTURE_V1.tool.callId,
							toolName: AGENTIC_CHAT_READ_ONLY_TOOL_FIXTURE_V1.tool.name,
							arguments: AGENTIC_CHAT_READ_ONLY_TOOL_FIXTURE_V1.tool.arguments
						} as const;
					})(),
				continueWithToolResults,
				release: vi.fn()
			}))
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
			expect(continueWithToolResults).toHaveBeenCalledTimes(3);
			expect(harness.readTool.execute).toHaveBeenCalledTimes(3);
			expect(
				harness.toolExecutions.persistRead.mock.calls.map(([input]) => [
					input.sequenceIndex,
					input.toolName
				])
			).toEqual([
				[1, AGENTIC_CHAT_READ_ONLY_TOOL_FIXTURE_V1.tool.name],
				[3, AGENTIC_CHAT_READ_ONLY_TOOL_FIXTURE_V1.secondTool.name],
				[4, AGENTIC_CHAT_READ_ONLY_TOOL_FIXTURE_V1.thirdTool.name]
			]);
			expect(
				harness.toolExecutions.persistFailure.mock.calls.map(([input]) => [
					input.sequenceIndex,
					input.toolName
				])
			).toEqual([[2, AGENTIC_CHAT_READ_ONLY_TOOL_FIXTURE_V1.validationFailure.name]]);
			const firstPublicResultIndex = harness.log.indexOf('semantic:tool_result:');
			const validationPublicResultIndex = harness.log.indexOf(
				'semantic:tool_result:',
				firstPublicResultIndex + 1
			);
			expect(harness.log.indexOf('validation_ledger')).toBeLessThan(
				validationPublicResultIndex
			);
			expect(validationPublicResultIndex).toBeLessThan(
				harness.log.indexOf('repair_provider')
			);
			expect(terminalInput.assistantMetadata).toMatchObject({
				tool_round_count: 4,
				tool_call_count: 4
			});
			expect(
				streamBroadcastMessages(harness.broadcastMessages).map(
					(message) => (message.payload as Record<string, unknown>).type
				)
			).toEqual([
				'turn_phase',
				'session',
				'context_usage',
				'agent_state',
				'tool_call',
				'tool_result',
				'tool_call',
				'tool_result',
				'tool_call',
				'tool_result',
				'context_shift',
				'tool_call',
				'tool_result',
				'text_delta',
				'turn_phase',
				'last_turn_context',
				'timing',
				'done'
			]);
		} finally {
			await harness.publisher.stop();
		}
	});

	it('routes the deterministic mutating-tool fixture through the effect boundary', async () => {
		const fixture = AGENTIC_CHAT_MUTATING_TOOL_FIXTURE_V1;
		const harness = createHarness(
			[
				{
					type: 'semantic',
					transitionId: 'e3000000-0000-4000-8000-00000000003e',
					phase: 'stream',
					eventType: 'agent_state',
					currentActivity: 'Planning the first step...',
					eventPayload: {
						type: 'agent_state',
						state: 'thinking',
						contextType: fixture.request.contextType,
						details: 'Planning the first step...',
						activity_visibility: 'activity_log'
					}
				},
				{
					type: 'mutating_tool',
					logicalProviderRound: 1,
					callTransitionId: CALL_TRANSITION_ID,
					resultTransitionId: RESULT_TRANSITION_ID,
					logicalOperationId: fixture.tool.logicalOperationId,
					providerToolCallId: fixture.tool.callId,
					toolName: fixture.tool.name,
					operationName: fixture.tool.operationName,
					arguments: fixture.tool.arguments,
					downstreamIdempotencySupported: fixture.tool.downstreamIdempotencySupported
				},
				{ type: 'text_delta', text: fixture.response.assistantText },
				{
					type: 'finish',
					finishedReason: fixture.response.finishedReason,
					usage: fixture.response.usage
				}
			],
			{ promptSnapshot: fixturePromptSnapshot }
		);
		const stable = createStableAgenticChatEffectIdentityV1({
			turnRunId: TURN_RUN_ID,
			logicalOperationId: fixture.tool.logicalOperationId,
			toolName: fixture.tool.name,
			operationName: fixture.tool.operationName,
			arguments: fixture.tool.arguments
		});
		const effectReceipt = (overrides: Record<string, unknown> = {}) => ({
			effectId: stable.effectId,
			turnRunId: TURN_RUN_ID,
			executionGeneration: EXECUTION_GENERATION,
			sessionId: SESSION_ID,
			userId: USER_ID,
			state: 'reserved',
			downstreamIdempotencySupported: fixture.tool.downstreamIdempotencySupported,
			downstreamReceipt: null,
			startedAt: null,
			finishedAt: null,
			outcome: 'reserved',
			invokeAdapter: false,
			...overrides
		});
		const effectControl = {
			reserve: vi.fn(async () => effectReceipt()),
			begin: vi.fn(async () =>
				effectReceipt({
					state: 'started',
					startedAt: fixture.clockIso,
					outcome: 'started',
					invokeAdapter: true
				})
			),
			reconcile: vi.fn(async (input: { targetState: string; downstreamReceipt: unknown }) =>
				effectReceipt({
					state: input.targetState,
					startedAt: fixture.clockIso,
					finishedAt: fixture.clockIso,
					downstreamReceipt: input.downstreamReceipt,
					outcome: 'reconciled'
				})
			)
		};
		const runGateway = vi.fn(async () => ({
			ok: true,
			data: {
				task: {
					...fixture.tool.result.task,
					project_name: 'Fixture project'
				}
			},
			entityKind: 'task',
			entityId: fixture.tool.result.task.id,
			entityProjectId: fixture.tool.result.task.project_id,
			entityTitle: fixture.tool.result.task.title
		}));
		const mutatingTool = new AgenticChatTableMutationAdapter({} as never, {
			runGateway: runGateway as never,
			taskSync: { syncTaskEvents: vi.fn() } as never
		});
		const mutatingToolExecute = vi.spyOn(mutatingTool, 'execute');
		const realMutation = new AgenticChatMutationExecutor({
			control: effectControl as never,
			mutatingTool
		});
		harness.mutation.execute.mockImplementation((input) => realMutation.execute(input));

		const ledgerRpc = vi.fn((name: string, args: Record<string, unknown>) => {
			expect(name).toBe('persist_agentic_chat_mutation_tool_execution');
			const response = Promise.resolve({
				data: {
					outcome: 'persisted',
					turn_run_id: TURN_RUN_ID,
					queue_job_id: QUEUE_JOB_ID,
					session_id: SESSION_ID,
					user_id: USER_ID,
					execution_generation: EXECUTION_GENERATION,
					tool_execution_id: args.p_tool_execution_id,
					effect_id: args.p_effect_id,
					sequence_index: args.p_sequence_index,
					provider_tool_call_id: args.p_provider_tool_call_id,
					tool_name: args.p_tool_name,
					message_id: null,
					created_at: fixture.clockIso
				},
				error: null
			}) as Promise<{ data: unknown; error: null }> & {
				abortSignal?: (signal: AbortSignal) => Promise<{ data: unknown; error: null }>;
			};
			response.abortSignal = () => response;
			return response;
		});
		const realLedger = new SupabaseAgenticChatToolExecutionAdapter({ rpc: ledgerRpc });
		harness.toolExecutions.persistMutation.mockImplementation(async (input, signal) => {
			harness.log.push('mutation_ledger');
			await realLedger.persistMutation(input, signal);
		});

		const fixtureExecutionInput = {
			...executionInput,
			requestPayload: {
				...executionInput.requestPayload,
				message: fixture.request.message,
				context: {
					type: fixture.request.contextType,
					entityId: fixture.request.entityId
				}
			},
			artifact: {
				...executionInput.artifact,
				prepared: {
					...executionInput.artifact.prepared,
					toolSurface: {
						surfaceProfile: 'test_fixture_mutation',
						toolNames: [fixture.tool.name],
						definitions: [
							{
								type: 'function',
								function: {
									name: fixture.tool.name,
									description: 'Update a task.',
									parameters: { type: 'object', properties: {} }
								}
							}
						]
					}
				}
			}
		};
		harness.input.load.mockResolvedValueOnce(fixtureExecutionInput);

		try {
			await expect(harness.executor.execute(job())).resolves.toMatchObject({
				outcome: 'completed',
				terminalStatus: 'completed'
			});
			const terminalInput = harness.control.finalize.mock.calls[0]?.[0];
			if (!terminalInput) throw new Error('Phase 4 mutation fixture did not finalize');
			const persistedMutation = harness.toolExecutions.persistMutation.mock.calls[0]?.[0];
			if (!persistedMutation) throw new Error('Phase 4 mutation fixture was not persisted');
			expect(effectControl.reserve).toHaveBeenCalledOnce();
			expect(effectControl.begin).toHaveBeenCalledOnce();
			expect(effectControl.reconcile).toHaveBeenCalledWith(
				expect.objectContaining({
					targetState: 'succeeded',
					downstreamReceipt: fixture.tool.result
				})
			);
			expect(mutatingToolExecute).toHaveBeenCalledOnce();
			expect(mutatingToolExecute).toHaveBeenCalledWith(
				expect.objectContaining({
					effectId: stable.effectId,
					downstreamIdempotencyKey: stable.downstreamIdempotencyKey
				})
			);
			expect(ledgerRpc).toHaveBeenCalledOnce();
			expect(ledgerRpc.mock.calls[0]?.[1]).toMatchObject({
				p_effect_id: stable.effectId,
				p_operation_name: fixture.tool.operationName,
				p_affected_entities: fixture.tool.affectedEntities,
				p_execution_time_ms: expect.any(Number)
			});
		} finally {
			await harness.publisher.stop();
		}
	});

	it('holds the durable-then-public fence inside every continueWithToolResults round', async () => {
		const harness = createHarness([]);
		const continueWithToolResults = vi.fn(({ round }: { round: number }) => {
			if (round === 2) {
				return (async function* () {
					yield {
						type: 'read_tool',
						callTransitionId: SECOND_CALL_TRANSITION_ID,
						resultTransitionId: SECOND_RESULT_TRANSITION_ID,
						providerToolCallId: 'provider-round-read-2',
						toolName: 'fixture_task_read',
						arguments: { taskId: 'db000000-0000-4000-8000-000000000002' }
					} as const;
				})();
			}
			return (async function* () {
				yield { type: 'text_delta', text: 'Both fixtures are ready.' } as const;
				yield {
					type: 'finish',
					finishedReason: 'stop',
					usage: { promptTokens: 12, completionTokens: 5, totalTokens: 17 }
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
							providerToolCallId: 'provider-round-read-1',
							toolName: 'fixture_project_read',
							arguments: { projectId: 'da000000-0000-4000-8000-000000000001' }
						} as const;
					})(),
				continueWithToolResults,
				release: vi.fn()
			}))
		});

		const processingJob = job();
		try {
			await expect(harness.executor.execute(processingJob)).resolves.toMatchObject({
				outcome: 'completed',
				terminalStatus: 'completed'
			});
			// One admission claim plus one fence reclaim per read round.
			expect(harness.control.claim).toHaveBeenCalledTimes(3);
			expect(
				executionBoundaryLogs(processingJob).map(({ stage, state }) => `${stage}:${state}`)
			).toEqual([
				'read_op:started',
				'read_op:finished',
				'ledger_persist:started',
				'ledger_persist:finished',
				'tool_result_publish:started',
				'tool_result_publish:finished',
				'tool_round:started',
				'read_op:started',
				'read_op:finished',
				'ledger_persist:started',
				'ledger_persist:finished',
				'tool_result_publish:started',
				'tool_result_publish:finished',
				'tool_round:started'
			]);
			expect(
				harness.toolExecutions.persistRead.mock.calls.map(([input]) => input.sequenceIndex)
			).toEqual([1, 2]);
			expect(harness.control.finalize).toHaveBeenCalledWith(
				expect.objectContaining({
					assistantMetadata: expect.objectContaining({
						tool_round_count: 2,
						tool_call_count: 2
					})
				})
			);
		} finally {
			await harness.publisher.stop();
		}
	});

	it('continues one mixed read/write round only after both ordered receipts are durable and public', async () => {
		const harness = createHarness([]);
		const invalidateReadMemo = vi.fn(() => harness.log.push('read_memo_invalidated'));
		harness.toolExecutions.persistRead.mockImplementationOnce(async () => {
			harness.log.push('read_ledger');
		});
		harness.mutation.execute.mockImplementationOnce(async () => {
			harness.log.push('mutation_adapter');
			return {
				effectId: EFFECT_ID,
				canonicalArgumentHash: 'a'.repeat(64),
				downstreamIdempotencyKey: `chat-effect:${EFFECT_ID}`,
				downstreamReceipt: { mutationId: 'fixture-mutation-1' },
				replayed: false
			};
		});
		const continueWithToolResults = vi.fn(
			({ results }: { results: ReadonlyArray<Record<string, unknown>> }) => {
				harness.log.push('continuation');
				expect(results.map((result) => result.providerToolCallId)).toEqual([
					'provider-mixed-read',
					'provider-mixed-write'
				]);
				expect(results[0]).not.toHaveProperty('mutation');
				expect(results[1]).toMatchObject({
					mutation: {
						effectId: EFFECT_ID,
						logicalOperationId: LOGICAL_OPERATION_ID,
						operationName: 'onto.task.update',
						replayed: false
					}
				});
				return (async function* () {
					yield { type: 'text_delta', text: 'The mixed round is complete.' } as const;
					yield { type: 'finish', finishedReason: 'stop', usage: null } as const;
				})();
			}
		);
		Object.assign(harness.provider, {
			prepare: vi.fn(async () => ({
				stream: () =>
					(async function* () {
						yield {
							type: 'read_tool',
							callTransitionId: CALL_TRANSITION_ID,
							resultTransitionId: RESULT_TRANSITION_ID,
							providerToolCallId: 'provider-mixed-read',
							toolName: 'fixture_project_read',
							arguments: { projectId: 'da000000-0000-4000-8000-000000000001' }
						} as const;
						yield {
							type: 'mutating_tool',
							callTransitionId: SECOND_CALL_TRANSITION_ID,
							resultTransitionId: SECOND_RESULT_TRANSITION_ID,
							logicalOperationId: LOGICAL_OPERATION_ID,
							providerToolCallId: 'provider-mixed-write',
							toolName: 'update_onto_task',
							operationName: 'onto.task.update',
							arguments: {
								task_id: 'db000000-0000-4000-8000-000000000002',
								state_key: 'in_progress'
							},
							downstreamIdempotencySupported: false
						} as const;
					})(),
				continueWithToolResults,
				invalidateReadMemo,
				release: vi.fn()
			}))
		});

		try {
			await expect(harness.executor.execute(job())).resolves.toMatchObject({
				outcome: 'completed',
				terminalStatus: 'completed'
			});
			expect(invalidateReadMemo).toHaveBeenCalledOnce();
			expect(harness.log.indexOf('read_memo_invalidated')).toBeLessThan(
				harness.log.indexOf('mutation_adapter')
			);
			expect(harness.log.indexOf('read_ledger')).toBeLessThan(
				harness.log.indexOf('continuation')
			);
			expect(harness.log.indexOf('mutation_ledger')).toBeLessThan(
				harness.log.indexOf('continuation')
			);
			const publicResultIndices = harness.log
				.map((entry, index) => ({ entry, index }))
				.filter(({ entry }) => entry === 'semantic:tool_result:')
				.map(({ index }) => index);
			expect(publicResultIndices).toHaveLength(2);
			expect(publicResultIndices[1]).toBeLessThan(harness.log.indexOf('continuation'));
			expect(harness.control.finalize).toHaveBeenCalledWith(
				expect.objectContaining({
					assistantMetadata: expect.objectContaining({
						tool_round_count: 1,
						tool_call_count: 2
					})
				})
			);
		} finally {
			await harness.publisher.stop();
		}
	});

	it('advances read invalidation telemetry only after a committed mutation', async () => {
		const harness = createHarness([], {
			maxToolConcurrency: 3,
			concurrentReadsEnabled: true,
			concurrentMutationsEnabled: true
		});
		const continueWithToolResults = vi.fn(() =>
			(async function* () {
				yield { type: 'text_delta', text: 'The update was verified.' } as const;
				yield { type: 'finish', finishedReason: 'stop', usage: null } as const;
			})()
		);
		Object.assign(harness.provider, {
			prepare: vi.fn(async () => ({
				stream: () =>
					(async function* () {
						yield {
							logicalProviderRound: 1,
							type: 'read_tool',
							callTransitionId: CALL_TRANSITION_ID,
							resultTransitionId: RESULT_TRANSITION_ID,
							providerToolCallId: 'provider-read-before-write',
							toolName: 'fixture_project_read',
							arguments: { project_id: SHIFT_PROJECT_ID },
							scheduling: { callRef: 'before', after: [] }
						} as const;
						yield {
							logicalProviderRound: 1,
							type: 'mutating_tool',
							callTransitionId: SECOND_CALL_TRANSITION_ID,
							resultTransitionId: SECOND_RESULT_TRANSITION_ID,
							logicalOperationId: LOGICAL_OPERATION_ID,
							providerToolCallId: 'provider-write-between-reads',
							toolName: 'update_onto_task',
							operationName: 'onto.task.update',
							arguments: {
								task_id: 'db000000-0000-4000-8000-000000000002',
								state_key: 'in_progress'
							},
							downstreamIdempotencySupported: false,
							scheduling: { callRef: 'write', after: ['before'] }
						} as const;
						yield {
							logicalProviderRound: 1,
							type: 'read_tool',
							callTransitionId: THIRD_CALL_TRANSITION_ID,
							resultTransitionId: THIRD_RESULT_TRANSITION_ID,
							providerToolCallId: 'provider-read-after-write',
							toolName: 'fixture_project_read',
							arguments: { project_id: SHIFT_PROJECT_ID },
							scheduling: { callRef: 'after', after: ['write'] }
						} as const;
					})(),
				continueWithToolResults,
				invalidateReadMemo: vi.fn(),
				release: vi.fn()
			}))
		});

		try {
			await expect(harness.executor.execute(job())).resolves.toMatchObject({
				outcome: 'completed',
				terminalStatus: 'completed'
			});
			const ended = harness.executionObservationInputs
				.filter((observation) => observation.eventType === 'tool_execution_ended')
				.sort(
					(left, right) =>
						Number(left.payload.sequence_index) - Number(right.payload.sequence_index)
				);
			expect(
				ended.map((observation) => ({
					class: observation.payload.execution_class,
					epoch: observation.payload.read_epoch,
					status: observation.payload.status
				}))
			).toEqual([
				{ class: 'evidence_read', epoch: 0, status: 'success' },
				{ class: 'mutation', epoch: 0, status: 'success' },
				{ class: 'evidence_read', epoch: 1, status: 'success' }
			]);
		} finally {
			await harness.publisher.stop();
		}
	});

	it('invalidates provider read memo before a mutation that fails uncertain', async () => {
		const harness = createHarness([], {
			recovery: [
				recoveryReceipt('effect_reconciliation_required', {
					failure_code: 'uncertain_external_commit'
				})
			]
		});
		const invalidateReadMemo = vi.fn();
		const continueWithToolResults = vi.fn();
		Object.assign(harness.provider, {
			prepare: vi.fn(async () => ({
				stream: () =>
					(async function* () {
						yield {
							type: 'mutating_tool',
							callTransitionId: CALL_TRANSITION_ID,
							resultTransitionId: RESULT_TRANSITION_ID,
							logicalOperationId: LOGICAL_OPERATION_ID,
							providerToolCallId: 'provider-uncertain-write',
							toolName: 'update_onto_task',
							operationName: 'onto.task.update',
							arguments: {
								task_id: 'db000000-0000-4000-8000-000000000002',
								state_key: 'in_progress'
							},
							downstreamIdempotencySupported: false
						} as const;
					})(),
				continueWithToolResults,
				invalidateReadMemo,
				release: vi.fn()
			}))
		});
		harness.mutation.execute.mockRejectedValueOnce(
			new AgenticChatEffectExecutionError(
				'uncertain_external_commit',
				EFFECT_ID,
				'connection closed after possible commit'
			)
		);

		try {
			await expect(harness.executor.execute(job())).resolves.toMatchObject({
				outcome: 'effect_reconciliation_required',
				terminalStatus: null
			});
			expect(invalidateReadMemo).toHaveBeenCalledOnce();
			expect(harness.mutation.execute).toHaveBeenCalledOnce();
			expect(continueWithToolResults).not.toHaveBeenCalled();
		} finally {
			await harness.publisher.stop();
		}
	});

	it('continues after a known failed mutation only after its failed row is durable and public', async () => {
		const harness = createHarness([]);
		const invalidateReadMemo = vi.fn();
		harness.toolExecutions.persistFailure.mockImplementationOnce(async () => {
			harness.log.push('known_failure_ledger');
		});
		harness.mutation.execute.mockRejectedValueOnce(
			new AgenticChatEffectExecutionError('permanent', EFFECT_ID, 'Task not found')
		);
		const mutationArguments = {
			task_id: 'db000000-0000-4000-8000-000000000002',
			state_key: 'in_progress'
		};
		const continueWithToolResults = vi.fn((input: AgenticChatProviderToolRoundInputV1) => {
			harness.log.push('known_failure_continuation');
			expect(input).toEqual({
				round: 2,
				results: [
					{
						providerToolCallId: 'provider-known-failed-write',
						toolName: 'update_onto_task',
						arguments: mutationArguments,
						failure: {
							kind: 'known_execution_failure',
							error: 'Task not found',
							toolCategory: 'ontology_action',
							modelPayload: { error: 'Task not found' }
						}
					}
				]
			});
			return (async function* () {
				yield { type: 'text_delta', text: 'I could not find that task.' } as const;
				yield { type: 'finish', finishedReason: 'stop', usage: null } as const;
			})();
		});
		Object.assign(harness.provider, {
			prepare: vi.fn(async () => ({
				stream: () =>
					(async function* () {
						yield {
							type: 'mutating_tool',
							callTransitionId: CALL_TRANSITION_ID,
							resultTransitionId: RESULT_TRANSITION_ID,
							logicalOperationId: LOGICAL_OPERATION_ID,
							providerToolCallId: 'provider-known-failed-write',
							toolName: 'update_onto_task',
							operationName: 'onto.task.update',
							arguments: mutationArguments,
							downstreamIdempotencySupported: false
						} as const;
					})(),
				continueWithToolResults,
				invalidateReadMemo,
				release: vi.fn()
			}))
		});

		try {
			await expect(harness.executor.execute(job())).resolves.toMatchObject({
				outcome: 'completed',
				terminalStatus: 'completed'
			});
			expect(invalidateReadMemo).toHaveBeenCalledOnce();
			expect(harness.toolExecutions.persistMutation).not.toHaveBeenCalled();
			expect(harness.toolExecutions.persistFailure).toHaveBeenCalledWith(
				expect.objectContaining({
					sequenceIndex: 1,
					providerToolCallId: 'provider-known-failed-write',
					toolName: 'update_onto_task',
					arguments: mutationArguments,
					toolCategory: 'ontology_action',
					error: 'Task not found'
				}),
				expect.any(AbortSignal)
			);
			const publicResultIndex = harness.log.indexOf('semantic:tool_result:');
			expect(harness.log.indexOf('known_failure_ledger')).toBeLessThan(publicResultIndex);
			expect(publicResultIndex).toBeLessThan(
				harness.log.indexOf('known_failure_continuation')
			);
			expect(harness.semanticInputs).toEqual(
				expect.arrayContaining([
					expect.objectContaining({
						event_type: 'tool_result',
						event_payload: expect.objectContaining({
							result: expect.objectContaining({
								tool_call_id: 'provider-known-failed-write',
								success: false,
								error: 'Task not found',
								effect_id: EFFECT_ID
							})
						})
					})
				])
			);
		} finally {
			await harness.publisher.stop();
		}
	});

	it('skips an explicit dependency after a durable known mutation failure', async () => {
		const harness = createHarness([], {
			concurrentReadsEnabled: true,
			concurrentMutationsEnabled: true
		});
		harness.mutation.execute.mockRejectedValueOnce(
			new AgenticChatEffectExecutionError('permanent', EFFECT_ID, 'Task not found')
		);
		const continueWithToolResults = vi.fn(
			({ results }: AgenticChatProviderToolRoundInputV1) => {
				expect(results).toEqual([
					expect.objectContaining({
						providerToolCallId: 'failed-prerequisite',
						failure: expect.objectContaining({ kind: 'known_execution_failure' })
					}),
					expect.objectContaining({
						providerToolCallId: 'blocked-dependent',
						failure: expect.objectContaining({
							kind: 'dependency_failed',
							modelPayload: expect.objectContaining({
								blocked_by_provider_tool_call_ids: ['failed-prerequisite']
							})
						})
					})
				]);
				return (async function* () {
					yield { type: 'text_delta', text: 'The prerequisite failed.' } as const;
					yield { type: 'finish', finishedReason: 'stop', usage: null } as const;
				})();
			}
		);
		Object.assign(harness.provider, {
			prepare: vi.fn(async () => ({
				stream: () =>
					(async function* () {
						yield {
							type: 'mutating_tool',
							callTransitionId: CALL_TRANSITION_ID,
							resultTransitionId: RESULT_TRANSITION_ID,
							logicalOperationId: LOGICAL_OPERATION_ID,
							providerToolCallId: 'failed-prerequisite',
							toolName: 'update_onto_task',
							operationName: 'onto.task.update',
							arguments: { task_id: 'task-a', state_key: 'done' },
							downstreamIdempotencySupported: false,
							scheduling: { callRef: 'first', after: [] }
						} as const;
						yield {
							type: 'read_tool',
							callTransitionId: SECOND_CALL_TRANSITION_ID,
							resultTransitionId: SECOND_RESULT_TRANSITION_ID,
							providerToolCallId: 'blocked-dependent',
							toolName: 'fixture_task_read',
							arguments: { task_id: 'task-a' },
							scheduling: { callRef: 'second', after: ['first'] }
						} as const;
					})(),
				continueWithToolResults,
				invalidateReadMemo: vi.fn(),
				release: vi.fn()
			}))
		});

		try {
			await expect(harness.executor.execute(job())).resolves.toMatchObject({
				outcome: 'completed'
			});
			expect(harness.readTool.execute).not.toHaveBeenCalled();
			expect(
				harness.toolExecutions.persistFailure.mock.calls.map(([input]) => [
					input.sequenceIndex,
					input.providerToolCallId
				])
			).toEqual([
				[1, 'failed-prerequisite'],
				[2, 'blocked-dependent']
			]);
		} finally {
			await harness.publisher.stop();
		}
	});

	it('persists parallel provider reads sequentially before replaying the ordered round', async () => {
		const harness = createHarness([]);
		const continueWithToolResults = vi.fn(
			({ results }: { results: ReadonlyArray<{ providerToolCallId: string }> }) => {
				harness.log.push('continuation');
				expect(results.map(({ providerToolCallId }) => providerToolCallId)).toEqual([
					'provider-parallel-read-1',
					'provider-parallel-read-2'
				]);
				return (async function* () {
					yield { type: 'text_delta', text: 'Both parallel reads are ready.' } as const;
					yield { type: 'finish', finishedReason: 'stop', usage: null } as const;
				})();
			}
		);
		Object.assign(harness.provider, {
			prepare: vi.fn(async () => ({
				stream: () =>
					(async function* () {
						yield {
							type: 'read_tool',
							callTransitionId: CALL_TRANSITION_ID,
							resultTransitionId: RESULT_TRANSITION_ID,
							providerToolCallId: 'provider-parallel-read-1',
							toolName: 'fixture_project_read',
							arguments: { marker: 'first' }
						} as const;
						yield {
							type: 'read_tool',
							callTransitionId: SECOND_CALL_TRANSITION_ID,
							resultTransitionId: SECOND_RESULT_TRANSITION_ID,
							providerToolCallId: 'provider-parallel-read-2',
							toolName: 'fixture_task_read',
							arguments: { marker: 'second' }
						} as const;
					})(),
				continueWithToolResults,
				release: vi.fn()
			}))
		});

		try {
			await expect(harness.executor.execute(job())).resolves.toMatchObject({
				outcome: 'completed',
				terminalStatus: 'completed'
			});
			expect(
				harness.readTool.execute.mock.calls.map(([input]) => [
					input.providerToolCallId,
					input.toolName
				])
			).toEqual([
				['provider-parallel-read-1', 'fixture_project_read'],
				['provider-parallel-read-2', 'fixture_task_read']
			]);
			expect(
				harness.toolExecutions.persistRead.mock.calls.map(([input]) => [
					input.sequenceIndex,
					input.providerToolCallId
				])
			).toEqual([
				[1, 'provider-parallel-read-1'],
				[2, 'provider-parallel-read-2']
			]);
			const publicResultIndexes = harness.log
				.map((entry, index) => ({ entry, index }))
				.filter(({ entry }) => entry === 'semantic:tool_result:')
				.map(({ index }) => index);
			expect(publicResultIndexes).toHaveLength(2);
			expect(publicResultIndexes[1]).toBeLessThan(harness.log.indexOf('continuation'));
			expect(harness.control.finalize).toHaveBeenCalledWith(
				expect.objectContaining({
					assistantMetadata: expect.objectContaining({
						tool_round_count: 1,
						tool_call_count: 2
					})
				})
			);
		} finally {
			await harness.publisher.stop();
		}
	});

	it('executes independent same-response reads concurrently by default', async () => {
		let releaseFirstToolResult!: () => void;
		const firstToolResultGate = new Promise<void>((resolve) => {
			releaseFirstToolResult = resolve;
		});
		let blockedFirstToolResult = false;
		const harness = createHarness([], {
			maxToolConcurrency: 2,
			beforePersistSemantic: async (input) => {
				const payload = input.event_payload as Record<string, unknown>;
				if (payload.type === 'tool_result' && !blockedFirstToolResult) {
					blockedFirstToolResult = true;
					await firstToolResultGate;
				}
			}
		});
		const starts: string[] = [];
		const completions = new Map<string, () => void>();
		harness.readTool.execute.mockImplementation(
			(input) =>
				new Promise((resolve) => {
					starts.push(input.providerToolCallId);
					completions.set(input.providerToolCallId, () =>
						resolve({
							result: { call_id: input.providerToolCallId },
							executionTimeMs: null,
							tokensConsumed: null,
							affectedEntities: [],
							toolCategory: 'read',
							resultCount: 1,
							zeroResult: false,
							requiresUserAction: false
						})
					);
				})
		);
		const continueWithToolResults = vi.fn(
			({ results }: AgenticChatProviderToolRoundInputV1) => {
				expect(results.map((result) => result.providerToolCallId)).toEqual([
					'parallel-a',
					'parallel-b'
				]);
				return (async function* () {
					yield { type: 'text_delta', text: 'Parallel reads completed.' } as const;
					yield { type: 'finish', finishedReason: 'stop', usage: null } as const;
				})();
			}
		);
		Object.assign(harness.provider, {
			prepare: vi.fn(async () => ({
				stream: () =>
					(async function* () {
						yield {
							type: 'read_tool',
							callTransitionId: CALL_TRANSITION_ID,
							resultTransitionId: RESULT_TRANSITION_ID,
							providerToolCallId: 'parallel-a',
							toolName: 'fixture_project_read',
							arguments: { marker: 'a' }
						} as const;
						yield {
							type: 'read_tool',
							callTransitionId: SECOND_CALL_TRANSITION_ID,
							resultTransitionId: SECOND_RESULT_TRANSITION_ID,
							providerToolCallId: 'parallel-b',
							toolName: 'fixture_task_read',
							arguments: { marker: 'b' }
						} as const;
					})(),
				continueWithToolResults,
				release: vi.fn()
			}))
		});

		try {
			const processingJob = job();
			const execution = harness.executor.execute(processingJob);
			await vi.waitFor(() => expect(starts).toHaveLength(2));
			completions.get('parallel-b')?.();
			completions.get('parallel-a')?.();
			await vi.waitFor(() => expect(blockedFirstToolResult).toBe(true));
			releaseFirstToolResult();
			await expect(execution).resolves.toMatchObject({ outcome: 'completed' });
			expect(starts).toEqual(['parallel-a', 'parallel-b']);
			expect(continueWithToolResults).toHaveBeenCalledOnce();
			const sequenceByCall = Object.fromEntries(
				harness.toolExecutions.persistRead.mock.calls.map(([input]) => [
					input.providerToolCallId,
					input.sequenceIndex
				])
			);
			expect(sequenceByCall).toEqual({ 'parallel-a': 1, 'parallel-b': 2 });
			const resultProjections = harness.semanticInputs
				.filter((input) => input.event_type === 'tool_result')
				.map(
					(input) =>
						input.projection as { semantic_events: Array<{ sequence_index: number }> }
				);
			expect(resultProjections).toHaveLength(2);
			for (const projection of resultProjections) {
				const sequences = projection.semantic_events.map((event) => event.sequence_index);
				expect(sequences).toEqual(
					[...new Set(sequences)].sort((left, right) => left - right)
				);
			}
		} finally {
			await harness.publisher.stop();
		}
	});

	it('executes audited independent row-local mutations concurrently by default', async () => {
		const harness = createHarness([], {
			maxToolConcurrency: 2
		});
		const starts: string[] = [];
		const completions = new Map<string, () => void>();
		harness.mutation.execute.mockImplementation(
			(input) =>
				new Promise((resolve) => {
					const id = input.step.providerToolCallId;
					starts.push(id);
					completions.set(id, () =>
						resolve({
							effectId:
								id === 'parallel-write-a'
									? 'd1000000-0000-5000-8000-00000000001d'
									: 'd2000000-0000-5000-8000-00000000002d',
							canonicalArgumentHash:
								id === 'parallel-write-a' ? 'a'.repeat(64) : 'b'.repeat(64),
							downstreamIdempotencyKey: `chat-effect:${id}`,
							downstreamReceipt: { task_id: id },
							replayed: false
						})
					);
				})
		);
		const continueWithToolResults = vi.fn(
			({ results }: AgenticChatProviderToolRoundInputV1) => {
				expect(results.map((result) => result.providerToolCallId)).toEqual([
					'parallel-write-a',
					'parallel-write-b'
				]);
				return (async function* () {
					yield { type: 'text_delta', text: 'Both tasks were updated.' } as const;
					yield { type: 'finish', finishedReason: 'stop', usage: null } as const;
				})();
			}
		);
		const invalidateReadMemo = vi.fn();
		Object.assign(harness.provider, {
			prepare: vi.fn(async () => ({
				stream: () =>
					(async function* () {
						yield {
							type: 'mutating_tool',
							callTransitionId: CALL_TRANSITION_ID,
							resultTransitionId: RESULT_TRANSITION_ID,
							logicalOperationId: LOGICAL_OPERATION_ID,
							providerToolCallId: 'parallel-write-a',
							toolName: 'update_onto_task',
							operationName: 'onto.task.update',
							arguments: { task_id: 'task-a', state_key: 'done' },
							downstreamIdempotencySupported: false
						} as const;
						yield {
							type: 'mutating_tool',
							callTransitionId: SECOND_CALL_TRANSITION_ID,
							resultTransitionId: SECOND_RESULT_TRANSITION_ID,
							logicalOperationId: 'c1000000-0000-4000-8000-00000000001c',
							providerToolCallId: 'parallel-write-b',
							toolName: 'update_onto_task',
							operationName: 'onto.task.update',
							arguments: { task_id: 'task-b', state_key: 'done' },
							downstreamIdempotencySupported: false
						} as const;
					})(),
				continueWithToolResults,
				invalidateReadMemo,
				release: vi.fn()
			}))
		});

		try {
			const processingJob = job();
			const execution = harness.executor.execute(processingJob);
			await vi.waitFor(() => expect(starts).toHaveLength(2));
			completions.get('parallel-write-b')?.();
			completions.get('parallel-write-a')?.();
			await expect(execution).resolves.toMatchObject({ outcome: 'completed' });
			expect(starts).toEqual(['parallel-write-a', 'parallel-write-b']);
			expect(invalidateReadMemo).toHaveBeenCalledOnce();
			const sequenceByCall = Object.fromEntries(
				harness.toolExecutions.persistMutation.mock.calls.map(([input]) => [
					input.providerToolCallId,
					input.sequenceIndex
				])
			);
			expect(sequenceByCall).toEqual({ 'parallel-write-a': 1, 'parallel-write-b': 2 });
			expect(toolExecutionGraphLogs(processingJob)).toEqual([
				expect.objectContaining({
					requested_mode: 'parallel_default',
					max_observed_concurrency: 2,
					graph_execution_ms: expect.any(Number),
					estimated_serial_execution_ms: expect.any(Number),
					parallel_savings_ms: expect.any(Number),
					call_timings: [
						expect.objectContaining({
							provider_tool_call_id: 'parallel-write-a',
							layer_index: 0,
							started_offset_ms: expect.any(Number),
							duration_ms: expect.any(Number)
						}),
						expect.objectContaining({
							provider_tool_call_id: 'parallel-write-b',
							layer_index: 0,
							started_offset_ms: expect.any(Number),
							duration_ms: expect.any(Number)
						})
					]
				})
			]);
		} finally {
			await harness.publisher.stop();
		}
	});

	it('honors an explicit sequential dependency chain before continuation', async () => {
		const harness = createHarness([], {
			concurrentReadsEnabled: true,
			maxToolConcurrency: 4
		});
		const starts: string[] = [];
		harness.readTool.execute.mockImplementation(async (input) => {
			starts.push(input.providerToolCallId);
			return {
				result: { call_id: input.providerToolCallId },
				executionTimeMs: null,
				tokensConsumed: null,
				affectedEntities: [],
				toolCategory: 'read',
				resultCount: 1,
				zeroResult: false,
				requiresUserAction: false
			};
		});
		const continueWithToolResults = vi.fn(() =>
			(async function* () {
				yield { type: 'text_delta', text: 'Sequential reads completed.' } as const;
				yield { type: 'finish', finishedReason: 'stop', usage: null } as const;
			})()
		);
		Object.assign(harness.provider, {
			prepare: vi.fn(async () => ({
				stream: () =>
					(async function* () {
						yield {
							type: 'read_tool',
							callTransitionId: CALL_TRANSITION_ID,
							resultTransitionId: RESULT_TRANSITION_ID,
							providerToolCallId: 'sequential-a',
							toolName: 'fixture_project_read',
							arguments: { marker: 'a' },
							scheduling: { callRef: 'first', after: [] }
						} as const;
						yield {
							type: 'read_tool',
							callTransitionId: SECOND_CALL_TRANSITION_ID,
							resultTransitionId: SECOND_RESULT_TRANSITION_ID,
							providerToolCallId: 'sequential-b',
							toolName: 'fixture_task_read',
							arguments: { marker: 'b' },
							scheduling: { callRef: 'second', after: ['first'] }
						} as const;
					})(),
				continueWithToolResults,
				release: vi.fn()
			}))
		});

		try {
			const processingJob = job();
			await expect(harness.executor.execute(processingJob)).resolves.toMatchObject({
				outcome: 'completed'
			});
			expect(starts).toEqual(['sequential-a', 'sequential-b']);
			expect(toolExecutionGraphLogs(processingJob)).toEqual([
				expect.objectContaining({
					requested_mode: 'explicit_dependencies',
					layer_widths: [1, 1],
					max_observed_concurrency: 1
				})
			]);
		} finally {
			await harness.publisher.stop();
		}
	});

	it('rejects an invalid batch graph before dispatching any sibling call', async () => {
		const harness = createHarness([], {
			concurrentReadsEnabled: true,
			recovery: [
				recoveryReceipt('finalize_failed', { failure_code: 'permanent' }),
				recoveryReceipt('queue_reconciled', {
					status: 'failed',
					failure_code: 'provider_tool_execution_graph_invalid'
				})
			]
		});
		Object.assign(harness.provider, {
			prepare: vi.fn(async () => ({
				stream: () =>
					(async function* () {
						yield {
							type: 'read_tool',
							callTransitionId: CALL_TRANSITION_ID,
							resultTransitionId: RESULT_TRANSITION_ID,
							providerToolCallId: 'valid-sibling',
							toolName: 'fixture_project_read',
							arguments: { marker: 'a' }
						} as const;
						yield {
							type: 'read_tool',
							callTransitionId: SECOND_CALL_TRANSITION_ID,
							resultTransitionId: SECOND_RESULT_TRANSITION_ID,
							providerToolCallId: 'invalid-dependent',
							toolName: 'fixture_task_read',
							arguments: { marker: 'b' },
							scheduling: { callRef: 'second', after: ['missing-ref'] }
						} as const;
					})(),
				continueWithToolResults: vi.fn(),
				release: vi.fn()
			}))
		});

		try {
			await expect(harness.executor.execute(job())).resolves.toMatchObject({
				outcome: 'failed',
				terminalStatus: 'failed'
			});
			expect(harness.readTool.execute).not.toHaveBeenCalled();
			expect(harness.toolExecutions.persistRead).not.toHaveBeenCalled();
			expect(harness.control.finalize).toHaveBeenCalledWith(
				expect.objectContaining({ failureCode: 'provider_tool_execution_graph_invalid' })
			);
		} finally {
			await harness.publisher.stop();
		}
	});

	it('runs a mixed fan-out/fan-in batch without starting the dependent read early', async () => {
		const harness = createHarness([], {
			concurrentReadsEnabled: true,
			maxToolConcurrency: 3
		});
		const starts: string[] = [];
		const completions = new Map<string, () => void>();
		harness.readTool.execute.mockImplementation((input) => {
			starts.push(input.providerToolCallId);
			const execution = {
				result: { call_id: input.providerToolCallId },
				executionTimeMs: null,
				tokensConsumed: null,
				affectedEntities: [],
				toolCategory: 'read',
				resultCount: 1,
				zeroResult: false,
				requiresUserAction: false
			};
			if (input.providerToolCallId === 'fanin-summary') return Promise.resolve(execution);
			return new Promise((resolve) =>
				completions.set(input.providerToolCallId, () => resolve(execution))
			);
		});
		const continueWithToolResults = vi.fn(() =>
			(async function* () {
				yield { type: 'text_delta', text: 'Mixed graph completed.' } as const;
				yield { type: 'finish', finishedReason: 'stop', usage: null } as const;
			})()
		);
		Object.assign(harness.provider, {
			prepare: vi.fn(async () => ({
				stream: () =>
					(async function* () {
						const transitions = [
							[CALL_TRANSITION_ID, RESULT_TRANSITION_ID],
							[SECOND_CALL_TRANSITION_ID, SECOND_RESULT_TRANSITION_ID],
							[THIRD_CALL_TRANSITION_ID, THIRD_RESULT_TRANSITION_ID]
						] as const;
						for (const [index, id] of [
							'fanin-a',
							'fanin-b',
							'fanin-summary'
						].entries()) {
							yield {
								type: 'read_tool',
								callTransitionId: transitions[index]![0],
								resultTransitionId: transitions[index]![1],
								providerToolCallId: id,
								toolName: 'fixture_project_read',
								arguments: { marker: id },
								scheduling: {
									callRef: id,
									after: id === 'fanin-summary' ? ['fanin-a', 'fanin-b'] : []
								}
							} as const;
						}
					})(),
				continueWithToolResults,
				release: vi.fn()
			}))
		});

		try {
			const execution = harness.executor.execute(job());
			await vi.waitFor(() => expect(starts).toEqual(['fanin-a', 'fanin-b']));
			completions.get('fanin-a')?.();
			await Promise.resolve();
			expect(starts).not.toContain('fanin-summary');
			completions.get('fanin-b')?.();
			await expect(execution).resolves.toMatchObject({ outcome: 'completed' });
			expect(starts).toEqual(['fanin-a', 'fanin-b', 'fanin-summary']);
		} finally {
			await harness.publisher.stop();
		}
	});

	it('persists and publishes a memo-served repeat without re-entering the read adapter', async () => {
		const harness = createHarness([]);
		const memoExecution = {
			result: {
				served_from_turn_memo: true,
				repeat_read_notice: 'Repeat read: use the earlier result.',
				title: 'Fixture project'
			},
			executionTimeMs: 0,
			tokensConsumed: null,
			affectedEntities: [],
			toolCategory: 'read',
			resultCount: null,
			zeroResult: null,
			requiresUserAction: false
		};
		const continueWithToolResults = vi.fn(({ round }: { round: number }) => {
			if (round === 2) {
				return (async function* () {
					yield {
						type: 'read_tool',
						callTransitionId: SECOND_CALL_TRANSITION_ID,
						resultTransitionId: SECOND_RESULT_TRANSITION_ID,
						providerToolCallId: 'provider-memo-read-2',
						toolName: 'fixture_project_read',
						arguments: { projectId: 'da000000-0000-4000-8000-000000000001' },
						memoServed: memoExecution
					} as const;
				})();
			}
			return (async function* () {
				yield { type: 'text_delta', text: 'The memo result is enough.' } as const;
				yield { type: 'finish', finishedReason: 'stop', usage: null } as const;
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
							providerToolCallId: 'provider-memo-read-1',
							toolName: 'fixture_project_read',
							arguments: {
								projectId: 'da000000-0000-4000-8000-000000000001'
							}
						} as const;
					})(),
				continueWithToolResults,
				release: vi.fn()
			}))
		});

		try {
			await expect(harness.executor.execute(job())).resolves.toMatchObject({
				outcome: 'completed',
				terminalStatus: 'completed'
			});
			expect(harness.readTool.execute).toHaveBeenCalledTimes(1);
			expect(harness.toolExecutions.persistRead).toHaveBeenCalledTimes(2);
			expect(harness.toolExecutions.persistRead.mock.calls[1]?.[0]).toMatchObject({
				sequenceIndex: 2,
				providerToolCallId: 'provider-memo-read-2',
				execution: memoExecution
			});
			expect(continueWithToolResults).toHaveBeenNthCalledWith(2, {
				round: 3,
				results: [
					{
						providerToolCallId: 'provider-memo-read-2',
						toolName: 'fixture_project_read',
						arguments: {
							projectId: 'da000000-0000-4000-8000-000000000001'
						},
						execution: memoExecution
					}
				]
			});
			const memoResult = harness.semanticInputs.find((input) => {
				const payload = input.event_payload as Record<string, unknown>;
				const result = payload.result as Record<string, unknown> | undefined;
				return result?.tool_call_id === 'provider-memo-read-2';
			});
			expect(memoResult?.event_payload).toMatchObject({
				type: 'tool_result',
				result: {
					tool_call_id: 'provider-memo-read-2',
					duration_ms: 0,
					result: { served_from_turn_memo: true },
					tool_category: 'read'
				}
			});
			expect(harness.control.finalize).toHaveBeenCalledWith(
				expect.objectContaining({
					assistantMetadata: expect.objectContaining({
						tool_round_count: 2,
						tool_call_count: 2
					})
				})
			);
		} finally {
			await harness.publisher.stop();
		}
	});

	it('writes a specific failed terminal when the provider round budget is exceeded', async () => {
		const harness = createHarness([], {
			maxProviderRounds: 1,
			recovery: [
				recoveryReceipt('finalize_failed', { failure_code: 'permanent' }),
				recoveryReceipt('queue_reconciled', {
					status: 'failed',
					failure_code: 'provider_round_budget_exceeded'
				})
			]
		});
		const continueWithToolResults = vi.fn(() =>
			(async function* () {
				yield {
					type: 'read_tool',
					callTransitionId: SECOND_CALL_TRANSITION_ID,
					resultTransitionId: SECOND_RESULT_TRANSITION_ID,
					providerToolCallId: 'provider-budget-read-2',
					toolName: 'fixture_task_read',
					arguments: { taskId: 'db000000-0000-4000-8000-000000000002' }
				} as const;
			})()
		);
		Object.assign(harness.provider, {
			prepare: vi.fn(async () => ({
				stream: () =>
					(async function* () {
						yield {
							type: 'read_tool',
							callTransitionId: CALL_TRANSITION_ID,
							resultTransitionId: RESULT_TRANSITION_ID,
							providerToolCallId: 'provider-budget-read-1',
							toolName: 'fixture_project_read',
							arguments: { projectId: 'da000000-0000-4000-8000-000000000001' }
						} as const;
					})(),
				continueWithToolResults,
				release: vi.fn()
			}))
		});

		try {
			await expect(harness.executor.execute(job())).resolves.toMatchObject({
				outcome: 'failed',
				terminalStatus: 'failed',
				queueReconciled: true
			});
			expect(continueWithToolResults).toHaveBeenCalledTimes(1);
			expect(harness.control.recover.mock.calls[0]?.[0]).toMatchObject({
				failureClass: 'permanent',
				errorMessage: expect.stringContaining('tool-round budget')
			});
			expect(harness.control.finalize).toHaveBeenCalledWith(
				expect.objectContaining({
					status: 'failed',
					failureCode: 'provider_round_budget_exceeded'
				})
			);
		} finally {
			await harness.publisher.stop();
		}
	});

	it('writes a specific failed terminal when the tool-call budget is exceeded', async () => {
		const harness = createHarness(
			[
				{
					type: 'read_tool',
					logicalProviderRound: 1,
					callTransitionId: CALL_TRANSITION_ID,
					resultTransitionId: RESULT_TRANSITION_ID,
					providerToolCallId: 'provider-call-budget-1',
					toolName: 'fixture_project_read',
					arguments: { projectId: 'da000000-0000-4000-8000-000000000001' }
				},
				{
					type: 'read_tool',
					logicalProviderRound: 1,
					callTransitionId: SECOND_CALL_TRANSITION_ID,
					resultTransitionId: SECOND_RESULT_TRANSITION_ID,
					providerToolCallId: 'provider-call-budget-2',
					toolName: 'fixture_task_read',
					arguments: { taskId: 'db000000-0000-4000-8000-000000000002' }
				}
			],
			{
				maxToolCalls: 1,
				recovery: [
					recoveryReceipt('finalize_failed', { failure_code: 'permanent' }),
					recoveryReceipt('queue_reconciled', {
						status: 'failed',
						failure_code: 'provider_tool_call_budget_exceeded'
					})
				]
			}
		);

		try {
			await expect(harness.executor.execute(job())).resolves.toMatchObject({
				outcome: 'failed',
				terminalStatus: 'failed',
				queueReconciled: true
			});
			expect(harness.readTool.execute).toHaveBeenCalledTimes(1);
			expect(harness.control.finalize).toHaveBeenCalledWith(
				expect.objectContaining({
					status: 'failed',
					failureCode: 'provider_tool_call_budget_exceeded'
				})
			);
		} finally {
			await harness.publisher.stop();
		}
	});

	it('routes a mutating tool through the effect-boundary port and persists its receipt', async () => {
		const harness = createHarness([
			{
				type: 'mutating_tool',
				logicalProviderRound: 1,
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
		expect(harness.toolExecutions.persistMutation).toHaveBeenCalledWith(
			expect.objectContaining({
				turnRunId: TURN_RUN_ID,
				effectId: EFFECT_ID,
				canonicalArgumentHash: 'a'.repeat(64),
				sequenceIndex: 1,
				providerToolCallId: 'provider-mutation-call-1',
				toolName: 'fixture_project_write',
				operationName: 'update_project',
				arguments: { projectId: 'project-1', name: 'Updated' }
			}),
			expect.any(AbortSignal)
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
		expect(harness.log.indexOf('mutation_ledger')).toBeLessThan(
			harness.log.indexOf('semantic:tool_result:')
		);
		await harness.publisher.stop();
	});

	it('publishes a durable mutation context shift after its durable tool result', async () => {
		const harness = createHarness([
			{
				type: 'mutating_tool',
				logicalProviderRound: 1,
				callTransitionId: CALL_TRANSITION_ID,
				resultTransitionId: RESULT_TRANSITION_ID,
				logicalOperationId: LOGICAL_OPERATION_ID,
				providerToolCallId: 'provider-mutation-context-shift',
				toolName: 'move_onto_task',
				operationName: 'onto.task.move',
				arguments: {
					task_id: 'task-1',
					expected_source_project_id: 'project-1',
					destination_project_id: SHIFT_PROJECT_ID
				},
				downstreamIdempotencySupported: false
			},
			{ type: 'finish', finishedReason: 'stop', usage: null }
		]);
		harness.mutation.execute.mockResolvedValueOnce({
			effectId: EFFECT_ID,
			canonicalArgumentHash: 'a'.repeat(64),
			downstreamIdempotencyKey: `chat-effect:${EFFECT_ID}`,
			downstreamReceipt: {
				status: 'moved',
				context_shift: {
					new_context: 'project',
					entity_id: SHIFT_PROJECT_ID,
					entity_name: 'Destination',
					entity_type: 'project',
					message: 'Task moved successfully. Context switched to Destination.'
				}
			},
			replayed: false
		});

		try {
			await expect(harness.executor.execute(job())).resolves.toMatchObject({
				outcome: 'completed',
				terminalStatus: 'completed'
			});

			const publicTypes = streamBroadcastMessages(harness.broadcastMessages).map(
				(message) => (message.payload as Record<string, unknown>).type
			);
			const toolResultIndex = publicTypes.indexOf('tool_result');
			const contextShiftIndex = publicTypes.indexOf('context_shift');
			expect(toolResultIndex).toBeGreaterThan(-1);
			expect(contextShiftIndex).toBeGreaterThan(toolResultIndex);
			expect(harness.log.indexOf('mutation_ledger')).toBeLessThan(
				harness.log.indexOf('semantic:tool_result:')
			);
			expect(harness.sessionHandoff.persist).toHaveBeenCalledWith(
				{
					turnRunId: TURN_RUN_ID,
					queueJobId: QUEUE_JOB_ID,
					processingToken: PROCESSING_TOKEN,
					userId: USER_ID,
					sessionId: SESSION_ID,
					executionGeneration: 1,
					contextType: 'project',
					entityId: SHIFT_PROJECT_ID,
					projectId: SHIFT_PROJECT_ID
				},
				expect.any(AbortSignal)
			);
			expect(harness.log.indexOf('mutation_ledger')).toBeLessThan(
				harness.log.indexOf('session_handoff')
			);
			expect(harness.log.indexOf('session_handoff')).toBeLessThan(
				harness.log.indexOf('semantic:context_shift:')
			);
			expect(
				harness.semanticInputs.find(
					(input) =>
						(input.event_payload as Record<string, unknown>)?.type === 'context_shift'
				)?.event_payload
			).toEqual({
				type: 'context_shift',
				context_shift: {
					new_context: 'project',
					entity_id: SHIFT_PROJECT_ID,
					entity_name: 'Destination',
					entity_type: 'project',
					message: 'Task moved successfully. Context switched to Destination.'
				}
			});
			expect(harness.control.finalize).toHaveBeenCalledWith(
				expect.objectContaining({
					assistantText: 'I completed the requested change.',
					lastTurnContext: expect.objectContaining({
						context_type: 'project',
						summary: 'I completed the requested change.',
						data_accessed: expect.arrayContaining(['move_onto_task', 'context_shift'])
					})
				})
			);
		} finally {
			await harness.publisher.stop();
		}
	});

	it('persists a committed mutation receipt before honoring post-begin cancellation', async () => {
		const harness = createHarness(
			[
				{
					type: 'mutating_tool',
					logicalProviderRound: 1,
					callTransitionId: CALL_TRANSITION_ID,
					resultTransitionId: RESULT_TRANSITION_ID,
					logicalOperationId: LOGICAL_OPERATION_ID,
					providerToolCallId: 'provider-mutation-call-cancelled',
					toolName: 'fixture_project_write',
					operationName: 'update_project',
					arguments: { projectId: 'project-1', name: 'Updated' },
					downstreamIdempotencySupported: true
				},
				{ type: 'finish', finishedReason: 'stop', usage: null }
			],
			{
				recovery: [
					recoveryReceipt('finalize_cancelled'),
					recoveryReceipt('queue_reconciled', {
						status: 'cancelled',
						failure_code: 'cancelled'
					})
				]
			}
		);
		harness.mutation.execute.mockImplementationOnce(async () => {
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
			return {
				effectId: EFFECT_ID,
				canonicalArgumentHash: 'a'.repeat(64),
				downstreamIdempotencyKey: `chat-effect:${EFFECT_ID}`,
				downstreamReceipt: { mutationId: 'fixture-mutation-1' },
				replayed: false
			};
		});

		await expect(harness.executor.execute(job())).resolves.toMatchObject({
			outcome: 'cancelled',
			terminalStatus: 'cancelled'
		});
		expect(harness.toolExecutions.persistMutation).toHaveBeenCalledOnce();
		expect(
			harness.semanticInputs.some(
				(input) => (input.event_payload as Record<string, unknown>)?.type === 'tool_result'
			)
		).toBe(false);
		expect(harness.control.recover).toHaveBeenCalledWith(
			expect.objectContaining({ failureClass: 'cancelled' })
		);
		await harness.publisher.stop();
	});

	it('stops at effect reconciliation when a non-queryable mutation outcome is uncertain', async () => {
		const harness = createHarness(
			[
				{
					type: 'mutating_tool',
					logicalProviderRound: 1,
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
		const processingJob = job();

		await expect(harness.executor.execute(processingJob)).resolves.toMatchObject({
			outcome: 'effect_reconciliation_required',
			terminalStatus: null,
			queueReconciled: false
		});
		expect(harness.control.recover).toHaveBeenCalledWith(
			expect.objectContaining({ failureClass: 'uncertain_external_commit' })
		);
		expect(harness.control.finalize).not.toHaveBeenCalled();
		expect(typedExecutionFailureLog(processingJob)).toMatchObject({
			failure_class: 'uncertain_external_commit',
			retry_classification: 'uncertain_external_commit',
			execution_started: true
		});
		await harness.publisher.stop();
	});

	it('requeues a transient immutable-input load failure before provider start', async () => {
		const harness = createHarness([], {
			recovery: [recoveryReceipt('retry_scheduled')]
		});
		harness.input.load.mockRejectedValueOnce(
			new AgenticChatExecutionInputError('database_error', 'temporary database error')
		);
		const processingJob = job();

		await expect(harness.executor.execute(processingJob)).resolves.toMatchObject({
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
		expect(typedExecutionFailureLog(processingJob)).toMatchObject({
			execution_error_code: 'database_error',
			failure_class: 'transient_infra',
			retry_classification: 'transient_safe',
			execution_started: false
		});
		await harness.publisher.stop();
	});

	it('classifies a queue timeout before provider authority as the one safe timeout retry', async () => {
		const harness = createHarness([], {
			recovery: [recoveryReceipt('retry_scheduled', { failure_code: 'timeout_pre_start' })]
		});
		const timeout = new AbortController();
		timeout.abort(new Error('Queue processing deadline exceeded'));
		const processingJob = job(timeout.signal);

		await expect(harness.executor.execute(processingJob)).resolves.toMatchObject({
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
		expect(typedExecutionFailureLog(processingJob)).toMatchObject({
			failure_class: 'timeout_pre_start',
			retry_classification: 'safe_before_start',
			execution_started: false
		});
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
			signal: expect.any(AbortSignal),
			budget: { deadlineAtMs: expect.any(Number) }
		});
		expect(harness.provider.stream).not.toHaveBeenCalled();
		expect(release).toHaveBeenCalledOnce();
		await harness.publisher.stop();
	});

	it('hands the provider a wall-clock budget deadline derived from the executor budget', async () => {
		const providerBudgetMs = 45_000;
		const harness = createHarness([{ type: 'finish', finishedReason: 'stop', usage: null }], {
			providerBudgetMs
		});
		const prepare = vi.fn(async () => ({
			stream: () =>
				(async function* () {
					yield { type: 'finish', finishedReason: 'stop', usage: null } as const;
				})(),
			release: vi.fn()
		}));
		Object.assign(harness.provider, { prepare });
		const startedAt = Date.now();

		await expect(harness.executor.execute(job())).resolves.toMatchObject({
			outcome: 'completed'
		});
		const prepareInput = prepare.mock.calls[0]?.[0] as { budget?: { deadlineAtMs: number } };
		const deadlineAtMs = prepareInput.budget?.deadlineAtMs;
		if (typeof deadlineAtMs !== 'number') throw new Error('Prepare received no budget');
		// The pre-start estimate can only be earlier than the armed deadline.
		expect(deadlineAtMs).toBeGreaterThanOrEqual(startedAt + providerBudgetMs);
		expect(deadlineAtMs).toBeLessThanOrEqual(Date.now() + providerBudgetMs);
		await harness.publisher.stop();
	});

	it('passes the budget deadline to the legacy fixture stream port', async () => {
		const harness = createHarness([{ type: 'finish', finishedReason: 'stop', usage: null }]);
		await expect(harness.executor.execute(job())).resolves.toMatchObject({
			outcome: 'completed'
		});
		expect(harness.provider.stream).toHaveBeenCalledWith(
			expect.objectContaining({ budget: { deadlineAtMs: expect.any(Number) } })
		);
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
		expect(streamBroadcastMessages(harness.broadcastMessages)).toHaveLength(0);
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
		expect(streamBroadcastMessages(harness.broadcastMessages)).toHaveLength(1);
		expect(streamBroadcastMessages(harness.broadcastMessages)[0]?.payload).toMatchObject({
			type: 'done',
			status: 'cancelled'
		});
		expect(harness.control.recover.mock.calls[0]?.[0]).toMatchObject({
			failureClass: 'cancelled'
		});
		expect(harness.consumptionBilling.evaluate).not.toHaveBeenCalled();
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
		expect(harness.consumptionBilling.evaluate).toHaveBeenCalledOnce();
		expect(harness.consumptionBilling.evaluate).toHaveBeenCalledWith(USER_ID);
		expect(providerContinuedAfterAbort).toBe(true);
		expect(harness.control.finalize.mock.calls[0]?.[0]).not.toMatchObject({
			assistantText: expect.stringContaining('must-not-persist')
		});
		expect(
			streamBroadcastMessages(harness.broadcastMessages).some((message) =>
				JSON.stringify(message).includes('must-not-persist')
			)
		).toBe(false);
		await harness.publisher.stop();
	});

	it('finalizes durable partial text and metadata on a partial cancellation', async () => {
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
			expect(
				(
					streamBroadcastMessages(harness.broadcastMessages)[5]?.payload as Record<
						string,
						unknown
					>
				).timing
			).toMatchObject({
				timing_contract_version: 'agentic_chat_async_v1',
				done_emitted_at: null,
				finished_reason: 'cancelled'
			});
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
						'Provider stream failed after a partial response',
						{
							kind: 'rejected_tool_name',
							rejectedToolName: 'move_document_in_treemove_document_in_tree',
							rejectedToolNameLength: 42,
							advertisedToolCount: 54,
							repeatedAdvertisedToolName: 'move_document_in_tree',
							repeatedToolNameCount: 2
						}
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
		const processingJob = job();

		try {
			await expect(harness.executor.execute(processingJob)).resolves.toMatchObject({
				outcome: 'failed',
				terminalStatus: 'failed',
				queueReconciled: true
			});
			const executionFailureLog = typedExecutionFailureLog(processingJob);
			expect(executionFailureLog).toEqual({
				event: 'agentic_chat_typed_execution_failure',
				turn_run_id: TURN_RUN_ID,
				queue_job_id: QUEUE_JOB_ID,
				execution_generation: EXECUTION_GENERATION,
				execution_error_code: 'provider_stream_failed',
				failure_class: 'permanent',
				retry_classification: 'permanent',
				execution_started: true,
				rejected_provider_tool_name: 'move_document_in_treemove_document_in_tree',
				rejected_provider_tool_name_length: 42,
				advertised_tool_count: 54,
				repeated_advertised_tool_name: 'move_document_in_tree',
				repeated_tool_name_count: 2
			});
			const terminalInput = harness.control.finalize.mock.calls[0]?.[0];
			if (!terminalInput) throw new Error('Provider-error worker fixture did not finalize');
			expect(terminalInput.failureCode).toBe('provider_stream_failed');
			const workerEventTypes = normalizedBroadcastEventTypes(harness.broadcastMessages);
			expect(workerEventTypes).toEqual([
				'turn_phase',
				'session',
				'context_usage',
				'assistant_text',
				'error',
				'timing',
				'done'
			]);
			expect(terminalInput.assistantMessageId).toBeNull();
			expect(harness.promptSnapshots.persist.mock.calls.length).toBe(1);
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
			],
			promptSnapshot: fixturePromptSnapshot
		});
		const timeout = new AbortController();
		Object.assign(harness.provider, {
			prepare: vi.fn(async () => ({
				promptSnapshot: fixturePromptSnapshot,
				stream: () =>
					(async function* () {
						timeout.abort(new Error('Provider execution deadline exceeded'));
						yield { type: 'finish', finishedReason: 'stop', usage: null } as const;
					})(),
				release: vi.fn()
			}))
		});
		const fixtureExecutionInput = {
			...executionInput,
			requestPayload: {
				...executionInput.requestPayload,
				message: AGENTIC_CHAT_TIMEOUT_FIXTURE_V1.request.message,
				context: { type: AGENTIC_CHAT_TIMEOUT_FIXTURE_V1.request.contextType }
			}
		};
		harness.input.load.mockResolvedValueOnce(fixtureExecutionInput);

		try {
			await expect(harness.executor.execute(job(timeout.signal))).resolves.toMatchObject({
				outcome: 'failed',
				terminalStatus: 'failed',
				queueReconciled: true
			});
			const terminalInput = harness.control.finalize.mock.calls[0]?.[0];
			if (!terminalInput) throw new Error('Timeout worker fixture did not finalize');
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
				streamBroadcastMessages(harness.broadcastMessages).map(
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
				streamBroadcastMessages(harness.broadcastMessages).map(
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
			streamBroadcastMessages(harness.broadcastMessages).some(
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

	it('discloses partial contract fulfilment and finalizes mutation_unfulfilled after successful moves', async () => {
		const harness = createHarness([]);
		const emittedText = 'Moved Task A and Task B into Backlog.';
		installMoveContractFixture(
			harness,
			MOVE_TASK_IDS,
			[MOVE_TASK_IDS[0]!, MOVE_TASK_IDS[1]!],
			[
				{ type: 'text_delta', text: emittedText },
				{ type: 'finish', finishedReason: 'stop', usage: null }
			]
		);

		try {
			await expect(harness.executor.execute(job())).resolves.toMatchObject({
				outcome: 'completed',
				terminalStatus: 'completed'
			});
			expect(harness.control.finalize).toHaveBeenCalledOnce();
			const terminalInput = harness.control.finalize.mock.calls[0]?.[0];
			if (!terminalInput) throw new Error('Partial move fixture did not finalize');
			expect(terminalInput).toMatchObject({
				status: 'completed',
				finishedReason: 'mutation_unfulfilled',
				failureCode: null,
				assistantMetadata: expect.objectContaining({ outcome_status: 'unfulfilled' }),
				eventPayload: expect.objectContaining({
					type: 'done',
					status: 'completed',
					finished_reason: 'mutation_unfulfilled'
				})
			});
			expect(terminalInput.assistantText.startsWith(`${emittedText}\n\n`)).toBe(true);
			expect(terminalInput.assistantText).toContain('Done: 2 of 6 moves.');
			expect(terminalInput.assistantText).toContain(
				'Not yet moved: Task C, Task D, Task E, Task F.'
			);
			// Mutation rows now carry the adapter wall time like read rows do.
			expect(harness.toolExecutions.persistMutation).toHaveBeenCalledTimes(2);
			for (const [input] of harness.toolExecutions.persistMutation.mock.calls) {
				expect(input).toMatchObject({ executionTimeMs: expect.any(Number) });
			}
		} finally {
			await harness.publisher.stop();
		}
	});

	it('leaves a fully fulfilled contract answer untouched', async () => {
		const harness = createHarness([]);
		const targets = [MOVE_TASK_IDS[0]!, MOVE_TASK_IDS[1]!];
		installMoveContractFixture(harness, targets, targets, [
			{ type: 'text_delta', text: 'Moved both tasks into Backlog.' },
			{ type: 'finish', finishedReason: 'stop', usage: null }
		]);

		try {
			await expect(harness.executor.execute(job())).resolves.toMatchObject({
				outcome: 'completed',
				terminalStatus: 'completed'
			});
			expect(harness.control.finalize).toHaveBeenCalledWith(
				expect.objectContaining({
					status: 'completed',
					finishedReason: 'stop',
					assistantText: 'Moved both tasks into Backlog.',
					assistantMetadata: expect.objectContaining({ outcome_status: 'fulfilled' })
				})
			);
		} finally {
			await harness.publisher.stop();
		}
	});

	it('completes with the partial disclosure when the provider budget expires after a durable write', async () => {
		const harness = createHarness([], { providerBudgetMs: 40 });
		const targets = [MOVE_TASK_IDS[0]!, MOVE_TASK_IDS[1]!];
		// Round 2 never yields: the executor budget is the only thing that ends it.
		installMoveContractFixture(harness, targets, [targets[0]!], null);
		const processingJob = job();

		try {
			await expect(harness.executor.execute(processingJob)).resolves.toMatchObject({
				outcome: 'completed',
				terminalStatus: 'completed',
				queueReconciled: true
			});
			expect(harness.control.recover).not.toHaveBeenCalled();
			expect(harness.control.completeQueueJob).toHaveBeenCalledOnce();
			const terminalInput = harness.control.finalize.mock.calls[0]?.[0];
			if (!terminalInput) throw new Error('Budget fixture did not finalize');
			expect(terminalInput).toMatchObject({
				status: 'completed',
				finishedReason: 'mutation_unfulfilled',
				failureCode: null,
				publicError: null,
				assistantMetadata: expect.objectContaining({ outcome_status: 'unfulfilled' }),
				eventPayload: {
					type: 'done',
					status: 'completed',
					finished_reason: 'mutation_unfulfilled',
					failure_code: null,
					completion_status: 'completed',
					answer_source: 'model'
				},
				timingDraft: expect.objectContaining({ finished_reason: 'mutation_unfulfilled' })
			});
			expect(terminalInput.assistantText).toContain('Done: 1 of 2 moves.');
			expect(terminalInput.assistantText).toContain('Not yet moved: Task B.');
			expect(typedExecutionFailureLog(processingJob)).toMatchObject({
				failure_class: 'timeout_post_start',
				execution_started: true
			});
		} finally {
			await harness.publisher.stop();
		}
	});

	it('rejects a repeat call of a tool whose earlier failure was a backend contract mismatch', async () => {
		const harness = createHarness([]);
		harness.mutation.execute.mockRejectedValueOnce(
			new AgenticChatEffectExecutionError(
				'permanent',
				EFFECT_ID,
				'Background delegation is unavailable: the server-side dispatch function does not match this worker. The arguments were valid and retrying with different arguments will not help.'
			)
		);
		const rounds: AgenticChatProviderToolRoundInputV1[] = [];
		const continueWithToolResults = vi.fn((input: AgenticChatProviderToolRoundInputV1) => {
			rounds.push(input);
			return (async function* () {
				if (input.round === 2) {
					yield {
						type: 'mutating_tool',
						callTransitionId: SECOND_CALL_TRANSITION_ID,
						resultTransitionId: SECOND_RESULT_TRANSITION_ID,
						logicalOperationId: SECOND_LOGICAL_OPERATION_ID,
						providerToolCallId: 'provider-delegate-retry',
						toolName: 'delegate_task',
						operationName: 'agent.run.dispatch',
						arguments: { task_id: 'db000000-0000-4000-8000-000000000003' },
						downstreamIdempotencySupported: false
					} as const;
					return;
				}
				yield { type: 'text_delta', text: 'Delegation is unavailable right now.' } as const;
				yield { type: 'finish', finishedReason: 'stop', usage: null } as const;
			})();
		});
		Object.assign(harness.provider, {
			prepare: vi.fn(async () => ({
				stream: () =>
					(async function* () {
						yield {
							type: 'mutating_tool',
							callTransitionId: CALL_TRANSITION_ID,
							resultTransitionId: RESULT_TRANSITION_ID,
							logicalOperationId: LOGICAL_OPERATION_ID,
							providerToolCallId: 'provider-delegate-first',
							toolName: 'delegate_task',
							operationName: 'agent.run.dispatch',
							arguments: { task_id: 'db000000-0000-4000-8000-000000000002' },
							downstreamIdempotencySupported: false
						} as const;
					})(),
				continueWithToolResults,
				invalidateReadMemo: vi.fn(),
				release: vi.fn()
			}))
		});

		try {
			await expect(harness.executor.execute(job())).resolves.toMatchObject({
				outcome: 'completed',
				terminalStatus: 'completed'
			});
			// The adapter ran once; the retry was answered structurally.
			expect(harness.mutation.execute).toHaveBeenCalledOnce();
			expect(harness.toolExecutions.persistFailure).toHaveBeenCalledTimes(2);
			expect(harness.toolExecutions.persistFailure.mock.calls[1]?.[0]).toMatchObject({
				providerToolCallId: 'provider-delegate-retry',
				toolName: 'delegate_task',
				failureKind: 'mutation',
				error: expect.stringContaining(
					'delegate_task already failed permanently this turn; do not retry it.'
				)
			});
			expect(rounds[1]?.results).toEqual([
				expect.objectContaining({
					providerToolCallId: 'provider-delegate-retry',
					failure: expect.objectContaining({
						kind: 'known_execution_failure',
						error: expect.stringContaining('already failed permanently this turn')
					})
				})
			]);
			expect(harness.semanticInputs).toEqual(
				expect.arrayContaining([
					expect.objectContaining({
						event_type: 'tool_result',
						event_payload: expect.objectContaining({
							result: expect.objectContaining({
								tool_call_id: 'provider-delegate-retry',
								success: false,
								effect_id: null
							})
						})
					})
				])
			);
		} finally {
			await harness.publisher.stop();
		}
	});

	it('caps only the identical retry after an argument-level permanent failure', async () => {
		const harness = createHarness([]);
		harness.mutation.execute.mockRejectedValueOnce(
			new AgenticChatEffectExecutionError('permanent', EFFECT_ID, 'Task not found')
		);
		const missingArguments = {
			task_id: 'db000000-0000-4000-8000-000000000002',
			state_key: 'done'
		};
		const otherArguments = {
			task_id: 'db000000-0000-4000-8000-000000000003',
			state_key: 'done'
		};
		const rounds: AgenticChatProviderToolRoundInputV1[] = [];
		const continueWithToolResults = vi.fn((input: AgenticChatProviderToolRoundInputV1) => {
			rounds.push(input);
			return (async function* () {
				if (input.round === 2) {
					yield {
						type: 'mutating_tool',
						callTransitionId: SECOND_CALL_TRANSITION_ID,
						resultTransitionId: SECOND_RESULT_TRANSITION_ID,
						logicalOperationId: SECOND_LOGICAL_OPERATION_ID,
						providerToolCallId: 'provider-identical-retry',
						toolName: 'update_onto_task',
						operationName: 'onto.task.update',
						arguments: { state_key: 'done', task_id: missingArguments.task_id },
						downstreamIdempotencySupported: false
					} as const;
					yield {
						type: 'mutating_tool',
						callTransitionId: THIRD_CALL_TRANSITION_ID,
						resultTransitionId: THIRD_RESULT_TRANSITION_ID,
						logicalOperationId: THIRD_LOGICAL_OPERATION_ID,
						providerToolCallId: 'provider-other-target',
						toolName: 'update_onto_task',
						operationName: 'onto.task.update',
						arguments: otherArguments,
						downstreamIdempotencySupported: false
					} as const;
					return;
				}
				yield { type: 'text_delta', text: 'Marked the second task done.' } as const;
				yield { type: 'finish', finishedReason: 'stop', usage: null } as const;
			})();
		});
		Object.assign(harness.provider, {
			prepare: vi.fn(async () => ({
				stream: () =>
					(async function* () {
						yield {
							type: 'mutating_tool',
							callTransitionId: CALL_TRANSITION_ID,
							resultTransitionId: RESULT_TRANSITION_ID,
							logicalOperationId: LOGICAL_OPERATION_ID,
							providerToolCallId: 'provider-missing-target',
							toolName: 'update_onto_task',
							operationName: 'onto.task.update',
							arguments: missingArguments,
							downstreamIdempotencySupported: false
						} as const;
					})(),
				continueWithToolResults,
				invalidateReadMemo: vi.fn(),
				release: vi.fn()
			}))
		});

		try {
			await expect(harness.executor.execute(job())).resolves.toMatchObject({
				outcome: 'completed',
				terminalStatus: 'completed'
			});
			// First call failed, identical retry was capped, the other target ran.
			expect(harness.mutation.execute).toHaveBeenCalledTimes(2);
			expect(harness.toolExecutions.persistMutation).toHaveBeenCalledOnce();
			expect(harness.toolExecutions.persistFailure).toHaveBeenCalledTimes(2);
			expect(harness.toolExecutions.persistFailure.mock.calls[1]?.[0]).toMatchObject({
				providerToolCallId: 'provider-identical-retry',
				error: expect.stringContaining('already called with these exact arguments')
			});
			expect(rounds[1]?.results.map((result) => result.providerToolCallId)).toEqual([
				'provider-identical-retry',
				'provider-other-target'
			]);
			expect(rounds[1]?.results[1]).toMatchObject({
				mutation: expect.objectContaining({ operationName: 'onto.task.update' })
			});
		} finally {
			await harness.publisher.stop();
		}
	});
});

const SECOND_LOGICAL_OPERATION_ID = 'c1000000-0000-4000-8000-00000000001c';
const THIRD_LOGICAL_OPERATION_ID = 'c2000000-0000-4000-8000-00000000002c';
const SECOND_EFFECT_ID = 'd1000000-0000-5000-8000-00000000001d';
const MOVE_TASK_IDS = [
	'aa000000-0000-4000-8000-000000000001',
	'aa000000-0000-4000-8000-000000000002',
	'aa000000-0000-4000-8000-000000000003',
	'aa000000-0000-4000-8000-000000000004',
	'aa000000-0000-4000-8000-000000000005',
	'aa000000-0000-4000-8000-000000000006'
];
const MOVE_TASK_TITLES = ['Task A', 'Task B', 'Task C', 'Task D', 'Task E', 'Task F'];
const MOVE_DESTINATION_PROJECT_ID = 'bb000000-0000-4000-8000-000000000001';
const MOVE_STEP_TRANSITIONS = [
	[THIRD_CALL_TRANSITION_ID, THIRD_RESULT_TRANSITION_ID, LOGICAL_OPERATION_ID, EFFECT_ID],
	[
		VALIDATION_CALL_TRANSITION_ID,
		VALIDATION_RESULT_TRANSITION_ID,
		SECOND_LOGICAL_OPERATION_ID,
		SECOND_EFFECT_ID
	]
] as const;

/**
 * Round 1: declare a move contract over `declaredTargetIds`, list the tasks
 * (so titles are durable evidence), and move `movedTargetIds`. Round 2 yields
 * `roundTwoSteps`, or hangs forever when null so only the budget can end it.
 */
function installMoveContractFixture(
	harness: ReturnType<typeof createHarness>,
	declaredTargetIds: string[],
	movedTargetIds: string[],
	roundTwoSteps: AgenticChatTurnProviderStepV1[] | null
): void {
	harness.readTool.execute.mockImplementation(async (input) => {
		if (input.providerToolCallId === 'provider-declare-moves') {
			return {
				result: {
					status: 'declared',
					contract: {
						version: 1,
						source: 'declared',
						outcomes: [
							{
								id: 'declared-1',
								action: 'move',
								entityKind: 'task',
								targetIds: declaredTargetIds,
								requiredFields: [],
								minimumSuccessfulEffects: declaredTargetIds.length
							}
						]
					}
				},
				executionTimeMs: 0,
				tokensConsumed: null,
				affectedEntities: [],
				toolCategory: 'control',
				resultCount: null,
				zeroResult: null,
				requiresUserAction: false
			};
		}
		return {
			result: {
				results: declaredTargetIds.map((id) => ({
					id,
					type: 'task',
					title: MOVE_TASK_TITLES[MOVE_TASK_IDS.indexOf(id)],
					state_key: 'todo'
				}))
			},
			executionTimeMs: 1,
			tokensConsumed: null,
			affectedEntities: [],
			toolCategory: 'read',
			resultCount: declaredTargetIds.length,
			zeroResult: false,
			requiresUserAction: false
		};
	});
	for (const taskId of movedTargetIds) {
		const effectId = MOVE_STEP_TRANSITIONS[movedTargetIds.indexOf(taskId)]![3];
		harness.mutation.execute.mockResolvedValueOnce({
			effectId,
			canonicalArgumentHash: 'a'.repeat(64),
			downstreamIdempotencyKey: `chat-effect:${effectId}`,
			downstreamReceipt: {
				status: 'moved',
				task: { id: taskId, title: MOVE_TASK_TITLES[MOVE_TASK_IDS.indexOf(taskId)] }
			},
			replayed: false
		});
	}
	Object.assign(harness.provider, {
		prepare: vi.fn(async () => ({
			stream: () =>
				(async function* () {
					yield {
						type: 'read_tool',
						callTransitionId: CALL_TRANSITION_ID,
						resultTransitionId: RESULT_TRANSITION_ID,
						providerToolCallId: 'provider-declare-moves',
						toolName: 'declare_turn_contract',
						arguments: {
							outcomes: [
								{
									action: 'move',
									entity_kind: 'task',
									target_ids: declaredTargetIds,
									minimum_successful_effects: declaredTargetIds.length
								}
							]
						}
					} as const;
					yield {
						type: 'read_tool',
						callTransitionId: SECOND_CALL_TRANSITION_ID,
						resultTransitionId: SECOND_RESULT_TRANSITION_ID,
						providerToolCallId: 'provider-list-tasks',
						toolName: 'search_project',
						arguments: { query: 'backlog' }
					} as const;
					for (const taskId of movedTargetIds) {
						const [callTransitionId, resultTransitionId, logicalOperationId] =
							MOVE_STEP_TRANSITIONS[movedTargetIds.indexOf(taskId)]!;
						yield {
							type: 'mutating_tool',
							callTransitionId,
							resultTransitionId,
							logicalOperationId,
							providerToolCallId: `provider-move-${taskId}`,
							toolName: 'move_onto_task',
							operationName: 'onto.task.move',
							arguments: {
								task_id: taskId,
								expected_source_project_id: 'project-1',
								destination_project_id: MOVE_DESTINATION_PROJECT_ID
							},
							downstreamIdempotencySupported: false
						} as const;
					}
				})(),
			continueWithToolResults: vi.fn(() =>
				(async function* () {
					if (roundTwoSteps === null) {
						await new Promise<never>(() => undefined);
						return;
					}
					for (const step of roundTwoSteps) yield step;
				})()
			),
			invalidateReadMemo: vi.fn(),
			release: vi.fn()
		}))
	});
}
