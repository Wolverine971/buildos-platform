// apps/web/src/lib/services/agentic-chat-v2/worker-realtime-channel.test.ts
import {
	AGENTIC_CHAT_REALTIME_RECONCILE_EVENT,
	AGENTIC_CHAT_REALTIME_STREAM_EVENT,
	AGENTIC_CHAT_WORKER_CONTRACT_VERSION,
	type TurnHandleV1
} from '@buildos/shared-types';
import { describe, expect, it, vi } from 'vitest';
import {
	AgenticChatWorkerRealtimeChannel,
	type AgenticChatRealtimeChannelLike,
	type AgenticChatRealtimeClientLike,
	type AgenticChatRealtimeSubscribeStatus
} from './worker-realtime-channel';
import { AgenticChatWorkerRealtimeInbox } from './worker-realtime-inbox';

const USER_ID = 'd1000000-0000-4000-8000-000000000001';
const SESSION_ID = 'd2000000-0000-4000-8000-000000000001';
const TURN_ID = 'd4000000-0000-4000-8000-000000000001';

class FakeChannel implements AgenticChatRealtimeChannelLike {
	readonly handlers = new Map<string, (message: unknown) => void>();
	statusCallback: ((status: AgenticChatRealtimeSubscribeStatus, error?: Error) => void) | null =
		null;

	on(
		_type: 'broadcast',
		filter: { event: string },
		callback: (message: unknown) => void
	): AgenticChatRealtimeChannelLike {
		this.handlers.set(filter.event, callback);
		return this;
	}

	subscribe(
		callback: (status: AgenticChatRealtimeSubscribeStatus, error?: Error) => void
	): AgenticChatRealtimeChannelLike {
		this.statusCallback = callback;
		return this;
	}

	emit(event: string, payload: unknown): void {
		this.handlers.get(event)?.({ payload });
	}

	status(status: AgenticChatRealtimeSubscribeStatus, error?: Error): void {
		this.statusCallback?.(status, error);
	}
}

function harness() {
	const channels: FakeChannel[] = [];
	const channelCalls: Array<{ topic: string; options: unknown }> = [];
	const removed: FakeChannel[] = [];
	const client: AgenticChatRealtimeClientLike = {
		channel: (topic, options) => {
			channelCalls.push({ topic, options });
			const channel = new FakeChannel();
			channels.push(channel);
			return channel;
		},
		removeChannel: async (channel) => {
			removed.push(channel as FakeChannel);
		}
	};
	const reasons: string[] = [];
	const applied: number[] = [];
	const inbox = new AgenticChatWorkerRealtimeInbox();
	const handle: Extract<TurnHandleV1, { executionMode: 'worker_realtime' }> = {
		contractVersion: AGENTIC_CHAT_WORKER_CONTRACT_VERSION,
		executionMode: 'worker_realtime',
		turnRunId: TURN_ID,
		sessionId: SESSION_ID,
		streamRunId: 'worker-stream-1',
		clientTurnId: 'worker-client-1'
	};
	inbox.registerTurn({
		handle,
		observer: {
			applyLiveEvent: (event) => applied.push(event.sequence_index),
			applyReconciliation: vi.fn(),
			requestReconciliation: (request) => reasons.push(request.reason)
		}
	});
	const statuses: string[] = [];
	const transport = new AgenticChatWorkerRealtimeChannel(client, inbox, (status) =>
		statuses.push(status)
	);
	return {
		transport,
		inbox,
		channels,
		channelCalls,
		removed,
		reasons,
		applied,
		statuses
	};
}

function receipt(watermark: number) {
	return {
		outcome: 'reconciled',
		contract_version: AGENTIC_CHAT_WORKER_CONTRACT_VERSION,
		turn_run_id: TURN_ID,
		session_id: SESSION_ID,
		user_id: USER_ID,
		stream_run_id: 'worker-stream-1',
		client_turn_id: 'worker-client-1',
		execution_mode: 'worker_realtime',
		requested_execution_generation: 1,
		execution_generation: 1,
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
		updated_at: '2026-08-02T23:00:00.000Z'
	};
}

