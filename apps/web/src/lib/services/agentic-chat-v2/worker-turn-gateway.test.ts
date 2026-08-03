// apps/web/src/lib/services/agentic-chat-v2/worker-turn-gateway.test.ts
import { describe, expect, it, vi } from 'vitest';
import {
	getOwnedAgenticChatWorkerTurn,
	listOwnedActiveAgenticChatWorkerTurns,
	requestOwnedAgenticChatWorkerTurnCancellation,
	type AgenticChatWorkerTurnGatewayClient,
	type AgenticChatWorkerTurnQuery
} from './worker-turn-gateway.server';

const USER_ID = 'd1000000-0000-4000-8000-000000000001';
const SESSION_ID = 'd2000000-0000-4000-8000-000000000001';
const TURN_ID = 'd3000000-0000-4000-8000-000000000001';

function row(overrides: Record<string, unknown> = {}) {
	return {
		id: TURN_ID,
		session_id: SESSION_ID,
		stream_run_id: 'stream-run-1',
		client_turn_id: 'client-turn-1',
		execution_mode: 'worker_realtime',
		transport_contract_version: 'agentic_chat_worker_v1',
		status: 'running',
		execution_generation: 1,
		last_event_sequence: 0,
		terminal_event_id: null,
		updated_at: '2026-08-03T00:00:00.000Z',
		...overrides
	};
}

function terminalReceipt(
	outcome: 'cancelled' | 'already_terminal',
	status: 'cancelled' | 'completed' | 'failed' = 'cancelled'
) {
	return {
		outcome,
		turn_run_id: TURN_ID,
		user_id: USER_ID,
		status,
		execution_generation: 1,
		terminal_sequence_index: 4,
		terminal_event_id: `${TURN_ID}:1:4`
	};
}

function client(options: {
	queryResults?: Array<{ data: unknown; error: null | { message: string } }>;
	rpcResult?: { data: unknown; error: null | { message: string } };
}) {
	const queryCalls: Array<{
		filters: Array<[string, string]>;
		inFilters: Array<[string, string[]]>;
		order: [string, { ascending: boolean }] | null;
		limit: number;
	}> = [];
	let queryIndex = 0;
	const rpc = vi.fn(async () => options.rpcResult ?? { data: null, error: null });
	const value: AgenticChatWorkerTurnGatewayClient = {
		from: () => ({
			select: () => {
				const filters: Array<[string, string]> = [];
				const inFilters: Array<[string, string[]]> = [];
				let order: [string, { ascending: boolean }] | null = null;
				const query: AgenticChatWorkerTurnQuery = {
					eq(column, filterValue) {
						filters.push([column, filterValue]);
						return query;
					},
					in(column, filterValues) {
						inFilters.push([column, filterValues]);
						return query;
					},
					order(column, orderOptions) {
						order = [column, orderOptions];
						return query;
					},
					limit(count) {
						queryCalls.push({ filters, inFilters, order, limit: count });
						return Promise.resolve(
							options.queryResults?.[queryIndex++] ?? { data: [], error: null }
						);
					}
				};
				return query;
			}
		}),
		rpc
	};
	return { value, queryCalls, rpc };
}

