// apps/worker/tests/agenticChatRecoverySnapshot.test.ts
import { createAgentStreamEventIdV1 } from '@buildos/shared-types';
import { describe, expect, it, vi } from 'vitest';
import {
	AgenticChatRecoverySnapshotProtocolError,
	AgenticChatRecoverySnapshotRpcError,
	SupabaseAgenticChatRecoverySnapshotAdapter
} from '../src/workers/agentic-chat/recoverySnapshot';

const TURN_RUN_ID = '10000000-0000-4000-8000-000000000001';
const SESSION_ID = '20000000-0000-4000-8000-000000000002';
const USER_ID = '30000000-0000-4000-8000-000000000003';
const MESSAGE_ID = '40000000-0000-4000-8000-000000000004';
const GENERATION = 2;

function event(sequence: number, overrides: Record<string, unknown> = {}) {
	return {
		contract_version: 'agentic_chat_worker_v1',
		event_id: createAgentStreamEventIdV1(TURN_RUN_ID, GENERATION, sequence),
		stream_run_id: 'stream-run-1',
		client_turn_id: 'client-turn-1',
		session_id: SESSION_ID,
		turn_run_id: TURN_RUN_ID,
		execution_generation: GENERATION,
		sequence_index: sequence,
		phase: 'llm',
		event_type: 'text_delta',
		type: 'text_delta',
		durable: true,
		text_delta: 'partial',
		...overrides
	};
}

function receipt(overrides: Record<string, unknown> = {}) {
	return {
		outcome: 'reconciled',
		contract_version: 'agentic_chat_worker_v1',
		turn_run_id: TURN_RUN_ID,
		session_id: SESSION_ID,
		user_id: USER_ID,
		stream_run_id: 'stream-run-1',
		client_turn_id: 'client-turn-1',
		execution_mode: 'worker_realtime',
		requested_execution_generation: GENERATION,
		execution_generation: GENERATION,
		generation_changed: false,
		status: 'running',
		text: 'partial',
		projection: { version: 'agentic_chat_ui_projection_v1', semantic_events: [] },
		snapshot_sequence: 2,
		durable_through_sequence: 2,
		projection_durable_sequence: 1,
		durable_events: [event(2)],
		response_watermark: 2,
		reconcile_required: false,
		assistant_message: null,
		terminal_event_id: null,
		terminalized_at: null,
		finished_reason: null,
		failure_code: null,
		updated_at: '2026-08-03T12:00:00.000Z',
		...overrides
	};
}

function adapterFor(data: unknown) {
	const rpc = vi.fn(async () => ({ data, error: null }));
	return { adapter: new SupabaseAgenticChatRecoverySnapshotAdapter({ rpc }), rpc };
}

describe('SupabaseAgenticChatRecoverySnapshotAdapter', () => {
	it('loads one complete current-generation durable snapshot', async () => {
		const { adapter, rpc } = adapterFor(receipt());

		await expect(
			adapter.load({
				turnRunId: TURN_RUN_ID,
				userId: USER_ID,
				executionGeneration: GENERATION
			})
		).resolves.toEqual({
			turnRunId: TURN_RUN_ID,
			sessionId: SESSION_ID,
			userId: USER_ID,
			streamRunId: 'stream-run-1',
			clientTurnId: 'client-turn-1',
			executionGeneration: GENERATION,
			status: 'running',
			assistantText: 'partial',
			projection: { version: 'agentic_chat_ui_projection_v1', semantic_events: [] },
			durableSequence: 2
		});
		expect(rpc).toHaveBeenCalledWith('reconcile_agentic_chat_turn', {
			p_turn_run_id: TURN_RUN_ID,
			p_user_id: USER_ID,
			p_requested_execution_generation: GENERATION,
			p_after_durable_sequence: 0
		});
	});

	it('accepts exact terminal truth with its deterministic done event and partial message', async () => {
		const terminalReceipt = receipt({
			status: 'failed',
			snapshot_sequence: 3,
			durable_through_sequence: 3,
			projection_durable_sequence: 3,
			durable_events: [],
			response_watermark: 3,
			assistant_message: {
				id: MESSAGE_ID,
				role: 'assistant',
				content: 'partial',
				metadata: { turn_run_id: TURN_RUN_ID, execution_generation: GENERATION },
				prompt_tokens: null,
				completion_tokens: null,
				total_tokens: null,
				created_at: '2026-08-03T12:00:01.000Z'
			},
			terminal_event_id: createAgentStreamEventIdV1(TURN_RUN_ID, GENERATION, 3),
			terminalized_at: '2026-08-03T12:00:01.000Z',
			finished_reason: 'worker_interrupted',
			failure_code: 'timeout_post_start'
		});
		const { adapter } = adapterFor(terminalReceipt);

		await expect(
			adapter.load({
				turnRunId: TURN_RUN_ID,
				userId: USER_ID,
				executionGeneration: GENERATION
			})
		).resolves.toMatchObject({ status: 'failed', durableSequence: 3 });

		const mismatchedMessage = {
			...terminalReceipt,
			assistant_message: {
				...(terminalReceipt.assistant_message as Record<string, unknown>),
				content: 'different partial'
			}
		};
		const { adapter: corrupt } = adapterFor(mismatchedMessage);
		await expect(
			corrupt.load({
				turnRunId: TURN_RUN_ID,
				userId: USER_ID,
				executionGeneration: GENERATION
			})
		).rejects.toBeInstanceOf(AgenticChatRecoverySnapshotProtocolError);
	});

	it('rejects changed generations, incomplete windows, and terminal corruption', async () => {
		const corruptions = [
			{ generation_changed: true, execution_generation: GENERATION + 1 },
			{ durable_events: [], response_watermark: 2 },
			{
				status: 'failed',
				terminal_event_id: createAgentStreamEventIdV1(TURN_RUN_ID, GENERATION, 2),
				terminalized_at: null
			}
		];
		for (const corruption of corruptions) {
			const { adapter } = adapterFor(receipt(corruption));
			await expect(
				adapter.load({
					turnRunId: TURN_RUN_ID,
					userId: USER_ID,
					executionGeneration: GENERATION
				})
			).rejects.toBeInstanceOf(AgenticChatRecoverySnapshotProtocolError);
		}
	});

	it('keeps database errors typed', async () => {
		const adapter = new SupabaseAgenticChatRecoverySnapshotAdapter({
			rpc: vi.fn(async () => ({
				data: null,
				error: { code: '57014', message: 'statement timeout' }
			}))
		});
		await expect(
			adapter.load({
				turnRunId: TURN_RUN_ID,
				userId: USER_ID,
				executionGeneration: GENERATION
			})
		).rejects.toBeInstanceOf(AgenticChatRecoverySnapshotRpcError);
	});
});
