// apps/web/src/lib/services/agentic-chat-v2/reconciliation.test.ts
import {
	AGENTIC_CHAT_RECONCILE_MAX_DURABLE_EVENTS,
	AGENTIC_CHAT_WORKER_CONTRACT_VERSION
} from '@buildos/shared-types';
import { describe, expect, it, vi } from 'vitest';
import {
	AgenticChatReconciliationProtocolError,
	AgenticChatReconciliationRpcError,
	reconcileAgenticChatTurn,
	type AgenticChatReconciliationRpcClient
} from './reconciliation.server';

const TURN_ID = 'd4000000-0000-4000-8000-000000000001';
const SESSION_ID = 'd2000000-0000-4000-8000-000000000001';
const USER_ID = 'd1000000-0000-4000-8000-000000000001';

function snapshot(overrides: Record<string, unknown> = {}) {
	return {
		outcome: 'reconciled',
		contract_version: AGENTIC_CHAT_WORKER_CONTRACT_VERSION,
		turn_run_id: TURN_ID,
		session_id: SESSION_ID,
		user_id: USER_ID,
		stream_run_id: 'stream-1',
		client_turn_id: 'client-1',
		execution_mode: 'worker_realtime',
		requested_execution_generation: 2,
		execution_generation: 2,
		generation_changed: false,
		status: 'running',
		text: 'Hello',
		projection: { phase: 'tool' },
		snapshot_sequence: 4,
		durable_through_sequence: 4,
		projection_durable_sequence: 2,
		durable_events: [
			{
				contract_version: AGENTIC_CHAT_WORKER_CONTRACT_VERSION,
				event_id: `${TURN_ID}:2:3`,
				stream_run_id: 'stream-1',
				client_turn_id: 'client-1',
				session_id: SESSION_ID,
				turn_run_id: TURN_ID,
				execution_generation: 2,
				sequence_index: 3,
				phase: 'tool',
				event_type: 'tool_result',
				durable: true,
				type: 'tool_result',
				ok: true
			},
			{
				contract_version: AGENTIC_CHAT_WORKER_CONTRACT_VERSION,
				event_id: `${TURN_ID}:2:4`,
				stream_run_id: 'stream-1',
				client_turn_id: 'client-1',
				session_id: SESSION_ID,
				turn_run_id: TURN_ID,
				execution_generation: 2,
				sequence_index: 4,
				phase: 'llm',
				event_type: 'text_delta',
				durable: true,
				type: 'text_delta',
				text_delta: 'o'
			}
		],
		response_watermark: 4,
		reconcile_required: true,
		assistant_message: null,
		terminal_event_id: null,
		terminalized_at: null,
		finished_reason: null,
		failure_code: null,
		updated_at: '2026-08-02T22:00:00.000Z',
		...overrides
	};
}

function clientWith(data: unknown, error: { code?: string; message: string } | null = null) {
	return {
		rpc: vi.fn(async () => ({ data, error }))
	} satisfies AgenticChatReconciliationRpcClient;
}

const request = {
	turnRunId: TURN_ID,
	userId: USER_ID,
	requestedExecutionGeneration: 2,
	afterDurableSequence: 0
};

describe('reconcileAgenticChatTurn', () => {
	it('calls the exact RPC and accepts a scoped ordered snapshot', async () => {
		const client = clientWith(snapshot());
		const result = await reconcileAgenticChatTurn({ client, ...request });

		expect(result.outcome).toBe('reconciled');
		expect(client.rpc).toHaveBeenCalledWith('reconcile_agentic_chat_turn', {
			p_turn_run_id: TURN_ID,
			p_user_id: USER_ID,
			p_requested_execution_generation: 2,
			p_after_durable_sequence: 0
		});
	});

	it('accepts sequence gaps covered by the authoritative text and projection snapshot', async () => {
		const retained = (snapshot().durable_events as Array<Record<string, unknown>>)[0]!;
		await expect(
			reconcileAgenticChatTurn({
				client: clientWith(
					snapshot({
						snapshot_sequence: 5,
						durable_through_sequence: 5,
						projection_durable_sequence: 2,
						response_watermark: 5,
						durable_events: [
							{ ...retained, event_id: `${TURN_ID}:2:4`, sequence_index: 4 }
						]
					})
				),
				...request
			})
		).resolves.toMatchObject({ outcome: 'reconciled', response_watermark: 5 });
	});

	it('accepts ownership-safe not-found and legacy outcomes', async () => {
		await expect(
			reconcileAgenticChatTurn({
				client: clientWith({ outcome: 'not_found', turn_run_id: TURN_ID }),
				...request
			})
		).resolves.toMatchObject({ outcome: 'not_found' });
		await expect(
			reconcileAgenticChatTurn({
				client: clientWith({
					outcome: 'not_worker_turn',
					turn_run_id: TURN_ID,
					execution_mode: 'legacy_sse',
					status: 'running'
				}),
				...request
			})
		).resolves.toMatchObject({ outcome: 'not_worker_turn' });
	});

	it('fails closed on response identity, cursor, and event-order corruption', async () => {
		for (const corrupt of [
			snapshot({ user_id: 'other-user' }),
			snapshot({ response_watermark: 3 }),
			snapshot({ terminal_event_id: { unexpected: true } }),
			snapshot({
				durable_events: [
					(snapshot().durable_events as Array<Record<string, unknown>>)[1],
					(snapshot().durable_events as Array<Record<string, unknown>>)[0]
				]
			}),
			snapshot({
				durable_events: [
					(snapshot().durable_events as Array<Record<string, unknown>>)[0],
					(snapshot().durable_events as Array<Record<string, unknown>>)[0]
				]
			})
		]) {
			await expect(
				reconcileAgenticChatTurn({ client: clientWith(corrupt), ...request })
			).rejects.toBeInstanceOf(AgenticChatReconciliationProtocolError);
		}
	});

	it('fails closed on terminal assistant-message corruption', async () => {
		const terminal = snapshot({
			status: 'completed',
			assistant_message: {
				id: 'message-1',
				role: 'assistant',
				content: 'Complete answer',
				metadata: {
					turn_run_id: TURN_ID,
					execution_generation: 1
				},
				prompt_tokens: 10,
				completion_tokens: 5,
				total_tokens: 15,
				created_at: '2026-08-02T22:00:00.000Z'
			},
			terminal_event_id: `${TURN_ID}:2:4`,
			terminalized_at: '2026-08-02T22:00:00.000Z'
		});

		await expect(
			reconcileAgenticChatTurn({ client: clientWith(terminal), ...request })
		).rejects.toBeInstanceOf(AgenticChatReconciliationProtocolError);
	});

	it('enforces the shared event bound', async () => {
		const event = (snapshot().durable_events as Array<Record<string, unknown>>)[0];
		await expect(
			reconcileAgenticChatTurn({
				client: clientWith(
					snapshot({
						durable_events: Array.from(
							{ length: AGENTIC_CHAT_RECONCILE_MAX_DURABLE_EVENTS + 1 },
							() => event
						)
					})
				),
				...request
			})
		).rejects.toBeInstanceOf(AgenticChatReconciliationProtocolError);
	});

	it('preserves typed database errors without accepting a partial receipt', async () => {
		await expect(
			reconcileAgenticChatTurn({
				client: clientWith(null, { code: 'P0001', message: 'corrupt state' }),
				...request
			})
		).rejects.toMatchObject({
			name: 'AgenticChatReconciliationRpcError',
			code: 'P0001'
		} satisfies Partial<AgenticChatReconciliationRpcError>);
	});
});