describe('AgenticChatWorkerRealtimeChannel', () => {
	it('opens one exact private user channel with both shared Broadcast event names', async () => {
		const h = harness();
		await Promise.all([h.transport.connect(USER_ID), h.transport.connect(USER_ID)]);

		expect(h.channelCalls).toEqual([
			{
				topic: `chat-user:${USER_ID}`,
				options: { config: { private: true, broadcast: { self: false } } }
			}
		]);
		expect([...h.channels[0]!.handlers.keys()]).toEqual([
			AGENTIC_CHAT_REALTIME_STREAM_EVENT,
			AGENTIC_CHAT_REALTIME_RECONCILE_EVENT
		]);
		expect(h.transport.status).toBe('connecting');
		h.channels[0]!.status('SUBSCRIBED');
		expect(h.transport.status).toBe('subscribed');
	});

	it('forwards scoped payloads and ignores late callbacks after close', async () => {
		const h = harness();
		await h.transport.connect(USER_ID);
		const channel = h.channels[0]!;
		channel.status('SUBSCRIBED');
		channel.emit(AGENTIC_CHAT_REALTIME_STREAM_EVENT, {
			contract_version: AGENTIC_CHAT_WORKER_CONTRACT_VERSION,
			event_id: `${TURN_ID}:1:1`,
			stream_run_id: 'worker-stream-1',
			client_turn_id: 'worker-client-1',
			session_id: SESSION_ID,
			turn_run_id: TURN_ID,
			execution_generation: 1,
			sequence_index: 1,
			phase: 'stream',
			event_type: 'text_delta',
			durable: true,
			type: 'text_delta',
			text_delta: 'hello'
		});
		expect(h.inbox.getSnapshot(TURN_ID)?.bufferedEvents).toBe(1);

		await h.transport.close();
		channel.emit(AGENTIC_CHAT_REALTIME_STREAM_EVENT, {
			turn_run_id: TURN_ID
		});
		expect(h.removed).toEqual([channel]);
		expect(h.transport.status).toBe('closed');
		expect(h.inbox.getSnapshot(TURN_ID)?.bufferedEvents).toBe(1);
	});

	it('forces durable convergence across channel loss and rejoin', async () => {
		const h = harness();
		await h.transport.connect(USER_ID);
		const channel = h.channels[0]!;
		channel.status('SUBSCRIBED');
		h.inbox.applyReconciliation(TURN_ID, receipt(0));
		channel.status('CHANNEL_ERROR', new Error('offline'));
		expect(h.transport.status).toBe('unavailable');
		expect(h.reasons).toEqual(['initial', 'channel_unavailable']);

		h.inbox.applyReconciliation(TURN_ID, receipt(0));
		channel.status('SUBSCRIBED');
		expect(h.reasons).toEqual(['initial', 'channel_unavailable', 'channel_reconnected']);
		expect(h.transport.status).toBe('subscribed');
	});

	it('replaces a terminally closed channel once and close cancels that retry', async () => {
		vi.useFakeTimers();
		try {
			const h = harness();
			await h.transport.connect(USER_ID);
			const first = h.channels[0]!;
			first.status('SUBSCRIBED');
			h.inbox.applyReconciliation(TURN_ID, receipt(0));
			first.status('CLOSED');

			await vi.advanceTimersByTimeAsync(1_000);
			expect(h.channelCalls).toHaveLength(2);
			expect(h.removed).toEqual([]);
			const second = h.channels[1]!;
			h.inbox.applyReconciliation(TURN_ID, receipt(0));
			second.status('SUBSCRIBED');
			expect(h.reasons).toEqual(['initial', 'channel_unavailable', 'channel_reconnected']);

			second.status('CLOSED');
			await h.transport.close();
			await vi.advanceTimersByTimeAsync(1_000);
			expect(h.channelCalls).toHaveLength(2);
			expect(h.transport.status).toBe('closed');
		} finally {
			vi.useRealTimers();
		}
	});

	it('rejects malformed user topics before opening a channel', async () => {
		const h = harness();
		await expect(h.transport.connect('not-a-user')).rejects.toThrow(
			'Invalid Agentic Chat Realtime user id'
		);
		expect(h.channelCalls).toEqual([]);
	});
});