describe('Agentic Chat worker turn gateway', () => {
	it('returns one exact owned worker handle and hides absence', async () => {
		const database = client({ queryResults: [{ data: [row()], error: null }] });
		const result = await getOwnedAgenticChatWorkerTurn({
			client: database.value,
			userId: USER_ID,
			turnRunId: TURN_ID
		});
		expect(result).toEqual({
			handle: {
				contractVersion: 'agentic_chat_worker_v1',
				executionMode: 'worker_realtime',
				turnRunId: TURN_ID,
				sessionId: SESSION_ID,
				streamRunId: 'stream-run-1',
				clientTurnId: 'client-turn-1'
			},
			status: 'running',
			executionGeneration: 1,
			terminalEventId: null,
			updatedAt: '2026-08-03T00:00:00.000Z'
		});
		expect(database.queryCalls[0]?.filters).toEqual([
			['user_id', USER_ID],
			['id', TURN_ID],
			['execution_mode', 'worker_realtime']
		]);

		const absent = client({ queryResults: [{ data: [], error: null }] });
		expect(
			await getOwnedAgenticChatWorkerTurn({
				client: absent.value,
				userId: USER_ID,
				turnRunId: TURN_ID
			})
		).toBeNull();
	});

	it('lists only a bounded active session scope', async () => {
		const database = client({ queryResults: [{ data: [row()], error: null }] });
		const results = await listOwnedActiveAgenticChatWorkerTurns({
			client: database.value,
			userId: USER_ID,
			sessionId: SESSION_ID
		});
		expect(results).toHaveLength(1);
		expect(database.queryCalls[0]).toMatchObject({
			filters: [
				['user_id', USER_ID],
				['session_id', SESSION_ID],
				['execution_mode', 'worker_realtime']
			],
			inFilters: [['status', ['queued', 'running']]],
			order: ['updated_at', { ascending: false }],
			limit: 9
		});
	});

	it('rejects ambiguous, over-bound, malformed, and failed lookup results', async () => {
		for (const database of [
			client({ queryResults: [{ data: [row(), row()], error: null }] }),
			client({ queryResults: [{ data: [row({ execution_generation: 0 })], error: null }] }),
			client({ queryResults: [{ data: null, error: { message: 'private' } }] })
		]) {
			await expect(
				getOwnedAgenticChatWorkerTurn({
					client: database.value,
					userId: USER_ID,
					turnRunId: TURN_ID
				})
			).rejects.toBeDefined();
		}

		const overBound = client({
			queryResults: [{ data: Array.from({ length: 9 }, () => row()), error: null }]
		});
		await expect(
			listOwnedActiveAgenticChatWorkerTurns({
				client: overBound.value,
				userId: USER_ID,
				sessionId: SESSION_ID
			})
		).rejects.toMatchObject({ code: 'protocol_error' });
	});

	it('maps running, queued, and already-terminal cancellation receipts', async () => {
		const running = client({
			rpcResult: {
				data: {
					outcome: 'cancel_requested',
					turn_run_id: TURN_ID,
					user_id: USER_ID,
					status: 'running',
					signal_id: 'd5000000-0000-4000-8000-000000000001',
					cancel_requested_at: '2026-08-03T00:00:00.000Z'
				},
				error: null
			}
		});
		expect(
			await requestOwnedAgenticChatWorkerTurnCancellation({
				client: running.value,
				userId: USER_ID,
				turnRunId: TURN_ID,
				reason: 'user_cancelled'
			})
		).toEqual({ outcome: 'cancel_requested' });
		expect(running.rpc).toHaveBeenCalledWith('request_agentic_chat_turn_cancel', {
			p_turn_run_id: TURN_ID,
			p_user_id: USER_ID,
			p_reason: 'user_cancelled',
			p_source: 'browser'
		});

		const queued = client({ rpcResult: { data: terminalReceipt('cancelled'), error: null } });
		expect(
			await requestOwnedAgenticChatWorkerTurnCancellation({
				client: queued.value,
				userId: USER_ID,
				turnRunId: TURN_ID,
				reason: 'superseded'
			})
		).toEqual({
			outcome: 'cancelled',
			status: 'cancelled',
			terminalEventId: `${TURN_ID}:1:4`
		});

		const terminal = client({
			rpcResult: { data: terminalReceipt('already_terminal', 'completed'), error: null }
		});
		expect(
			await requestOwnedAgenticChatWorkerTurnCancellation({
				client: terminal.value,
				userId: USER_ID,
				turnRunId: TURN_ID,
				reason: 'user_cancelled'
			})
		).toEqual({
			outcome: 'already_terminal',
			status: 'completed',
			terminalEventId: `${TURN_ID}:1:4`
		});
	});

	it('hides absent ownership and rejects malformed cancellation receipts', async () => {
		const absent = client({
			rpcResult: {
				data: null,
				error: { message: 'agentic_chat_cancel_turn_relationship_mismatch private detail' }
			}
		});
		await expect(
			requestOwnedAgenticChatWorkerTurnCancellation({
				client: absent.value,
				userId: USER_ID,
				turnRunId: TURN_ID,
				reason: 'user_cancelled'
			})
		).rejects.toMatchObject({ code: 'not_found' });

		const malformed = client({
			rpcResult: {
				data: { ...terminalReceipt('cancelled'), terminal_event_id: `${TURN_ID}:1:3` },
				error: null
			}
		});
		await expect(
			requestOwnedAgenticChatWorkerTurnCancellation({
				client: malformed.value,
				userId: USER_ID,
				turnRunId: TURN_ID,
				reason: 'user_cancelled'
			})
		).rejects.toMatchObject({ code: 'protocol_error' });
	});
});
