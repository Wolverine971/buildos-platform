// apps/web/src/lib/services/agentic-chat-v2/worker-realtime-inbox.test.ts
import {
	AGENTIC_CHAT_WORKER_CONTRACT_VERSION,
	type AgentStreamEventV1,
	type TurnHandleV1
} from '@buildos/shared-types';
import { describe, expect, it, vi } from 'vitest';
import {
	AgenticChatWorkerRealtimeInbox,
	type AgenticChatWorkerReconciledReceipt,
	type AgenticChatWorkerReconciliationReason,
	type AgenticChatWorkerTurnObserver
} from './worker-realtime-inbox';

const TURN_ID = 'd4000000-0000-4000-8000-000000000001';
const SESSION_ID = 'd2000000-0000-4000-8000-000000000001';
const USER_ID = 'd1000000-0000-4000-8000-000000000001';
const STREAM_ID = 'worker-stream-1';
const CLIENT_ID = 'worker-client-1';

const handle: Extract<TurnHandleV1, { executionMode: 'worker_realtime' }> = {
	contractVersion: AGENTIC_CHAT_WORKER_CONTRACT_VERSION,
	executionMode: 'worker_realtime',
	turnRunId: TURN_ID,
	sessionId: SESSION_ID,
	streamRunId: STREAM_ID,
	clientTurnId: CLIENT_ID
};

function event(
	sequence: number,
	generation = 1,
	overrides: Record<string, unknown> = {}
): AgentStreamEventV1 {
	return {
		contract_version: AGENTIC_CHAT_WORKER_CONTRACT_VERSION,
		event_id: `${TURN_ID}:${generation}:${sequence}`,
		stream_run_id: STREAM_ID,
		client_turn_id: CLIENT_ID,
		session_id: SESSION_ID,
		turn_run_id: TURN_ID,
		execution_generation: generation,
		sequence_index: sequence,
		phase: 'stream',
		event_type: 'text_delta',
		durable: true,
		type: 'text_delta',
		text_delta: `chunk-${sequence}`,
		...overrides
	};
}

function receipt(
	generation: number,
	watermark: number,
	overrides: Record<string, unknown> = {}
): AgenticChatWorkerReconciledReceipt {
	return {
		outcome: 'reconciled',
		contract_version: AGENTIC_CHAT_WORKER_CONTRACT_VERSION,
		turn_run_id: TURN_ID,
		session_id: SESSION_ID,
		user_id: USER_ID,
		stream_run_id: STREAM_ID,
		client_turn_id: CLIENT_ID,
		execution_mode: 'worker_realtime',
		requested_execution_generation: generation,
		execution_generation: generation,
		generation_changed: false,
		status: 'running',
		text: '',
		projection: {},
		snapshot_sequence: watermark,
		durable_through_sequence: watermark,
		projection_durable_sequence: watermark,
		durable_events: [],
		response_watermark: watermark,
		reconcile_required: false,
		assistant_message: null,
		terminal_event_id: null,
		terminalized_at: null,
		finished_reason: null,
		failure_code: null,
		updated_at: '2026-08-02T23:00:00.000Z',
		...overrides
	} as AgenticChatWorkerReconciledReceipt;
}

function observer() {
	const applied: AgentStreamEventV1[] = [];
	const reconciled: AgenticChatWorkerReconciledReceipt[] = [];
	const reasons: AgenticChatWorkerReconciliationReason[] = [];
	const applicationOrder: string[] = [];
	const value: AgenticChatWorkerTurnObserver = {
		applyLiveEvent: vi.fn((next) => {
			applicationOrder.push(`live:${next.sequence_index}`);
			applied.push(next);
		}),
		applyReconciliation: vi.fn((next) => {
			applicationOrder.push('reconciliation');
			reconciled.push(next);
		}),
		requestReconciliation: vi.fn((request) => reasons.push(request.reason))
	};
	return { value, applied, reconciled, reasons, applicationOrder };
}

