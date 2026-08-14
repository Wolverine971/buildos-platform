// apps/worker/tests/agenticChatFixtureTurnExecutor.test.ts
import {
	AGENTIC_CHAT_INPUT_ARTIFACT_VERSION,
	AGENTIC_CHAT_INPUT_ARTIFACT_VERSION_V2,
	createAgentStreamEventIdV1
} from '@buildos/shared-types';
import {
	AGENTIC_CHAT_MUTATING_TOOL_FIXTURE_V1,
	AGENTIC_CHAT_PARTIAL_CANCELLATION_FIXTURE_V1,
	AGENTIC_CHAT_PROVIDER_ERROR_FIXTURE_V1,
	AGENTIC_CHAT_PROVIDER_ERROR_GOLDEN_V1,
	AGENTIC_CHAT_READ_ONLY_TOOL_FIXTURE_V1,
	AGENTIC_CHAT_SUPERVISOR_QUESTION_FIXTURE_V1,
	AGENTIC_CHAT_TEXT_ONLY_SUCCESS_FIXTURE_V1,
	AGENTIC_CHAT_TIMEOUT_FIXTURE_V1,
	AGENTIC_CHAT_TIMEOUT_GOLDEN_V1,
	createAgenticChatWorkerParityCoverageTrackerV1,
	normalizeAgenticChatParityRunV1,
	projectAgenticChatWorkerLifecycleObservationsV1
} from '@buildos/agentic-chat-runtime';
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
	AgenticChatFixtureMutationExecutor
} from '../src/workers/agentic-chat/fixtureMutationExecutor';
import { createStableAgenticChatLifecycleTransitionIdV1 } from '../src/workers/agentic-chat/lifecycleIdentity';
import {
	AgenticChatFixtureTurnExecutor,
	type AgenticChatFixtureProviderStepV1
} from '../src/workers/agentic-chat/fixtureTurnExecutor';
import { AgenticChatProviderExecutionError } from '../src/workers/agentic-chat/providerContract';
import type {
	AgenticChatPreparedPromptSnapshotV1,
	AgenticChatProviderToolRoundInputV1
} from '../src/workers/agentic-chat/providerContract';
import { AgenticChatReadOnlyToolAdapter } from '../src/workers/agentic-chat/readOnlyTool';
import { createStableAgenticChatPromptSnapshotIdV1 } from '../src/workers/agentic-chat/promptSnapshot';
import type { AgenticChatRuntimeTimingSnapshotV1 } from '../src/workers/agentic-chat/runtimeTiming';
import { AgenticChatStreamPublisher } from '../src/workers/agentic-chat/streamPublisher';
import {
	AgenticChatSupervisorCheckpointTimeoutError,
	createStableAgenticChatSupervisorCheckpointIdV1
} from '../src/workers/agentic-chat/supervisorCheckpoint';
import { createStableAgenticChatSupervisorTransitionIdV1 } from '../src/workers/agentic-chat/workerSupervisor';
import {
	AgenticChatToolExecutionTimeoutError,
	SupabaseAgenticChatToolExecutionAdapter
} from '../src/workers/agentic-chat/toolExecution';
import { AgenticChatUpdateOntoTaskMutationAdapter } from '../src/workers/agentic-chat/updateOntoTaskMutationAdapter';

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
		maxProviderRounds?: number;
		maxToolCalls?: number;
		failSemanticType?: string;
		supervisorCheckpointError?: Error;
		researchCaptureError?: Error;
		statedFutureCaptureError?: Error;
		consumptionBillingError?: Error;
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
	const supervisorCheckpoints = {
		persist: vi.fn(async (input: { checkpointId: string }) => {
			log.push('supervisor_checkpoint');
			if (options.supervisorCheckpointError) throw options.supervisorCheckpointError;
			return {
				outcome: 'persisted' as const,
				checkpointId: input.checkpointId,
				expiresAt: '2026-08-14T12:00:00.000Z'
			};
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
			onResearchCaptureError: (error) => researchCaptureErrors.push(error),
			onStatedFutureCaptureError: (error) => statedFutureCaptureErrors.push(error),
			onConsumptionBillingError: (error) => consumptionBillingErrors.push(error),
			onTerminalControlError: (report) => terminalControlErrors.push(report),
			readTool,
			toolExecutions,
			supervisorCheckpoints,
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
			maxToolCalls: options.maxToolCalls
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
		supervisorCheckpoints,
		researchCapture,
		statedFutureCapture,
		consumptionBilling,
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

const parityCoverage = createAgenticChatWorkerParityCoverageTrackerV1();

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

	it('finalizes an appended terminal correction with the immutable streamed prefix', async () => {
		const emittedText = 'Done — I marked the task complete.';
		const harness = createHarness([
			{ type: 'text_delta', text: emittedText },
			{ type: 'finish', finishedReason: 'stop', usage: null }
		]);
		harness.input.load.mockResolvedValueOnce({
			...executionInput,
			requestPayload: {
				...executionInput.requestPayload,
				message: 'Mark the task complete.'
			}
		} as never);

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

	it('copies immutable structured turn intent and its durable outcome into terminal message metadata', async () => {
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
					outcome_status: 'unfulfilled',
					turn_intent: {
						version: 1,
						requiresWrite: true,
						action: 'create',
						entityKind: 'document',
						operations: [{ action: 'create', entityKind: 'document' }],
						source: 'current_message',
						originalRequestText: 'Create a handoff document.',
						originatingTurnRunId: null,
						clearPending: false
					}
				})
			})
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

	it('retries a rejected timing finalize once without the draft instead of abandoning the turn', async () => {
		const harness = createHarness(
			[
				{ type: 'text_delta', text: 'timed response' },
				{ type: 'finish', finishedReason: 'stop', usage: null }
			],
			{ timingClockValues: [100, 110, 120, 150, 160, 190] }
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
				timingClockValues: [100, 110, 120, 150, 160, 190],
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
		expect(harness.consumptionBilling.evaluate).not.toHaveBeenCalled();
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

	it('persists and publishes a supervisor block before returning mixed round feedback', async () => {
		const harness = createHarness([]);
		const blockedError =
			'Supervisor blocked this exact write retry because the same tool arguments already failed earlier in the turn. Use corrected arguments, the correct tool for the entity kind, or ask one concise clarifying question.';
		const blockedArguments = {
			task_id: 'da000000-0000-4000-8000-000000000001',
			state_key: 'done'
		};
		const blockedFailure = {
			kind: 'supervisor_block',
			error: blockedError,
			toolCategory: 'write',
			modelPayload: {
				error: blockedError,
				supervisor_recovery: { blocked_exact_retry: true }
			}
		} as const;
		const readArguments = {
			project_id: 'db000000-0000-4000-8000-000000000002'
		};
		const readExecution = {
			result: { project: { id: readArguments.project_id, name: 'Mixed round' } },
			executionTimeMs: 12,
			tokensConsumed: null,
			affectedEntities: [],
			toolCategory: 'utility',
			resultCount: 1,
			zeroResult: false,
			requiresUserAction: false
		};
		harness.readTool.execute.mockResolvedValueOnce(readExecution);
		harness.toolExecutions.persistFailure.mockImplementationOnce(async () => {
			harness.log.push('blocked_ledger');
		});
		harness.toolExecutions.persistRead.mockImplementationOnce(async () => {
			harness.log.push('read_ledger');
		});
		const continueWithToolResults = vi.fn((input: AgenticChatProviderToolRoundInputV1) => {
			harness.log.push('continuation');
			expect(input).toEqual({
				round: 2,
				results: [
					{
						providerToolCallId: 'blocked-update',
						toolName: 'update_onto_task',
						arguments: blockedArguments,
						failure: blockedFailure
					},
					{
						providerToolCallId: 'accepted-read',
						toolName: 'get_project_overview',
						arguments: readArguments,
						execution: readExecution
					}
				]
			});
			return (async function* () {
				yield {
					type: 'supervisor_evaluation',
					transitionId: THIRD_CALL_TRANSITION_ID,
					reason: 'mixed_round_test_flag',
					sequence: 9,
					executionGeneration: EXECUTION_GENERATION
				} as const;
				yield { type: 'text_delta', text: 'The mixed round completed safely.' } as const;
				yield { type: 'finish', finishedReason: 'stop', usage: null } as const;
			})();
		});
		Object.assign(harness.provider, {
			prepare: vi.fn(async () => ({
				promptSnapshot: fixturePromptSnapshot,
				stream: () =>
					(async function* () {
						yield {
							type: 'pre_execution_tool_failure',
							callTransitionId: VALIDATION_CALL_TRANSITION_ID,
							resultTransitionId: VALIDATION_RESULT_TRANSITION_ID,
							providerToolCallId: 'blocked-update',
							toolName: 'update_onto_task',
							arguments: blockedArguments,
							failure: blockedFailure
						} as const;
						yield {
							type: 'read_tool',
							callTransitionId: CALL_TRANSITION_ID,
							resultTransitionId: RESULT_TRANSITION_ID,
							providerToolCallId: 'accepted-read',
							toolName: 'get_project_overview',
							arguments: readArguments
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
			expect(harness.mutation.execute).not.toHaveBeenCalled();
			expect(harness.readTool.execute).toHaveBeenCalledOnce();
			expect(harness.toolExecutions.persistFailure).toHaveBeenCalledWith(
				expect.objectContaining({
					sequenceIndex: 1,
					providerToolCallId: 'blocked-update',
					toolName: 'update_onto_task',
					arguments: blockedArguments,
					toolCategory: 'write',
					error: blockedError
				}),
				expect.any(AbortSignal)
			);
			expect(harness.toolExecutions.persistRead.mock.calls[0]?.[0]).toMatchObject({
				sequenceIndex: 2,
				providerToolCallId: 'accepted-read'
			});
			const publicResultIndexes = harness.log
				.map((entry, index) => ({ entry, index }))
				.filter(({ entry }) => entry === 'semantic:tool_result:')
				.map(({ index }) => index);
			expect(publicResultIndexes).toHaveLength(2);
			expect(harness.log.indexOf('blocked_ledger')).toBeLessThan(publicResultIndexes[0]!);
			expect(harness.log.indexOf('read_ledger')).toBeLessThan(publicResultIndexes[1]!);
			expect(publicResultIndexes[1]!).toBeLessThan(harness.log.indexOf('continuation'));
			const publicResults = harness.semanticInputs
				.filter((input) => input.event_type === 'tool_result')
				.map((input) => input.event_payload as Record<string, unknown>);
			expect(publicResults[0]).toMatchObject({
				type: 'tool_result',
				result: {
					tool_call_id: 'blocked-update',
					result: null,
					success: false,
					error: blockedError,
					tool_name: 'update_onto_task'
				}
			});
			expect(harness.control.finalize.mock.calls[0]?.[0].assistantMetadata).toMatchObject({
				tool_round_count: 1,
				tool_call_count: 2
			});
			expect(
				processingJob.log.mock.calls
					.map(([message]) => JSON.parse(message) as Record<string, unknown>)
					.find(({ event }) => event === 'agentic_chat_supervisor_eval_flagged')
			).toMatchObject({
				turn_run_id: TURN_RUN_ID,
				execution_generation: EXECUTION_GENERATION,
				transition_id: THIRD_CALL_TRANSITION_ID,
				sequence: 9,
				reason: 'mixed_round_test_flag'
			});
			expect(
				harness.semanticInputs.some(
					(input) => input.event_type === 'supervisor_eval_flagged'
				)
			).toBe(false);
		} finally {
			await harness.publisher.stop();
		}
	});

	it('persists a supervisor checkpoint before publishing the waiting state and question', async () => {
		const fixture = AGENTIC_CHAT_SUPERVISOR_QUESTION_FIXTURE_V1;
		const question = fixture.response.question;
		const transitionId = createStableAgenticChatSupervisorTransitionIdV1({
			turnRunId: TURN_RUN_ID,
			executionGeneration: EXECUTION_GENERATION,
			sequence: 1,
			action: 'ask_user'
		});
		const digest = fixture.checkpoint.digest;
		const resumeContext = fixture.checkpoint.resumeContext;
		const supervisorDecision = fixture.checkpoint.supervisorDecision;
		const harness = createHarness(
			[
				{
					type: 'supervisor_question',
					transitionId,
					sequence: 1,
					executionGeneration: EXECUTION_GENERATION,
					reason: fixture.decision.reason,
					question,
					checkpoint: { digest, resumeContext, supervisorDecision },
					finishedReason: fixture.response.finishedReason,
					usage: fixture.response.usage
				}
			],
			{ promptSnapshot: fixturePromptSnapshot }
		);
		const fixtureExecutionInput = {
			...executionInput,
			requestPayload: {
				...executionInput.requestPayload,
				message: fixture.request.message,
				context: { type: fixture.request.contextType }
			}
		};
		harness.input.load.mockResolvedValueOnce(fixtureExecutionInput);

		await expect(harness.executor.execute(job())).resolves.toMatchObject({
			outcome: 'completed',
			terminalStatus: 'completed'
		});
		const checkpointId = createStableAgenticChatSupervisorCheckpointIdV1({
			turnRunId: TURN_RUN_ID,
			executionGeneration: EXECUTION_GENERATION,
			supervisorTransitionId: transitionId
		});
		expect(harness.supervisorCheckpoints.persist).toHaveBeenCalledWith(
			{
				turnRunId: TURN_RUN_ID,
				queueJobId: QUEUE_JOB_ID,
				processingToken: PROCESSING_TOKEN,
				userId: USER_ID,
				sessionId: SESSION_ID,
				executionGeneration: EXECUTION_GENERATION,
				checkpointId,
				supervisorTransitionId: transitionId,
				sequence: 1,
				reason: fixture.decision.reason,
				question,
				digest,
				resumeContext,
				supervisorDecision
			},
			expect.any(AbortSignal)
		);
		expect(harness.log.indexOf('supervisor_checkpoint')).toBeLessThan(
			harness.log.indexOf('semantic:agent_state:')
		);
		expect(harness.control.finalize).toHaveBeenCalledWith(
			expect.objectContaining({
				status: 'completed',
				finishedReason: 'supervisor_question',
				assistantText: question,
				promptTokens: 9,
				completionTokens: 3,
				totalTokens: 12,
				assistantMetadata: expect.objectContaining({
					supervisor_question_checkpoint: {
						checkpoint_id: checkpointId,
						failed: false
					}
				})
			})
		);
		const waitingEvent = harness.semanticInputs.find(
			(input) => (input.event_payload as Record<string, unknown>).state === 'waiting_on_user'
		);
		expect(waitingEvent).toEqual(
			expect.objectContaining({
				transition_id: transitionId,
				event_type: 'agent_state',
				event_payload: expect.objectContaining({
					type: 'agent_state',
					state: 'waiting_on_user',
					details: 'Waiting on your direction to continue.'
				})
			})
		);
		const publicTypes = harness.broadcastMessages.map(
			(message) => (message.payload as Record<string, unknown>).type
		);
		expect(publicTypes.indexOf('agent_state')).toBeLessThan(publicTypes.indexOf('text_delta'));
		expect(publicTypes.at(-1)).toBe('done');

		const terminalInput = harness.control.finalize.mock.calls[0]?.[0];
		const checkpointInput = harness.supervisorCheckpoints.persist.mock.calls[0]?.[0] as
			| Record<string, unknown>
			| undefined;
		if (!terminalInput || !checkpointInput) {
			throw new Error('Supervisor parity fixture did not persist its terminal state');
		}
		const supervisorCheckpointMetadata = terminalInput.assistantMetadata
			.supervisor_question_checkpoint as Record<string, unknown>;
		const worker = normalizeAgenticChatParityRunV1({
			events: harness.broadcastMessages.map((message) => message.payload) as never,
			messages: [
				{ role: 'user', content: fixtureExecutionInput.requestPayload.message },
				{
					role: 'assistant',
					content: terminalInput.assistantText,
					metadata: {
						completion_status: terminalInput.assistantMetadata.completion_status,
						answer_source: terminalInput.assistantMetadata.answer_source,
						supervisor_question_checkpoint: {
							failed: supervisorCheckpointMetadata.failed
						}
					}
				}
			],
			toolExecutions: [],
			checkpoints: [
				{
					checkpoint_type: 'supervisor_question',
					status: 'active',
					reason: checkpointInput.reason,
					question: checkpointInput.question,
					digest: checkpointInput.digest,
					resume_context: checkpointInput.resumeContext,
					supervisor_decision: checkpointInput.supervisorDecision
				}
			],
			outcome: {
				status: terminalInput.status,
				finished_reason: terminalInput.finishedReason,
				assistant_message_linked: terminalInput.assistantMessageId !== null,
				tool_round_count: terminalInput.assistantMetadata.tool_round_count,
				tool_call_count: terminalInput.assistantMetadata.tool_call_count,
				total_tokens: terminalInput.totalTokens
			},
			metadata: { checkpoint_count: harness.supervisorCheckpoints.persist.mock.calls.length }
		});
		for (const scenarioClass of ['clarification', 'supervisor_checkpoint'] as const) {
			const evaluation = parityCoverage.evaluate(scenarioClass, worker);
			expect(evaluation.diff.truncated).toBe(false);
			expect(evaluation.deliberate.length).toBeGreaterThan(0);
			expect(evaluation.contested.map(({ path, kind }) => ({ path, kind }))).toEqual(
				evaluation.expectedOpenDivergences.map(({ path, kind }) => ({ path, kind }))
			);
			expect(evaluation.matchesContract).toBe(true);
		}
		await harness.publisher.stop();
	});

	it('requeues an indeterminate checkpoint timeout without publishing a question', async () => {
		const fixture = AGENTIC_CHAT_SUPERVISOR_QUESTION_FIXTURE_V1;
		const transitionId = createStableAgenticChatSupervisorTransitionIdV1({
			turnRunId: TURN_RUN_ID,
			executionGeneration: EXECUTION_GENERATION,
			sequence: 1,
			action: 'ask_user'
		});
		const harness = createHarness(
			[
				{
					type: 'supervisor_question',
					transitionId,
					sequence: 1,
					executionGeneration: EXECUTION_GENERATION,
					reason: fixture.decision.reason,
					question: fixture.response.question,
					checkpoint: {
						digest: fixture.checkpoint.digest,
						resumeContext: fixture.checkpoint.resumeContext,
						supervisorDecision: fixture.checkpoint.supervisorDecision
					},
					finishedReason: fixture.response.finishedReason,
					usage: fixture.response.usage
				}
			],
			{
				promptSnapshot: fixturePromptSnapshot,
				supervisorCheckpointError: new AgenticChatSupervisorCheckpointTimeoutError(10),
				recovery: [recoveryReceipt('retry_scheduled')]
			}
		);

		try {
			await expect(harness.executor.execute(job())).resolves.toMatchObject({
				outcome: 'requeued',
				terminalStatus: null
			});
			expect(harness.control.recover).toHaveBeenCalledWith(
				expect.objectContaining({
					failureClass: 'transient_infra',
					errorMessage: expect.stringContaining('checkpoint exceeded its 10ms deadline')
				})
			);
			expect(harness.control.finalize).not.toHaveBeenCalled();
			expect(
				harness.broadcastMessages.some(
					(message) =>
						(message.payload as Record<string, unknown>).state === 'waiting_on_user'
				)
			).toBe(false);
			expect(
				harness.broadcastMessages.some(
					(message) => (message.payload as Record<string, unknown>).type === 'text_delta'
				)
			).toBe(false);
		} finally {
			await harness.publisher.stop();
		}
	});

	it('carries an acknowledged tool row into recovery when public result persistence fails', async () => {
		const harness = createHarness(
			[
				{
					type: 'read_tool',
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
		const readAdapter = new AgenticChatReadOnlyToolAdapter({} as never, {
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
			const evaluation = parityCoverage.evaluate('success', worker);
			expect(evaluation.diff.truncated).toBe(false);
			expect(evaluation.deliberate.length).toBeGreaterThan(0);
			expect(
				(harness.broadcastMessages[6]?.payload as Record<string, unknown>).timing
			).toMatchObject({
				timing_contract_version: 'agentic_chat_async_v1',
				done_emitted_at: null
			});
			expect(evaluation.contested.map(({ path, kind }) => ({ path, kind }))).toEqual(
				evaluation.expectedOpenDivergences.map(({ path, kind }) => ({ path, kind }))
			);
			expect(evaluation.matchesContract).toBe(true);
		} finally {
			await harness.publisher.stop();
		}
	});

	it('exposes the exact deterministic validation-repair real-tool parity gaps', async () => {
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
			const persistedToolExecutions = [
				...harness.toolExecutions.persistRead.mock.calls.map(([input], index) => ({
					order: harness.toolExecutions.persistRead.mock.invocationCallOrder[index]!,
					row: {
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
					}
				})),
				...harness.toolExecutions.persistFailure.mock.calls.map(([input], index) => ({
					order: harness.toolExecutions.persistFailure.mock.invocationCallOrder[index]!,
					row: {
						tool_name: input.toolName,
						tool_category: input.toolCategory,
						sequence_index: input.sequenceIndex,
						arguments: input.arguments,
						result: null,
						execution_time_ms: null,
						tokens_consumed: null,
						success: false,
						affected_entities: [],
						message_linked: terminalInput.assistantMessageId !== null
					}
				}))
			]
				.sort((left, right) => left.order - right.order)
				.map(({ row }) => row);
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
				toolExecutions: persistedToolExecutions,
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
				harness.broadcastMessages.map(
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
			const evaluation = parityCoverage.evaluate('read_only_tools', worker);
			expect(evaluation.diff.truncated).toBe(false);
			expect(evaluation.deliberate.length).toBeGreaterThan(0);
			expect(evaluation.contested.map(({ path, kind }) => ({ path, kind }))).toEqual(
				evaluation.expectedOpenDivergences.map(({ path, kind }) => ({ path, kind }))
			);
			expect(evaluation.matchesContract).toBe(true);
		} finally {
			await harness.publisher.stop();
		}
	});

	it('exposes only the ratified effect-receipt asymmetry for the mutating-tool golden', async () => {
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
		const mutatingTool = new AgenticChatUpdateOntoTaskMutationAdapter({} as never, {
			runGateway: runGateway as never
		});
		const mutatingToolExecute = vi.spyOn(mutatingTool, 'execute');
		const realMutation = new AgenticChatFixtureMutationExecutor({
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
						toolNames: [fixture.tool.name],
						definitions: [
							{
								type: 'function',
								function: {
									name: fixture.tool.name,
									description: 'Update a task.',
									parameters: { type: 'object' }
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
			const worker = normalizeAgenticChatParityRunV1({
				events: harness.broadcastMessages.map((message) => message.payload) as never,
				messages: [
					{ role: 'user', content: fixtureExecutionInput.requestPayload.message },
					{
						role: 'assistant',
						content: terminalInput.assistantText,
						metadata: {
							completion_status: terminalInput.assistantMetadata.completion_status,
							answer_source: terminalInput.assistantMetadata.answer_source
						}
					}
				],
				toolExecutions: [
					{
						tool_name: persistedMutation.toolName,
						tool_category: fixture.tool.toolCategory,
						gateway_op: persistedMutation.operationName,
						effect_id: persistedMutation.effectId,
						provider_tool_call_id: persistedMutation.providerToolCallId,
						sequence_index: persistedMutation.sequenceIndex,
						arguments: persistedMutation.arguments,
						result: fixture.tool.result,
						execution_time_ms: persistedMutation.executionTimeMs,
						tokens_consumed: persistedMutation.tokensConsumed,
						requires_user_action: persistedMutation.requiresUserAction,
						success: true,
						affected_entities: persistedMutation.affectedEntities,
						message_linked: terminalInput.assistantMessageId !== null
					}
				],
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
			const evaluation = parityCoverage.evaluate('mutating_tools', worker);
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
				p_affected_entities: fixture.tool.affectedEntities
			});
			expect(evaluation.diff.truncated).toBe(false);
			const effectDivergences = evaluation.deliberate
				.map(({ path }) => path)
				.filter((path) => !path.startsWith('/events/9/payload/timing/'));
			expect(effectDivergences).toEqual([
				'/events/5/payload/result/effect_id',
				'/events/5/payload/result/replayed',
				'/toolExecutions/0/effect_id'
			]);
			expect(
				evaluation.deliberate
					.map(({ path }) => path)
					.filter((path) => path.startsWith('/events/9/payload/timing/')).length
			).toBeGreaterThan(0);
			expect(evaluation.contested.map(({ path, kind }) => ({ path, kind }))).toEqual(
				evaluation.expectedOpenDivergences.map(({ path, kind }) => ({ path, kind }))
			);
			expect(evaluation.matchesContract).toBe(true);
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
					callTransitionId: CALL_TRANSITION_ID,
					resultTransitionId: RESULT_TRANSITION_ID,
					providerToolCallId: 'provider-call-budget-1',
					toolName: 'fixture_project_read',
					arguments: { projectId: 'da000000-0000-4000-8000-000000000001' }
				},
				{
					type: 'read_tool',
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

	it('keeps the Phase 3 single-read fence for providers without continueWithToolResults', async () => {
		const harness = createHarness([], {
			recovery: [
				recoveryReceipt('finalize_failed', { failure_code: 'permanent' }),
				recoveryReceipt('queue_reconciled', {
					status: 'failed',
					failure_code: 'permanent'
				})
			]
		});
		const synthesize = vi.fn();
		Object.assign(harness.provider, {
			prepare: vi.fn(async () => ({
				stream: () =>
					(async function* () {
						yield {
							type: 'read_tool',
							callTransitionId: CALL_TRANSITION_ID,
							resultTransitionId: RESULT_TRANSITION_ID,
							providerToolCallId: 'provider-phase3-read-1',
							toolName: 'fixture_project_read',
							arguments: { projectId: 'da000000-0000-4000-8000-000000000001' }
						} as const;
						yield {
							type: 'read_tool',
							callTransitionId: SECOND_CALL_TRANSITION_ID,
							resultTransitionId: SECOND_RESULT_TRANSITION_ID,
							providerToolCallId: 'provider-phase3-read-2',
							toolName: 'fixture_task_read',
							arguments: { taskId: 'db000000-0000-4000-8000-000000000002' }
						} as const;
					})(),
				synthesize,
				release: vi.fn()
			}))
		});

		try {
			await expect(harness.executor.execute(job())).resolves.toMatchObject({
				outcome: 'failed',
				terminalStatus: 'failed',
				queueReconciled: true
			});
			expect(harness.control.recover.mock.calls[0]?.[0]).toMatchObject({
				failureClass: 'permanent',
				errorMessage: expect.stringContaining('exactly one bounded read call')
			});
			expect(synthesize).not.toHaveBeenCalled();
			expect(harness.readTool.execute).toHaveBeenCalledTimes(1);
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
				callTransitionId: CALL_TRANSITION_ID,
				resultTransitionId: RESULT_TRANSITION_ID,
				logicalOperationId: LOGICAL_OPERATION_ID,
				providerToolCallId: 'provider-mutation-context-shift',
				toolName: 'move_onto_task',
				operationName: 'onto.task.move',
				arguments: {
					task_id: 'task-1',
					expected_source_project_id: 'project-1',
					destination_project_id: 'project-2'
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
					entity_id: 'project-2',
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

			const publicTypes = harness.broadcastMessages.map(
				(message) => (message.payload as Record<string, unknown>).type
			);
			const toolResultIndex = publicTypes.indexOf('tool_result');
			const contextShiftIndex = publicTypes.indexOf('context_shift');
			expect(toolResultIndex).toBeGreaterThan(-1);
			expect(contextShiftIndex).toBeGreaterThan(toolResultIndex);
			expect(harness.log.indexOf('mutation_ledger')).toBeLessThan(
				harness.log.indexOf('semantic:tool_result:')
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
					entity_id: 'project-2',
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
			const evaluation = parityCoverage.evaluate('cancellation', worker);
			expect(evaluation.diff.truncated).toBe(false);
			expect(evaluation.deliberate.length).toBeGreaterThan(0);
			expect(
				(harness.broadcastMessages[5]?.payload as Record<string, unknown>).timing
			).toMatchObject({
				timing_contract_version: 'agentic_chat_async_v1',
				done_emitted_at: null,
				finished_reason: 'cancelled'
			});
			expect(evaluation.contested.map(({ path, kind }) => ({ path, kind }))).toEqual(
				evaluation.expectedOpenDivergences.map(({ path, kind }) => ({ path, kind }))
			);
			expect(evaluation.matchesContract).toBe(true);
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
		const processingJob = job();

		try {
			await expect(harness.executor.execute(processingJob)).resolves.toMatchObject({
				outcome: 'failed',
				terminalStatus: 'failed',
				queueReconciled: true
			});
			const executionFailureLog = processingJob.log.mock.calls
				.map(([message]) => JSON.parse(message) as Record<string, unknown>)
				.find((record) => record.event === 'agentic_chat_typed_execution_failure');
			expect(executionFailureLog).toEqual({
				event: 'agentic_chat_typed_execution_failure',
				turn_run_id: TURN_RUN_ID,
				queue_job_id: QUEUE_JOB_ID,
				execution_generation: EXECUTION_GENERATION,
				execution_error_code: 'provider_stream_failed',
				failure_class: 'permanent',
				execution_started: true
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
			const evaluation = parityCoverage.evaluate('provider_error', worker);
			const workerEventTypes = worker.events.map(({ type }) => type);

			expect(evaluation.diff.truncated).toBe(false);
			expect(
				evaluation.contested.filter(({ path }) =>
					path.startsWith('/metadata/lifecycle_events/')
				)
			).toEqual([]);
			expect(evaluation.contested.map(({ path, kind }) => ({ path, kind }))).toEqual(
				evaluation.expectedOpenDivergences.map(({ path, kind }) => ({ path, kind }))
			);
			expect(evaluation.matchesContract).toBe(true);
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
				harness.broadcastMessages.map(
					(message) => (message.payload as Record<string, unknown>).type
				)
			).toEqual(['turn_phase', 'session', 'context_usage', 'error', 'timing', 'done']);
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
						promptSnapshotCount: harness.promptSnapshots.persist.mock.calls.length,
						streamTerminalFailureObserved:
							terminalInput.failureCode === 'timeout_post_start'
					}),
					prompt_snapshot_count: harness.promptSnapshots.persist.mock.calls.length
				}
			});
			const evaluation = parityCoverage.evaluate('timeout', worker);
			expect(evaluation.diff.truncated).toBe(false);
			expect(evaluation.contested.map(({ path, kind }) => ({ path, kind }))).toEqual(
				evaluation.expectedOpenDivergences.map(({ path, kind }) => ({ path, kind }))
			);
			expect(evaluation.matchesContract).toBe(true);
			expect(worker.events.map(({ type }) => type)).toEqual(
				AGENTIC_CHAT_TIMEOUT_GOLDEN_V1.events.map(({ type }) => type)
			);
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

	it('exercises every implemented parity scenario class from the shared registry', () => {
		expect(parityCoverage.missing()).toEqual([]);
	});
});
