// apps/worker/tests/agenticChatRealtimeAdapterHealth.test.ts
//
// Realtime health incident 2026-10-17 22:16 UTC: one chat-worker replica
// reported checks.realtime degraded with consecutiveFailures=331 and 0
// channels after a single socket error. These tests drive the installed
// realtime-js RealtimeClient over a fake WebSocket so the SDK's own channel
// lifecycle (error fan-out, synchronous close on unsubscribe, rejoin timers,
// topic reuse) runs for real; only the network is replaced.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import {
	SupabaseAgenticChatBroadcastAdapter,
	type AgenticChatRealtimeClient
} from '../src/workers/agentic-chat/stream/supabase-stream-publisher-adapters';

type PhoenixMessage = {
	topic: string;
	event: string;
	payload: unknown;
	ref: string | null;
	join_ref: string | null;
};

/** A WebSocket that opens at once and answers joins, leaves, and acked broadcasts. */
class FakeSocket {
	static instances: FakeSocket[] = [];
	static failJoins = false;
	readonly sent: PhoenixMessage[] = [];
	readyState = 0;
	onopen: (() => void) | null = null;
	onerror: ((event: unknown) => void) | null = null;
	onmessage: ((event: { data: string }) => void) | null = null;
	onclose: ((event: unknown) => void) | null = null;
	closeCalls = 0;

	constructor(readonly url: string) {
		FakeSocket.instances.push(this);
		queueMicrotask(() => {
			if (this.readyState !== 0) return;
			this.readyState = 1;
			this.onopen?.();
		});
	}

	send(data: string): void {
		const message = JSON.parse(data) as PhoenixMessage;
		this.sent.push(message);
		const status =
			message.event === 'phx_join' && FakeSocket.failJoins ? 'error' : ('ok' as const);
		if (['phx_join', 'phx_leave', 'broadcast', 'heartbeat'].includes(message.event)) {
			queueMicrotask(() => {
				if (this.readyState !== 1) return;
				this.onmessage?.({
					data: JSON.stringify({
						topic: message.topic,
						event: 'phx_reply',
						payload: {
							status,
							response: status === 'ok' ? {} : { reason: 'join refused' }
						},
						ref: message.ref,
						join_ref: message.join_ref
					})
				});
			});
		}
	}

	close(): void {
		this.closeCalls += 1;
		if (this.readyState === 3) return;
		this.readyState = 3;
		queueMicrotask(() => this.onclose?.({ code: 1000, reason: '' }));
	}

	/** The network drops: error, then close, as a real socket reports it. */
	drop(): void {
		this.readyState = 3;
		this.onerror?.({ type: 'error', message: 'socket hang up' });
		this.onclose?.({ code: 1006, reason: '' });
	}

	sentEvents(event: string): PhoenixMessage[] {
		return this.sent.filter((message) => message.event === event);
	}
}

/** A supabase-js client, as production passes it, over the fake socket. */
function supabaseClient() {
	return createClient('https://project.invalid', 'test-key', {
		auth: { persistSession: false, autoRefreshToken: false },
		realtime: { transport: FakeSocket as never, heartbeatIntervalMs: 3_600_000 }
	});
}

type SupabaseTestClient = ReturnType<typeof supabaseClient>;

function adapterFor(
	client: SupabaseTestClient,
	options: ConstructorParameters<typeof SupabaseAgenticChatBroadcastAdapter>[5] = {},
	subscribeTimeoutMs = 1_000
) {
	return new SupabaseAgenticChatBroadcastAdapter(
		client as unknown as AgenticChatRealtimeClient,
		256,
		subscribeTimeoutMs,
		1_000,
		2_000,
		options
	);
}

async function settle(): Promise<void> {
	for (let turn = 0; turn < 5; turn += 1) await new Promise((resolve) => setImmediate(resolve));
}

