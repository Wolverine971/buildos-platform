// apps/worker/tests/agenticChatExecutionControl.test.ts
import { createAgentStreamEventIdV1 } from '@buildos/shared-types';
import { describe, expect, it, vi } from 'vitest';
import {
	AgenticChatExecutionControlProtocolError,
	SupabaseAgenticChatExecutionControlAdapter,
	type AgenticChatExecutionRpcClient,
	type AgenticChatTerminalFinalizeInputV1
} from '../src/workers/agentic-chat/executionControl';

const USER_ID = '10000000-0000-4000-8000-000000000001';
const SESSION_ID = '20000000-0000-4000-8000-000000000002';
const TURN_RUN_ID = '30000000-0000-4000-8000-000000000003';
const QUEUE_JOB_ID = '40000000-0000-4000-8000-000000000004';
const CORRELATION_ID = '50000000-0000-4000-8000-000000000005';
const PROCESSING_TOKEN = '60000000-0000-4000-8000-000000000006';
const INPUT_ARTIFACT_ID = '70000000-0000-4000-8000-000000000007';
const USER_MESSAGE_ID = '80000000-0000-4000-8000-000000000008';
const ASSISTANT_MESSAGE_ID = '90000000-0000-4000-8000-000000000009';
const LAST_CONTEXT_TRANSITION_ID = 'a0000000-0000-5000-8000-00000000000a';
const TIMING_TRANSITION_ID = 'b0000000-0000-5000-8000-00000000000b';
const ERROR_TRANSITION_ID = 'c0000000-0000-5000-8000-00000000000c';
const EXECUTION_GENERATION = 2;
const TERMINAL_SEQUENCE = 8;

const identity = {
	turnRunId: TURN_RUN_ID,
	queueJobId: QUEUE_JOB_ID,
	processingToken: PROCESSING_TOKEN
};

function executionReceipt(overrides: Record<string, unknown> = {}) {
	return {
		turn_run_id: TURN_RUN_ID,
		queue_job_id: QUEUE_JOB_ID,
		session_id: SESSION_ID,
		user_id: USER_ID,
		correlation_id: CORRELATION_ID,
		execution_generation: EXECUTION_GENERATION,
		status: 'running',
		...overrides
	};
}

function terminalReceipt(overrides: Record<string, unknown> = {}) {
	return {
		outcome: 'finalized',
		turn_run_id: TURN_RUN_ID,
		queue_job_id: QUEUE_JOB_ID,
		session_id: SESSION_ID,
		user_id: USER_ID,
		execution_generation: EXECUTION_GENERATION,
		status: 'completed',
		finished_reason: 'stop',
		failure_code: null,
		assistant_message_id: ASSISTANT_MESSAGE_ID,
		terminal_event_id: createAgentStreamEventIdV1(
			TURN_RUN_ID,
			EXECUTION_GENERATION,
			TERMINAL_SEQUENCE
		),
		terminal_sequence_index: TERMINAL_SEQUENCE,
		terminalized_at: '2026-08-03T12:00:00.000Z',
		...overrides
	};
}

function finalizeInput(
	overrides: Partial<AgenticChatTerminalFinalizeInputV1> = {}
): AgenticChatTerminalFinalizeInputV1 {
	return {
		...identity,
		userId: USER_ID,
		executionGeneration: EXECUTION_GENERATION,
		status: 'completed',
		finishedReason: 'stop',
		failureCode: null,
		assistantMessageId: ASSISTANT_MESSAGE_ID,
		assistantText: 'Hello',
		assistantMetadata: {},
		promptTokens: 10,
		completionTokens: 5,
		totalTokens: 15,
		projection: {},
		eventPayload: { type: 'done' },
		...overrides
	};
}

function adapterFor(receipts: unknown[]) {
	const rpc = vi.fn(async () => ({ data: receipts.shift(), error: null }));
	return {
		adapter: new SupabaseAgenticChatExecutionControlAdapter({
			rpc
		} as AgenticChatExecutionRpcClient),
		rpc
	};
}

