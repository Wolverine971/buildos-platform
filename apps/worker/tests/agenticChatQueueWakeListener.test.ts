// apps/worker/tests/agenticChatQueueWakeListener.test.ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	AGENTIC_CHAT_QUEUE_WAKE_EVENT,
	AGENTIC_CHAT_QUEUE_WAKE_TOPIC,
	AgenticChatQueueWakeListener,
	agenticChatQueueWakeEnabled,
	type AgenticChatQueueWakeChannel,
	type AgenticChatQueueWakeRealtimeClient
} from '../src/workers/agentic-chat/queueWakeListener';

type Status = 'SUBSCRIBED' | 'TIMED_OUT' | 'CLOSED' | 'CHANNEL_ERROR';

class FakeChannel implements AgenticChatQueueWakeChannel {
	readonly handlers: Array<{ event: string; callback: (message: unknown) => void }> = [];
	statusCallback: ((status: Status, error?: Error) => void) | null = null;

	on(
		_type: 'broadcast',
		filter: { event: string },
		callback: (message: unknown) => void
	): AgenticChatQueueWakeChannel {
		this.handlers.push({ event: filter.event, callback });
		return this;
	}

	subscribe(callback: (status: Status, error?: Error) => void): AgenticChatQueueWakeChannel {
		this.statusCallback = callback;
		return this;
	}

	status(status: Status, error?: Error): void {
		this.statusCallback?.(status, error);
	}

	broadcast(event = AGENTIC_CHAT_QUEUE_WAKE_EVENT): void {
		for (const handler of this.handlers) {
			if (handler.event === event) handler.callback({ event, payload: { v: 1 } });
		}
	}
}

function fakeClient() {
	const channels: FakeChannel[] = [];
	const removed: FakeChannel[] = [];
	const channelCalls: Array<{ topic: string; options: unknown }> = [];
	const client: AgenticChatQueueWakeRealtimeClient = {
		channel: (topic, options) => {
			channelCalls.push({ topic, options });
			const channel = new FakeChannel();
			channels.push(channel);
			return channel;
		},
		removeChannel: async (channel) => {
			removed.push(channel as FakeChannel);
			return 'ok';
		}
	};
	return { client, channels, removed, channelCalls };
}

async function settle(): Promise<void> {
	for (let index = 0; index < 20; index += 1) await Promise.resolve();
}

afterEach(() => {
	vi.useRealTimers();
});