const hint = (topic: string) =>
	({
		kind: 'reconcile_hint',
		topic,
		event: 'agent-stream-reconcile',
		payload: {
			contract_version: 'agentic_chat_worker_v1',
			turn_run_id: 'turn-1',
			session_id: 'session-1',
			execution_generation: 1,
			durable_through_sequence: 1
		}
	}) as const;

afterEach(() => {
	FakeSocket.instances = [];
	FakeSocket.failJoins = false;
	vi.useRealTimers();
});

describe('Realtime broadcast adapter health over the real SDK', () => {
	it('evicts each cached channel once on a socket drop, without counting a failed attempt', async () => {
		const client = supabaseClient();
		const log = vi.fn();
		const adapter = adapterFor(client, { log });
		try {
			await expect(adapter.publish(hint('chat-user:user-a'))).resolves.toBe('sent');
			await expect(adapter.publish(hint('chat-user:user-b'))).resolves.toBe('sent');
			const socket = FakeSocket.instances[0]!;

			socket.drop();
			await settle();

			// Before the fix each eviction re-entered itself through the SDK's
			// synchronous CLOSED callback until the stack overflowed: two cached
			// channels counted 653 failures here, one counted 331 in production.
			expect(adapter.getHealth()).toMatchObject({
				healthy: true,
				status: 'connected',
				activeChannels: 0,
				consecutiveFailures: 0
			});
			// One leave per evicted channel, queued for the next socket.
			expect(socket.sentEvents('phx_leave').length).toBeLessThanOrEqual(2);
			expect(client.realtime.getChannels()).toHaveLength(0);
			expect(log).toHaveBeenCalledTimes(1);
			expect(log).toHaveBeenCalledWith(
				expect.objectContaining({
					event: 'agentic_chat_realtime_channel_lost',
					status: 'CHANNEL_ERROR',
					topicKind: 'chat-user',
					channelsLostInStreak: 1
				})
			);

			// The next durable event subscribes afresh and is delivered.
			await expect(adapter.publish(hint('chat-user:user-a'))).resolves.toBe('sent');
			expect(adapter.getHealth()).toMatchObject({ status: 'connected', activeChannels: 1 });
		} finally {
			await adapter.close();
			client.realtime.disconnect();
		}
	});

	it('ignores SDK callbacks from a removed channel and never lets them re-enter eviction', async () => {
		const client = supabaseClient();
		const adapter = adapterFor(client);
		const removeChannel = vi.spyOn(client, 'removeChannel');
		try {
			await expect(adapter.publish(hint('chat-user:user-a'))).resolves.toBe('sent');
			// Internal SDK hooks, as its own socket drives them (absent from its types).
			const channel = client.realtime.getChannels()[0] as unknown as {
				_trigger(type: string, payload?: unknown, ref?: string): void;
				_joinRef(): string;
			};
			// The SDK keeps every subscribe callback registered on the channel.
			// Fire its error and close events after removal, as a rejoin would.
			channel._trigger('phx_error', { reason: 'server restart' });
			await settle();
			expect(removeChannel).toHaveBeenCalledTimes(1);
			for (let index = 0; index < 50; index += 1) {
				channel._trigger('phx_error', { reason: 'late' });
				channel._trigger('phx_close', 'leave', channel._joinRef());
			}
			await settle();
			expect(removeChannel).toHaveBeenCalledTimes(1);
			expect(adapter.getHealth()).toMatchObject({
				status: 'connected',
				activeChannels: 0,
				consecutiveFailures: 0
			});
		} finally {
			await adapter.close();
			client.realtime.disconnect();
		}
	});

	it('leaves the queue-wake channel on the shared socket alone when it evicts its own', async () => {
		const client = supabaseClient();
		const adapter = adapterFor(client);
		const wakeStatuses: string[] = [];
		try {
			client
				.channel('agentic-chat-queue:wake', {
					config: { private: true, broadcast: { self: false } }
				})
				.subscribe((status) => wakeStatuses.push(status));
			await settle();
			await expect(adapter.publish(hint('chat-user:user-a'))).resolves.toBe('sent');
			FakeSocket.instances[0]!.drop();
			await settle();
			// The wake listener sees the drop itself; the publisher removed only
			// its own channel.
			expect(wakeStatuses).toEqual(['SUBSCRIBED', 'CHANNEL_ERROR', 'CHANNEL_ERROR']);
			expect(client.realtime.getChannels().map((channel) => channel.topic)).toEqual([
				'realtime:agentic-chat-queue:wake'
			]);
		} finally {
			await adapter.close();
			client.realtime.disconnect();
		}
	});

	it('counts one failure per failed subscription and logs the first and every Nth', async () => {
		const client = supabaseClient();
		const log = vi.fn();
		const adapter = adapterFor(client, { log, failureLogEvery: 3 });
		FakeSocket.failJoins = true;
		try {
			for (let attempt = 0; attempt < 6; attempt += 1) {
				await expect(adapter.publish(hint(`chat-user:user-${attempt}`))).resolves.toBe(
					'failed'
				);
			}
			expect(adapter.getHealth()).toMatchObject({
				healthy: false,
				status: 'degraded',
				activeChannels: 0,
				consecutiveFailures: 6
			});
			const failures = log.mock.calls
				.map(([record]) => record)
				.filter((record) => record.event === 'agentic_chat_realtime_attempt_failed');
			expect(failures.map((record) => record.failuresInStreak)).toEqual([1, 3, 6]);
			expect(failures[0]).toMatchObject({
				phase: 'subscribe',
				status: 'CHANNEL_ERROR',
				error: expect.stringContaining('join refused'),
				socketState: 'open'
			});
			expect(client.realtime.getChannels()).toHaveLength(0);

			FakeSocket.failJoins = false;
			await expect(adapter.publish(hint('chat-user:user-a'))).resolves.toBe('sent');
			expect(adapter.getHealth()).toMatchObject({
				status: 'connected',
				consecutiveFailures: 0
			});
		} finally {
			await adapter.close();
			client.realtime.disconnect();
		}
	});

	it('restarts the socket once per cooldown after subscriptions fail for a minute, then recovers', async () => {
		let nowMs = 0;
		const client = supabaseClient();
		const log = vi.fn();
		const adapter = adapterFor(client, {
			log,
			now: () => nowMs,
			selfHealAfterMs: 60_000,
			selfHealCooldownMs: 300_000
		});
		const wakeStatuses: string[] = [];
		FakeSocket.failJoins = true;
		try {
			client
				.channel('agentic-chat-queue:wake', {
					config: { private: true, broadcast: { self: false } }
				})
				.subscribe((status) => wakeStatuses.push(status));
			await settle();
			const resets = () =>
				log.mock.calls
					.map(([record]) => record)
					.filter((record) => record.event === 'agentic_chat_realtime_connection_reset');

			for (const at of [0, 30_000, 59_999]) {
				nowMs = at;
				await expect(adapter.publish(hint('chat-user:user-a'))).resolves.toBe('failed');
			}
			expect(resets()).toHaveLength(0);

			nowMs = 60_000;
			await expect(adapter.publish(hint('chat-user:user-a'))).resolves.toBe('failed');
			expect(resets()).toEqual([
				expect.objectContaining({
					outcome: 'socket_closed',
					failingForMs: 60_000,
					connectionResets: 1
				})
			]);
			expect(FakeSocket.instances[0]!.closeCalls).toBe(1);
			await settle();
			// The wake channel heard about the restart through the SDK's own path.
			expect(wakeStatuses).toContain('CHANNEL_ERROR');

			// Still failing inside the cooldown: no second restart.
			for (const at of [130_000, 200_000]) {
				nowMs = at;
				await expect(adapter.publish(hint('chat-user:user-a'))).resolves.toBe('failed');
			}
			expect(resets()).toHaveLength(1);

			// Realtime comes back: the next subscription opens a fresh socket.
			FakeSocket.failJoins = false;
			nowMs = 210_000;
			await expect(adapter.publish(hint('chat-user:user-a'))).resolves.toBe('sent');
			expect(FakeSocket.instances.length).toBeGreaterThan(1);
			expect(adapter.getHealth()).toMatchObject({
				status: 'connected',
				consecutiveFailures: 0
			});
		} finally {
			await adapter.close();
			client.realtime.disconnect();
		}
	});

	// Review 2026-10-17: the window used to start at the first failure and end
	// only on a success, so two failures ten minutes apart on a quiet replica
	// counted as "failing for a minute" and bounced every channel.
	it('does not restart the socket for isolated failures far apart', async () => {
		let nowMs = 0;
		const client = supabaseClient();
		const log = vi.fn();
		const adapter = adapterFor(client, {
			log,
			now: () => nowMs,
			selfHealAfterMs: 60_000,
			selfHealCooldownMs: 300_000
		});
		FakeSocket.failJoins = true;
		try {
			for (const at of [0, 600_000, 1_200_000, 1_800_000]) {
				nowMs = at;
				await expect(adapter.publish(hint('chat-user:user-a'))).resolves.toBe('failed');
			}
			expect(
				log.mock.calls
					.map(([record]) => record)
					.filter((record) => record.event === 'agentic_chat_realtime_connection_reset')
			).toHaveLength(0);
		} finally {
			await adapter.close();
			client.realtime.disconnect();
		}
	});

	// Review 2026-10-17 (read from realtime-js 2.89, not reproduced by this fake
	// socket, which settles leaves either way): a leave sent on a socket about
	// to close may never be answered, leaving the topic unusable for the SDK's
	// 10 s leave timeout. The restart now closes first (leaves settle at once)
	// and a reopen waits for its own topic's removal. This pins the behavior.
	it('reopens a cached topic right after a restart', async () => {
		let nowMs = 0;
		const client = supabaseClient();
		const log = vi.fn();
		const adapter = adapterFor(client, {
			log,
			now: () => nowMs,
			selfHealAfterMs: 60_000,
			selfHealCooldownMs: 300_000
		});
		try {
			await expect(adapter.publish(hint('chat-user:user-a'))).resolves.toBe('sent');
			FakeSocket.failJoins = true;
			for (const at of [0, 30_000, 60_000]) {
				nowMs = at;
				await expect(adapter.publish(hint('chat-user:user-b'))).resolves.toBe('failed');
			}
			expect(
				log.mock.calls
					.map(([record]) => record)
					.filter((record) => record.event === 'agentic_chat_realtime_connection_reset')
			).toHaveLength(1);
			FakeSocket.failJoins = false;
			const startedAt = Date.now();
			await expect(adapter.publish(hint('chat-user:user-a'))).resolves.toBe('sent');
			expect(Date.now() - startedAt).toBeLessThan(500);
		} finally {
			await adapter.close();
			client.realtime.disconnect();
		}
	});

	it('never broadcasts an event the publisher has not persisted while the socket restarts', async () => {
		// The adapter only sends what the publisher hands it after a durable
		// receipt; a restart can lose a broadcast (recovered by reconcile) but
		// cannot create one. Every frame on the wire here was published by us.
		const client = supabaseClient();
		const adapter = adapterFor(client, { selfHealAfterMs: 1, selfHealCooldownMs: 1 });
		try {
			await expect(adapter.publish(hint('chat-user:user-a'))).resolves.toBe('sent');
			FakeSocket.instances[0]!.drop();
			await settle();
			await expect(adapter.publish(hint('chat-user:user-a'))).resolves.toBe('sent');
			const broadcasts = FakeSocket.instances.flatMap((socket) =>
				socket.sentEvents('broadcast')
			);
			expect(broadcasts).toHaveLength(2);
		} finally {
			await adapter.close();
			client.realtime.disconnect();
		}
	});
});