function asyncTimingDraft() {
	return {
		timing_contract_version: 'agentic_chat_async_v1',
		request_started_at: '2026-08-03T11:59:57.000Z',
		admitted_at: '2026-08-03T11:59:57.000Z',
		accepted_at: '2026-08-03T11:59:57.100Z',
		worker_started_at: '2026-08-03T11:59:57.300Z',
		provider_authorized_at: '2026-08-03T11:59:57.500Z',
		first_event_at: '2026-08-03T11:59:57.700Z',
		first_response_at: '2026-08-03T11:59:57.800Z',
		cache_source: 'fresh_load',
		cache_age_seconds: null,
		request_prewarmed_context: false,
		history_strategy: 'full',
		history_compressed: false,
		raw_history_count: 2,
		history_for_model_count: 2,
		prepared_prompt_hit: false,
		prepared_prompt_miss_reason: 'not_requested',
		prepared_surface_profile: null,
		finished_reason: 'stop',
		phases: {
			admission_to_acceptance_ms: 100,
			queue_wait_ms: 200,
			worker_start_to_provider_authority_ms: 200,
			time_to_first_event_ms: 700,
			time_to_first_response_ms: 800,
			provider_authority_to_first_event_persistence_ms: 200,
			provider_authority_to_first_response_persistence_ms: 300,
			provider_authority_to_finish_ms: 900,
			provider_finish_to_terminal_call_ms: 50,
			response_generation_ms: 600
		}
	};
}

function committedContextReceipt(
	lastTurnContext: Record<string, unknown>,
	sequence = TERMINAL_SEQUENCE - 2,
	committedAt = '2026-08-03T12:00:00.000Z'
) {
	return {
		outcome: 'persisted',
		publish_allowed: true,
		turn_run_id: TURN_RUN_ID,
		queue_job_id: QUEUE_JOB_ID,
		session_id: SESSION_ID,
		user_id: USER_ID,
		stream_run_id: 'stream-1',
		client_turn_id: 'client-1',
		execution_generation: EXECUTION_GENERATION,
		sequence_index: sequence,
		event_id: createAgentStreamEventIdV1(TURN_RUN_ID, EXECUTION_GENERATION, sequence),
		phase: 'finalize',
		event_type: 'last_turn_context',
		durable: true,
		transition_id: LAST_CONTEXT_TRANSITION_ID,
		event_payload: {
			type: 'last_turn_context',
			context: { ...lastTurnContext, timestamp: committedAt }
		},
		reconcile_required: true,
		persisted_at: '2026-08-03T12:00:00.000Z'
	};
}

function committedTimingReceipt(
	draft: ReturnType<typeof asyncTimingDraft>,
	overrides: Record<string, unknown> = {},
	committedAt = '2026-08-03T12:00:00.000Z',
	totalRequestMs = 3_000,
	assistantPersistedAt: string | null = committedAt
) {
	const sequence = TERMINAL_SEQUENCE - 1;
	return {
		outcome: 'persisted',
		publish_allowed: true,
		turn_run_id: TURN_RUN_ID,
		queue_job_id: QUEUE_JOB_ID,
		session_id: SESSION_ID,
		user_id: USER_ID,
		stream_run_id: 'stream-1',
		client_turn_id: 'client-1',
		execution_generation: EXECUTION_GENERATION,
		sequence_index: sequence,
		event_id: createAgentStreamEventIdV1(TURN_RUN_ID, EXECUTION_GENERATION, sequence),
		phase: 'finalize',
		event_type: 'timing',
		durable: true,
		transition_id: TIMING_TRANSITION_ID,
		event_payload: {
			type: 'timing',
			timing: {
				...draft,
				assistant_persisted_at: assistantPersistedAt,
				done_emitted_at: null,
				terminal_committed_at: committedAt,
				phases: { ...draft.phases, total_request_ms: totalRequestMs }
			}
		},
		reconcile_required: true,
		persisted_at: '2026-08-03T12:00:00.000Z',
		...overrides
	};
}

function committedErrorReceipt(publicError: string, sequence = TERMINAL_SEQUENCE - 2) {
	return {
		outcome: 'persisted',
		publish_allowed: true,
		turn_run_id: TURN_RUN_ID,
		queue_job_id: QUEUE_JOB_ID,
		session_id: SESSION_ID,
		user_id: USER_ID,
		stream_run_id: 'stream-1',
		client_turn_id: 'client-1',
		execution_generation: EXECUTION_GENERATION,
		sequence_index: sequence,
		event_id: createAgentStreamEventIdV1(TURN_RUN_ID, EXECUTION_GENERATION, sequence),
		phase: 'finalize',
		event_type: 'error',
		durable: true,
		transition_id: ERROR_TRANSITION_ID,
		event_payload: { type: 'error', error: publicError },
		reconcile_required: true,
		persisted_at: '2026-08-03T12:00:00.000Z'
	};
}

