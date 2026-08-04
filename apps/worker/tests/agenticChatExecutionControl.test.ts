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