describe('AgenticChatWorkerRealtimeInbox', () => {
	it('buffers from registration until durable baseline truth is applied', () => {
		const sink = observer();
		const inbox = new AgenticChatWorkerRealtimeInbox();
		inbox.registerTurn({ handle, observer: sink.value });

		inbox.receiveStreamEvent(event(1));
		expect(sink.reasons).toEqual(['initial']);
		expect(sink.applied).toEqual([]);
		expect(inbox.getSnapshot(TURN_ID)).toMatchObject({
			buffering: true,
			bufferedEvents: 1
		});

		expect(
			inbox.applyReconciliation(
				TURN_ID,
				receipt(1, 0, {
					requested_execution_generation: 0,
					generation_changed: true
				})
			)
		).toBe(true);
		expect(sink.reconciled).toHaveLength(1);
		expect(sink.applied.map((item) => item.sequence_index)).toEqual([1]);
		expect(sink.applicationOrder).toEqual(['reconciliation', 'live:1']);
		expect(inbox.getSnapshot(TURN_ID)).toMatchObject({
			buffering: false,
			lastAppliedSequence: 1,
			bufferedEvents: 0
		});
	});

	it('applies contiguous events once and ignores duplicates and stale generations', () => {
		const sink = observer();
		const inbox = new AgenticChatWorkerRealtimeInbox();
		inbox.registerTurn({
			handle,
			observer: sink.value,
			executionGeneration: 2,
			lastAppliedSequence: 2
		});
		inbox.applyReconciliation(TURN_ID, receipt(2, 2));

		inbox.receiveStreamEvent(event(3, 2));
		inbox.receiveStreamEvent(event(3, 2));
		inbox.receiveStreamEvent(event(4, 1));

		expect(sink.applied.map((item) => item.event_id)).toEqual([`${TURN_ID}:2:3`]);
		expect(sink.reasons).toEqual(['initial']);
		expect(inbox.getSnapshot(TURN_ID)?.lastAppliedSequence).toBe(3);
	});

	it('does not let stale or already-applied events consume the reconciliation buffer', () => {
		const sink = observer();
		const inbox = new AgenticChatWorkerRealtimeInbox();
		inbox.registerTurn({
			handle,
			observer: sink.value,
			executionGeneration: 2,
			lastAppliedSequence: 3
		});
		inbox.receiveStreamEvent(event(4, 1));
		inbox.receiveStreamEvent(event(3, 2));

		expect(inbox.getSnapshot(TURN_ID)).toMatchObject({
			buffering: true,
			bufferedEvents: 0,
			bufferedBytes: 0
		});
		expect(sink.reasons).toEqual(['initial']);
	});

	it('never advances across a gap and drains only after the watermark closes it', () => {
		const sink = observer();
		const inbox = new AgenticChatWorkerRealtimeInbox();
		inbox.registerTurn({
			handle,
			observer: sink.value,
			executionGeneration: 1,
			lastAppliedSequence: 2
		});
		inbox.applyReconciliation(TURN_ID, receipt(1, 2));

		inbox.receiveStreamEvent(event(4));
		expect(sink.reasons).toEqual(['initial', 'sequence_gap']);
		expect(sink.applied).toEqual([]);
		expect(inbox.applyReconciliation(TURN_ID, receipt(1, 2))).toBe(true);
		expect(sink.reasons).toEqual(['initial', 'sequence_gap', 'sequence_gap']);
		expect(inbox.getSnapshot(TURN_ID)?.lastAppliedSequence).toBe(2);

		inbox.applyReconciliation(TURN_ID, receipt(1, 3));
		expect(sink.applied.map((item) => item.sequence_index)).toEqual([4]);
		expect(inbox.getSnapshot(TURN_ID)?.lastAppliedSequence).toBe(4);
	});

	it('buffers a future generation until reconciliation adopts it', () => {
		const sink = observer();
		const inbox = new AgenticChatWorkerRealtimeInbox();
		inbox.registerTurn({
			handle,
			observer: sink.value,
			executionGeneration: 1,
			lastAppliedSequence: 4
		});
		inbox.applyReconciliation(TURN_ID, receipt(1, 4));

		inbox.receiveStreamEvent(event(1, 2));
		expect(sink.reasons).toEqual(['initial', 'generation_changed']);
		expect(inbox.getSnapshot(TURN_ID)?.bufferedEvents).toBe(1);

		inbox.applyReconciliation(
			TURN_ID,
			receipt(2, 0, {
				requested_execution_generation: 1,
				generation_changed: true
			})
		);
		expect(sink.applied.map((item) => item.event_id)).toEqual([`${TURN_ID}:2:1`]);
		expect(inbox.getSnapshot(TURN_ID)).toMatchObject({
			executionGeneration: 2,
			lastAppliedSequence: 1,
			buffering: false
		});
	});

	it('bounds buffered acceleration data and forces a follow-up reconciliation', () => {
		const sink = observer();
		const inbox = new AgenticChatWorkerRealtimeInbox({ maxBufferedEvents: 1 });
		inbox.registerTurn({
			handle,
			observer: sink.value,
			executionGeneration: 1,
			lastAppliedSequence: 1
		});
		inbox.applyReconciliation(TURN_ID, receipt(1, 1));
		inbox.requestReconciliation(TURN_ID, 'watchdog');
		inbox.receiveStreamEvent(event(2));
		inbox.receiveStreamEvent(event(3));

		expect(inbox.getSnapshot(TURN_ID)).toMatchObject({
			bufferedEvents: 1,
			bufferOverflowed: true
		});
		inbox.applyReconciliation(TURN_ID, receipt(1, 1));
		expect(sink.applied.map((item) => item.sequence_index)).toEqual([2]);
		expect(sink.reasons).toEqual(['initial', 'watchdog', 'buffer_overflow']);
		expect(inbox.getSnapshot(TURN_ID)).toMatchObject({
			buffering: true,
			reconciliationRequested: true,
			bufferOverflowed: false
		});
	});

	it('enforces the byte bound independently of the event-count bound', () => {
		const sink = observer();
		const inbox = new AgenticChatWorkerRealtimeInbox({ maxBufferedBytes: 32 });
		inbox.registerTurn({
			handle,
			observer: sink.value,
			executionGeneration: 1,
			lastAppliedSequence: 1
		});
		inbox.applyReconciliation(TURN_ID, receipt(1, 1));
		inbox.requestReconciliation(TURN_ID, 'watchdog');
		inbox.receiveStreamEvent(event(2));

		expect(inbox.getSnapshot(TURN_ID)).toMatchObject({
			bufferedEvents: 0,
			bufferedBytes: 0,
			bufferOverflowed: true
		});
		inbox.applyReconciliation(TURN_ID, receipt(1, 1));
		expect(sink.reasons).toEqual(['initial', 'watchdog', 'buffer_overflow']);
	});

	it('rejects a reconciliation receipt with inconsistent cursor truth', () => {
		for (const corrupt of [
			receipt(1, 2, { response_watermark: 1 }),
			receipt(1, 2, {
				projection_durable_sequence: 0,
				durable_events: [event(2)]
			})
		]) {
			const sink = observer();
			const inbox = new AgenticChatWorkerRealtimeInbox();
			inbox.registerTurn({ handle, observer: sink.value });

			expect(inbox.applyReconciliation(TURN_ID, corrupt)).toBe(false);
			expect(sink.reconciled).toEqual([]);
			expect(sink.reasons).toEqual(['initial', 'protocol_error']);
		}
	});

	it('rejects incomplete or forged terminal reconciliation truth', () => {
		const assistantMessage = {
			id: 'd6000000-0000-4000-8000-000000000001',
			role: 'assistant',
			content: 'done',
			metadata: { turn_run_id: TURN_ID, execution_generation: 1 },
			prompt_tokens: null,
			completion_tokens: null,
			total_tokens: null,
			created_at: '2026-08-03T12:00:00.000Z'
		};
		for (const corrupt of [
			receipt(1, 1, { status: 'completed', assistant_message: assistantMessage }),
			receipt(1, 1, {
				status: 'completed',
				assistant_message: assistantMessage,
				terminal_event_id: `${TURN_ID}:1:99`,
				terminalized_at: '2026-08-03T12:00:01.000Z'
			}),
			receipt(1, 1, {
				status: 'completed',
				assistant_message: null,
				terminal_event_id: `${TURN_ID}:1:1`,
				terminalized_at: '2026-08-03T12:00:01.000Z'
			}),
			receipt(1, 0, { assistant_message: assistantMessage })
		]) {
			const sink = observer();
			const inbox = new AgenticChatWorkerRealtimeInbox();
			inbox.registerTurn({ handle, observer: sink.value });

			expect(inbox.applyReconciliation(TURN_ID, corrupt)).toBe(false);
			expect(sink.reconciled).toEqual([]);
			expect(sink.reasons).toEqual(['initial', 'protocol_error']);
		}
	});

	it('releases a failed request latch without leaving reconciliation mode', () => {
		const sink = observer();
		const inbox = new AgenticChatWorkerRealtimeInbox();
		inbox.registerTurn({ handle, observer: sink.value });

		expect(inbox.releaseReconciliationRequest(TURN_ID)).toBe(true);
		expect(inbox.getSnapshot(TURN_ID)).toMatchObject({
			buffering: true,
			reconciliationRequested: false
		});
		inbox.requestReconciliation(TURN_ID, 'watchdog');
		expect(sink.reasons).toEqual(['initial', 'watchdog']);
		expect(inbox.releaseReconciliationRequest('missing-turn')).toBe(false);
	});

	it('routes hints and same-turn protocol corruption through reconciliation', () => {
		const sink = observer();
		const inbox = new AgenticChatWorkerRealtimeInbox();
		inbox.registerTurn({
			handle,
			observer: sink.value,
			executionGeneration: 1,
			lastAppliedSequence: 3
		});
		inbox.applyReconciliation(TURN_ID, receipt(1, 3));

		inbox.receiveReconcileHint({
			contract_version: AGENTIC_CHAT_WORKER_CONTRACT_VERSION,
			turn_run_id: TURN_ID,
			session_id: SESSION_ID,
			execution_generation: 1,
			durable_through_sequence: 4
		});
		expect(sink.reasons).toEqual(['initial', 'reconcile_hint']);
		inbox.applyReconciliation(TURN_ID, receipt(1, 4));

		inbox.receiveStreamEvent(event(5, 1, { session_id: 'wrong-session' }));
		expect(sink.reasons).toEqual(['initial', 'reconcile_hint', 'protocol_error']);
		expect(sink.applied).toEqual([]);
	});

	it('ignores unregistered turns and unregisters idempotently', () => {
		const sink = observer();
		const inbox = new AgenticChatWorkerRealtimeInbox();
		const unregister = inbox.registerTurn({ handle, observer: sink.value });
		unregister();
		unregister();
		inbox.receiveStreamEvent(event(1));

		expect(inbox.getSnapshot(TURN_ID)).toBeNull();
		expect(sink.applied).toEqual([]);
	});
});