describe('Agentic Chat queue wake listener', () => {
	it('keeps the topic contract web admission publishes to', () => {
		// Must match apps/web/src/lib/services/agentic-chat-v2/worker-queue-wake.server.ts.
		expect(AGENTIC_CHAT_QUEUE_WAKE_TOPIC).toBe('agentic-chat-queue:wake');
		expect(AGENTIC_CHAT_QUEUE_WAKE_EVENT).toBe('wake');
	});

	it('subscribes to the private wake topic and claims on each wake', async () => {
		const fake = fakeClient();
		const onWake = vi.fn(async () => undefined);
		const listener = new AgenticChatQueueWakeListener({ client: fake.client, log: vi.fn() });

		listener.start(onWake);
		await settle();
		expect(fake.channelCalls).toEqual([
			{
				topic: 'agentic-chat-queue:wake',
				options: { config: { private: true, broadcast: { self: false } } }
			}
		]);
		fake.channels[0]!.status('SUBSCRIBED');
		expect(listener.getHealth().status).toBe('subscribed');
		// The first subscription follows the queue's own startup claim.
		expect(onWake).not.toHaveBeenCalled();

		fake.channels[0]!.broadcast();
		await settle();
		expect(onWake).toHaveBeenCalledOnce();
		fake.channels[0]!.broadcast('some-other-event');
		await settle();
		expect(onWake).toHaveBeenCalledOnce();
		expect(listener.getHealth()).toMatchObject({
			wakesReceived: 1,
			consecutiveFailures: 0,
			lastWakeAt: expect.any(String)
		});
		await listener.stop();
	});

	it('coalesces a burst into one running claim plus one follow-up', async () => {
		const fake = fakeClient();
		const releases: Array<() => void> = [];
		const onWake = vi.fn(() => new Promise<void>((resolve) => releases.push(resolve)));
		const listener = new AgenticChatQueueWakeListener({ client: fake.client, log: vi.fn() });
		listener.start(onWake);
		await settle();
		fake.channels[0]!.status('SUBSCRIBED');

		for (let index = 0; index < 25; index += 1) fake.channels[0]!.broadcast();
		await settle();
		expect(onWake).toHaveBeenCalledOnce();

		releases.shift()!();
		await settle();
		// Every received wake is followed by a claim that started after it.
		expect(onWake).toHaveBeenCalledTimes(2);
		releases.shift()!();
		await settle();
		expect(onWake).toHaveBeenCalledTimes(2);
		expect(listener.getHealth()).toMatchObject({ wakesReceived: 25, wakesCoalesced: 23 });
		await listener.stop();
	});

	it('keeps serving wakes after a claim failure without an unhandled rejection', async () => {
		const fake = fakeClient();
		const log = vi.fn();
		const onWake = vi
			.fn<() => Promise<void>>()
			.mockRejectedValueOnce(new Error('claim rpc unavailable'))
			.mockResolvedValue(undefined);
		const listener = new AgenticChatQueueWakeListener({ client: fake.client, log });
		listener.start(onWake);
		await settle();
		fake.channels[0]!.status('SUBSCRIBED');

		fake.channels[0]!.broadcast();
		await settle();
		fake.channels[0]!.broadcast();
		await settle();
		expect(onWake).toHaveBeenCalledTimes(2);
		expect(log).toHaveBeenCalledWith(
			expect.objectContaining({
				event: 'agentic_chat_queue_wake_claim_failed',
				error: 'claim rpc unavailable'
			})
		);
		await listener.stop();
	});

	it('re-subscribes with capped backoff after channel errors and catches up once', async () => {
		vi.useFakeTimers();
		const fake = fakeClient();
		const log = vi.fn();
		const onWake = vi.fn(async () => undefined);
		const listener = new AgenticChatQueueWakeListener({
			client: fake.client,
			retryBaseMs: 1_000,
			retryMaxMs: 4_000,
			log
		});
		listener.start(onWake);
		await settle();
		fake.channels[0]!.status('SUBSCRIBED');

		fake.channels[0]!.status('CHANNEL_ERROR', new Error('socket dropped'));
		await settle();
		expect(listener.getHealth()).toMatchObject({ status: 'retrying', consecutiveFailures: 1 });
		expect(fake.removed).toEqual([fake.channels[0]]);
		expect(log).toHaveBeenCalledWith(
			expect.objectContaining({
				event: 'agentic_chat_queue_wake_channel_degraded',
				status: 'CHANNEL_ERROR',
				retryInMs: 1_000
			})
		);
		// The failed channel is fenced: its late callbacks cannot wake or flap state.
		fake.channels[0]!.broadcast();
		fake.channels[0]!.status('SUBSCRIBED');
		await settle();
		expect(onWake).not.toHaveBeenCalled();
		expect(listener.getHealth().status).toBe('retrying');

		await vi.advanceTimersByTimeAsync(999);
		expect(fake.channels).toHaveLength(1);
		await vi.advanceTimersByTimeAsync(1);
		await settle();
		expect(fake.channels).toHaveLength(2);
		fake.channels[1]!.status('TIMED_OUT');
		await settle();
		expect(listener.getHealth().consecutiveFailures).toBe(2);
		await vi.advanceTimersByTimeAsync(2_000);
		await settle();
		fake.channels[2]!.status('CLOSED');
		await settle();
		await vi.advanceTimersByTimeAsync(4_000);
		await settle();
		fake.channels[3]!.status('CHANNEL_ERROR');
		await settle();
		// Capped at retryMaxMs.
		expect(log).toHaveBeenLastCalledWith(expect.objectContaining({ retryInMs: 4_000 }));
		await vi.advanceTimersByTimeAsync(4_000);
		await settle();

		fake.channels[4]!.status('SUBSCRIBED');
		await settle();
		expect(listener.getHealth()).toMatchObject({
			status: 'subscribed',
			consecutiveFailures: 0
		});
		// Wakes published while unsubscribed are gone; one catch-up claim covers them.
		expect(onWake).toHaveBeenCalledOnce();
		fake.channels[4]!.broadcast();
		await settle();
		expect(onWake).toHaveBeenCalledTimes(2);
		await listener.stop();
	});

	it('survives a client that throws while creating the channel', async () => {
		vi.useFakeTimers();
		const fake = fakeClient();
		let failures = 1;
		const client: AgenticChatQueueWakeRealtimeClient = {
			channel: (topic, options) => {
				if (failures-- > 0) throw new Error('realtime unavailable');
				return fake.client.channel(topic, options);
			},
			removeChannel: fake.client.removeChannel
		};
		const listener = new AgenticChatQueueWakeListener({ client, log: vi.fn() });

		expect(() => listener.start(vi.fn())).not.toThrow();
		await settle();
		expect(listener.getHealth()).toMatchObject({ status: 'retrying', consecutiveFailures: 1 });
		await vi.advanceTimersByTimeAsync(1_000);
		await settle();
		expect(fake.channels).toHaveLength(1);
		fake.channels[0]!.status('SUBSCRIBED');
		expect(listener.getHealth().status).toBe('subscribed');
		await listener.stop();
	});

	it('stops cleanly: removes the channel, cancels retries, and ignores late wakes', async () => {
		vi.useFakeTimers();
		const fake = fakeClient();
		const onWake = vi.fn(async () => undefined);
		const listener = new AgenticChatQueueWakeListener({ client: fake.client, log: vi.fn() });
		listener.start(onWake);
		await settle();
		fake.channels[0]!.status('CHANNEL_ERROR');
		await settle();

		await listener.stop();
		await vi.advanceTimersByTimeAsync(60_000);
		expect(fake.channels).toHaveLength(1);
		expect(listener.getHealth().status).toBe('stopped');

		const second = fakeClient();
		const stopped = new AgenticChatQueueWakeListener({ client: second.client, log: vi.fn() });
		stopped.start(onWake);
		await settle();
		second.channels[0]!.status('SUBSCRIBED');
		await stopped.stop();
		expect(second.removed).toEqual([second.channels[0]]);
		second.channels[0]!.broadcast();
		await settle();
		expect(onWake).not.toHaveBeenCalled();
		stopped.start(onWake);
		await settle();
		expect(second.channels).toHaveLength(1);
	});

	it('honors the AGENTIC_CHAT_QUEUE_WAKE kill switch', () => {
		expect(agenticChatQueueWakeEnabled({})).toBe(true);
		expect(agenticChatQueueWakeEnabled({ AGENTIC_CHAT_QUEUE_WAKE: 'on' })).toBe(true);
		for (const value of ['off', 'OFF', 'false', '0', ' disabled ']) {
			expect(agenticChatQueueWakeEnabled({ AGENTIC_CHAT_QUEUE_WAKE: value })).toBe(false);
		}
	});
});