describe('SupabaseAgenticChatExecutionControlAdapter', () => {
	it('calls each fenced RPC with exact identities and parses authoritative receipts', async () => {
		const { adapter, rpc } = adapterFor([
			executionReceipt({
				outcome: 'claimed',
				execution_may_start: true,
				input_artifact_id: INPUT_ARTIFACT_ID,
				user_message_id: USER_MESSAGE_ID
			}),
			executionReceipt({
				outcome: 'started',
				invoke_provider: true,
				execution_started_at: '2026-08-03T11:59:59.000Z'
			}),
			executionReceipt({
				outcome: 'retry_scheduled',
				status: 'queued',
				execution_may_retry: true,
				failure_code: 'transient_infra'
			}),
			terminalReceipt(),
			true
		]);

		await expect(adapter.claim(identity)).resolves.toMatchObject({
			outcome: 'claimed',
			executionMayStart: true,
			inputArtifactId: INPUT_ARTIFACT_ID
		});
		await expect(
			adapter.begin({ ...identity, executionGeneration: EXECUTION_GENERATION })
		).resolves.toMatchObject({ outcome: 'started', invoke_provider: true });
		await expect(
			adapter.recover({
				...identity,
				executionGeneration: EXECUTION_GENERATION,
				failureClass: 'transient_infra',
				errorMessage: 'database unavailable'
			})
		).resolves.toMatchObject({ outcome: 'retry_scheduled', execution_may_retry: true });
		await expect(adapter.finalize(finalizeInput())).resolves.toMatchObject({
			outcome: 'finalized',
			terminal_sequence_index: TERMINAL_SEQUENCE
		});
		await expect(
			adapter.completeQueueJob({
				queueJobId: QUEUE_JOB_ID,
				processingToken: PROCESSING_TOKEN,
				result: { status: 'completed' }
			})
		).resolves.toBe(true);

		expect(rpc.mock.calls).toEqual([
			[
				'claim_agentic_chat_turn',
				{
					p_turn_run_id: TURN_RUN_ID,
					p_queue_job_id: QUEUE_JOB_ID,
					p_processing_token: PROCESSING_TOKEN
				}
			],
			[
				'begin_agentic_chat_turn_execution',
				{
					p_turn_run_id: TURN_RUN_ID,
					p_queue_job_id: QUEUE_JOB_ID,
					p_processing_token: PROCESSING_TOKEN,
					p_execution_generation: EXECUTION_GENERATION
				}
			],
			[
				'recover_agentic_chat_turn',
				{
					p_turn_run_id: TURN_RUN_ID,
					p_queue_job_id: QUEUE_JOB_ID,
					p_processing_token: PROCESSING_TOKEN,
					p_execution_generation: EXECUTION_GENERATION,
					p_failure_class: 'transient_infra',
					p_error_message: 'database unavailable'
				}
			],
			[
				'finalize_agentic_chat_turn',
				expect.objectContaining({
					p_turn_run_id: TURN_RUN_ID,
					p_queue_job_id: QUEUE_JOB_ID,
					p_processing_token: PROCESSING_TOKEN,
					p_status: 'completed'
				})
			],
			[
				'complete_queue_job',
				{
					p_job_id: QUEUE_JOB_ID,
					p_processing_token: PROCESSING_TOKEN,
					p_result: { status: 'completed' }
				}
			]
		]);
	});

	it('rejects a forged claim authority receipt', async () => {
		const { adapter } = adapterFor([
			executionReceipt({
				outcome: 'claimed',
				execution_may_start: false,
				input_artifact_id: INPUT_ARTIFACT_ID,
				user_message_id: USER_MESSAGE_ID
			})
		]);

		await expect(adapter.claim(identity)).rejects.toBeInstanceOf(
			AgenticChatExecutionControlProtocolError
		);
	});

	it('selects the atomic completion RPC and verifies the preterminal receipt', async () => {
		const lastTurnContext = {
			summary: 'Completed the request.',
			entities: {},
			context_type: 'global',
			data_accessed: []
		};
		const preterminalEvent = {
			outcome: 'persisted',
			publish_allowed: true,
			turn_run_id: TURN_RUN_ID,
			queue_job_id: QUEUE_JOB_ID,
			session_id: SESSION_ID,
			user_id: USER_ID,
			stream_run_id: 'stream-1',
			client_turn_id: 'client-1',
			execution_generation: EXECUTION_GENERATION,
			sequence_index: TERMINAL_SEQUENCE - 1,
			event_id: createAgentStreamEventIdV1(
				TURN_RUN_ID,
				EXECUTION_GENERATION,
				TERMINAL_SEQUENCE - 1
			),
			phase: 'finalize',
			event_type: 'last_turn_context',
			durable: true,
			transition_id: LAST_CONTEXT_TRANSITION_ID,
			event_payload: {
				type: 'last_turn_context',
				context: { ...lastTurnContext, timestamp: '2026-08-03T12:00:00.000Z' }
			},
			reconcile_required: true,
			persisted_at: '2026-08-03T12:00:00.010Z'
		};
		const { adapter, rpc } = adapterFor([
			terminalReceipt({ preterminal_event: preterminalEvent })
		]);

		await expect(
			adapter.finalize(
				finalizeInput({
					lastTurnContext,
					lastTurnContextTransitionId: LAST_CONTEXT_TRANSITION_ID
				})
			)
		).resolves.toMatchObject({
			outcome: 'finalized',
			preterminal_event: { event_type: 'last_turn_context' }
		});
		expect(rpc).toHaveBeenCalledWith(
			'finalize_agentic_chat_turn_with_last_context',
			expect.objectContaining({
				p_last_turn_context: lastTurnContext,
				p_last_turn_context_transition_id: LAST_CONTEXT_TRANSITION_ID
			})
		);
	});

	it('rejects atomic completion without its committed preterminal receipt', async () => {
		const { adapter } = adapterFor([terminalReceipt()]);
		await expect(
			adapter.finalize(
				finalizeInput({
					lastTurnContext: {
						summary: 'Completed the request.',
						entities: {},
						context_type: 'global',
						data_accessed: []
					},
					lastTurnContextTransitionId: LAST_CONTEXT_TRANSITION_ID
				})
			)
		).rejects.toBeInstanceOf(AgenticChatExecutionControlProtocolError);
	});

	it('selects the three-event terminal RPC and verifies the ordered context/timing prefix', async () => {
		const lastTurnContext = {
			summary: 'Completed the request.',
			entities: {},
			context_type: 'global',
			data_accessed: []
		};
		const timingDraft = asyncTimingDraft();
		const committedAt = '2026-08-03T12:00:00.123456Z';
		const { adapter, rpc } = adapterFor([
			terminalReceipt({
				terminalized_at: committedAt,
				preterminal_events: [
					committedContextReceipt(lastTurnContext, TERMINAL_SEQUENCE - 2, committedAt),
					committedTimingReceipt(timingDraft, {}, committedAt, 3_123.456)
				]
			})
		]);

		await expect(
			adapter.finalize(
				finalizeInput({
					lastTurnContext,
					lastTurnContextTransitionId: LAST_CONTEXT_TRANSITION_ID,
					timingDraft,
					timingTransitionId: TIMING_TRANSITION_ID
				})
			)
		).resolves.toMatchObject({
			outcome: 'finalized',
			preterminal_events: [
				{ sequence_index: TERMINAL_SEQUENCE - 2, event_type: 'last_turn_context' },
				{ sequence_index: TERMINAL_SEQUENCE - 1, event_type: 'timing' }
			]
		});
		expect(rpc).toHaveBeenCalledWith(
			'finalize_agentic_chat_turn_with_terminal_events',
			expect.objectContaining({
				p_last_turn_context: lastTurnContext,
				p_last_turn_context_transition_id: LAST_CONTEXT_TRANSITION_ID,
				p_timing_draft: timingDraft,
				p_timing_transition_id: TIMING_TRANSITION_ID
			})
		);
	});

	it('uses the ordered terminal-event RPC for a cancelled partial response', async () => {
		const lastTurnContext = {
			summary: 'Partial answer.',
			entities: {},
			context_type: 'global',
			data_accessed: []
		};
		const timingDraft = { ...asyncTimingDraft(), finished_reason: 'cancelled' };
		const { adapter, rpc } = adapterFor([
			terminalReceipt({
				status: 'cancelled',
				finished_reason: 'cancelled',
				failure_code: 'cancelled',
				preterminal_events: [
					committedContextReceipt(lastTurnContext),
					committedTimingReceipt(timingDraft)
				]
			})
		]);

		await expect(
			adapter.finalize(
				finalizeInput({
					status: 'cancelled',
					finishedReason: 'cancelled',
					failureCode: 'cancelled',
					assistantText: 'Partial answer.',
					promptTokens: null,
					completionTokens: null,
					totalTokens: null,
					lastTurnContext,
					lastTurnContextTransitionId: LAST_CONTEXT_TRANSITION_ID,
					timingDraft,
					timingTransitionId: TIMING_TRANSITION_ID
				})
			)
		).resolves.toMatchObject({
			outcome: 'finalized',
			status: 'cancelled',
			preterminal_events: [{ event_type: 'last_turn_context' }, { event_type: 'timing' }]
		});
		expect(rpc).toHaveBeenCalledWith(
			'finalize_agentic_chat_turn_with_terminal_events',
			expect.objectContaining({
				p_status: 'cancelled',
				p_failure_code: 'cancelled',
				p_last_turn_context: lastTurnContext,
				p_timing_draft: timingDraft
			})
		);
	});

	it('rejects a cancelled context-only call before selecting the completion-only wrapper', async () => {
		const { adapter, rpc } = adapterFor([]);

		await expect(
			adapter.finalize(
				finalizeInput({
					status: 'cancelled',
					finishedReason: 'cancelled',
					failureCode: 'cancelled',
					assistantText: 'Partial answer.',
					promptTokens: null,
					completionTokens: null,
					totalTokens: null,
					lastTurnContext: {
						summary: 'Partial answer.',
						entities: {},
						context_type: 'global',
						data_accessed: []
					},
					lastTurnContextTransitionId: LAST_CONTEXT_TRANSITION_ID
				})
			)
		).rejects.toThrow('cancelled terminal events require');
		expect(rpc).not.toHaveBeenCalled();
	});

	it('selects the failure-event RPC and verifies error then timing with no assistant row', async () => {
		const publicError = 'An error occurred while streaming.';
		const timingDraft = { ...asyncTimingDraft(), finished_reason: 'error' };
		const committedAt = '2026-08-03T12:00:00.123456Z';
		const { adapter, rpc } = adapterFor([
			terminalReceipt({
				status: 'failed',
				finished_reason: 'error',
				failure_code: 'permanent',
				assistant_message_id: null,
				terminalized_at: committedAt,
				preterminal_events: [
					committedErrorReceipt(publicError),
					committedTimingReceipt(timingDraft, {}, committedAt, 3_123.456, null)
				]
			})
		]);

		await expect(
			adapter.finalize(
				finalizeInput({
					status: 'failed',
					finishedReason: 'error',
					failureCode: 'permanent',
					assistantMessageId: null,
					assistantText: 'Discarded partial.',
					promptTokens: null,
					completionTokens: null,
					totalTokens: null,
					publicError,
					errorTransitionId: ERROR_TRANSITION_ID,
					timingDraft,
					timingTransitionId: TIMING_TRANSITION_ID
				})
			)
		).resolves.toMatchObject({
			outcome: 'finalized',
			status: 'failed',
			assistant_message_id: null,
			preterminal_events: [{ event_type: 'error' }, { event_type: 'timing' }]
		});
		expect(rpc).toHaveBeenCalledWith(
			'finalize_agentic_chat_turn_with_failure_events',
			expect.objectContaining({
				p_public_error: publicError,
				p_error_transition_id: ERROR_TRANSITION_ID,
				p_timing_draft: timingDraft,
				p_timing_transition_id: TIMING_TRANSITION_ID
			})
		);
	});

	it('keeps failed partial text in stream state without creating an assistant history row', async () => {
		const { adapter, rpc } = adapterFor([
			terminalReceipt({
				status: 'failed',
				finished_reason: 'worker_interrupted',
				failure_code: 'stale_context',
				assistant_message_id: null
			})
		]);

		await expect(
			adapter.finalize(
				finalizeInput({
					status: 'failed',
					finishedReason: 'worker_interrupted',
					failureCode: 'stale_context',
					assistantMessageId: null,
					assistantText: 'Reconnect-only partial response.',
					promptTokens: null,
					completionTokens: null,
					totalTokens: null
				})
			)
		).resolves.toMatchObject({ status: 'failed', assistant_message_id: null });
		expect(rpc).toHaveBeenCalledWith(
			'finalize_agentic_chat_turn',
			expect.objectContaining({
				p_status: 'failed',
				p_assistant_message_id: null,
				p_assistant_text: 'Reconnect-only partial response.'
			})
		);
	});

	it('rejects an assistant history ID for failed reconnect-only text before the RPC', async () => {
		const { adapter, rpc } = adapterFor([]);

		await expect(
			adapter.finalize(
				finalizeInput({
					status: 'failed',
					finishedReason: 'worker_interrupted',
					failureCode: 'stale_context',
					assistantText: 'Reconnect-only partial response.',
					promptTokens: null,
					completionTokens: null,
					totalTokens: null
				})
			)
		).rejects.toThrow('assistant message id are inconsistent');
		expect(rpc).not.toHaveBeenCalled();
	});

	it('rejects a forged database-owned timing summary', async () => {
		const lastTurnContext = {
			summary: 'Completed the request.',
			entities: {},
			context_type: 'global',
			data_accessed: []
		};
		const timingDraft = asyncTimingDraft();
		const timingReceipt = committedTimingReceipt(timingDraft);
		const committedTiming = timingReceipt.event_payload.timing as Record<string, unknown>;
		const forgedTiming = {
			...committedTiming,
			phases: {
				...(committedTiming.phases as Record<string, unknown>),
				total_request_ms: 3_001
			}
		};
		const { adapter } = adapterFor([
			terminalReceipt({
				preterminal_events: [
					committedContextReceipt(lastTurnContext),
					{
						...timingReceipt,
						event_payload: { type: 'timing', timing: forgedTiming }
					}
				]
			})
		]);

		await expect(
			adapter.finalize(
				finalizeInput({
					lastTurnContext,
					lastTurnContextTransitionId: LAST_CONTEXT_TRANSITION_ID,
					timingDraft,
					timingTransitionId: TIMING_TRANSITION_ID
				})
			)
		).rejects.toBeInstanceOf(AgenticChatExecutionControlProtocolError);
	});

	it('accepts a lost provider-start response only as non-authoritative replay', async () => {
		const { adapter } = adapterFor([
			executionReceipt({
				outcome: 'already_started',
				invoke_provider: false,
				execution_started_at: '2026-08-03T11:59:59.000Z'
			})
		]);

		await expect(
			adapter.begin({ ...identity, executionGeneration: EXECUTION_GENERATION })
		).resolves.toMatchObject({ outcome: 'already_started', invoke_provider: false });
	});

	it('rejects recovery receipts whose retry authority contradicts the outcome', async () => {
		const { adapter } = adapterFor([
			executionReceipt({
				outcome: 'finalize_failed',
				execution_may_retry: true,
				failure_code: 'permanent'
			})
		]);

		await expect(
			adapter.recover({
				...identity,
				executionGeneration: EXECUTION_GENERATION,
				failureClass: 'permanent',
				errorMessage: 'invalid fixture'
			})
		).rejects.toBeInstanceOf(AgenticChatExecutionControlProtocolError);
	});

	it('returns the committed terminal winner for a conflicting idempotent replay', async () => {
		const { adapter } = adapterFor([
			terminalReceipt({
				outcome: 'already_terminal',
				status: 'completed',
				execution_generation: EXECUTION_GENERATION + 1,
				terminal_event_id: createAgentStreamEventIdV1(
					TURN_RUN_ID,
					EXECUTION_GENERATION + 1,
					TERMINAL_SEQUENCE
				)
			})
		]);

		await expect(
			adapter.finalize(
				finalizeInput({
					status: 'cancelled',
					finishedReason: 'cancelled',
					failureCode: 'cancelled',
					assistantMessageId: null,
					assistantText: '',
					promptTokens: null,
					completionTokens: null,
					totalTokens: null
				})
			)
		).resolves.toMatchObject({
			outcome: 'already_terminal',
			status: 'completed',
			execution_generation: EXECUTION_GENERATION + 1
		});
	});

	it('rejects a terminal receipt with a non-deterministic event id', async () => {
		const { adapter } = adapterFor([
			terminalReceipt({ terminal_event_id: `${TURN_RUN_ID}:2:999` })
		]);

		await expect(adapter.finalize(finalizeInput())).rejects.toBeInstanceOf(
			AgenticChatExecutionControlProtocolError
		);
	});
});
