// apps/web/src/lib/services/agentic-chat-v2/worker-realtime-runtime.test.ts
import { describe, expect, it, vi } from 'vitest';
import type {
	AgenticChatRealtimeChannelLike,
	AgenticChatRealtimeSubscribeStatus
} from './worker-realtime-channel';
import {
	AgenticChatWorkerRealtimeRuntime,
	type AgenticChatWorkerRealtimeRuntimeClient
} from './worker-realtime-runtime';

const USER_ID = 'd1000000-0000-4000-8000-000000000001';
const OTHER_USER_ID = 'd1000000-0000-4000-8000-000000000002';

class FakeChannel implements AgenticChatRealtimeChannelLike {
	statusCallback: ((status: AgenticChatRealtimeSubscribeStatus, error?: Error) => void) | null =
		null;

	on(): AgenticChatRealtimeChannelLike {
		return this;
	}

	subscribe(
		callback: (status: AgenticChatRealtimeSubscribeStatus, error?: Error) => void
	): AgenticChatRealtimeChannelLike {
		this.statusCallback = callback;
		return this;
	}

	status(status: AgenticChatRealtimeSubscribeStatus, error?: Error): void {
		this.statusCallback?.(status, error);
	}
}

class FakeEventTarget {
	visibilityState = 'visible';
	readonly listeners = new Map<string, Set<EventListener>>();

	addEventListener(type: string, listener: EventListener): void {
		const listeners = this.listeners.get(type) ?? new Set<EventListener>();
		listeners.add(listener);
		this.listeners.set(type, listeners);
	}

	removeEventListener(type: string, listener: EventListener): void {
		this.listeners.get(type)?.delete(listener);
	}

	dispatch(type: string): void {
		for (const listener of this.listeners.get(type) ?? []) listener(new Event(type));
	}
}

function harness(
	initialUserId: string | null = USER_ID,
	options: { authSubscribeError?: Error; synchronousAuthUserId?: string } = {}
) {
	const channels: Array<{ topic: string; channel: FakeChannel }> = [];
	const removed: FakeChannel[] = [];
	let authCallback: ((event: string, session: { user: { id: string } } | null) => void) | null =
		null;
	const unsubscribe = vi.fn();
	const getUser = vi.fn(async () => ({
		data: { user: initialUserId ? { id: initialUserId } : null },
		error: null
	}));
	const client: AgenticChatWorkerRealtimeRuntimeClient = {
		channel: (topic) => {
			const channel = new FakeChannel();
			channels.push({ topic, channel });
			return channel;
		},
		removeChannel: async (channel) => {
			removed.push(channel as FakeChannel);
		},
		auth: {
			getUser,
			onAuthStateChange: (callback) => {
				if (options.authSubscribeError) throw options.authSubscribeError;
				authCallback = callback;
				if (options.synchronousAuthUserId) {
					callback('SIGNED_IN', { user: { id: options.synchronousAuthUserId } });
				}
				return { data: { subscription: { unsubscribe } } };
			}
		}
	};
	const windowTarget = new FakeEventTarget();
	const documentTarget = new FakeEventTarget();
	const errors: unknown[] = [];
	const userChanges: Array<string | null> = [];
	const runtime = new AgenticChatWorkerRealtimeRuntime({
		client,
		windowTarget,
		documentTarget,
		onUserChange: (userId) => userChanges.push(userId),
		onError: (error) => errors.push(error)
	});
	return {
		runtime,
		channels,
		removed,
		getUser,
		unsubscribe,
		windowTarget,
		documentTarget,
		errors,
		userChanges,
		auth(event: string, userId: string | null) {
			authCallback?.(event, userId ? { user: { id: userId } } : null);
		}
	};
}

async function flushAsync(): Promise<void> {
	for (let index = 0; index < 10; index += 1) await Promise.resolve();
}

describe('AgenticChatWorkerRealtimeRuntime', () => {
	it('mounts one authenticated user channel and follows auth identity changes', async () => {
		const h = harness();
		const clearTurns = vi.spyOn(h.runtime.coordinator, 'clearTurns');
		await h.runtime.start();
		expect(h.channels.map((item) => item.topic)).toEqual([`chat-user:${USER_ID}`]);
		h.channels[0]!.channel.status('SUBSCRIBED');
		expect(h.runtime.status).toBe('subscribed');
		expect(h.runtime.userId).toBe(USER_ID);

		h.auth('TOKEN_REFRESHED', USER_ID);
		await flushAsync();
		expect(h.channels).toHaveLength(1);
		expect(clearTurns).not.toHaveBeenCalled();

		h.auth('SIGNED_IN', OTHER_USER_ID);
		await flushAsync();
		expect(h.channels.map((item) => item.topic)).toEqual([
			`chat-user:${USER_ID}`,
			`chat-user:${OTHER_USER_ID}`
		]);
		expect(h.removed).toEqual([h.channels[0]!.channel]);
		expect(clearTurns).toHaveBeenCalledTimes(1);

		h.auth('SIGNED_OUT', null);
		await flushAsync();
		expect(h.runtime.userId).toBeNull();
		expect(h.runtime.status).toBe('closed');
		expect(h.runtime.coordinator.running).toBe(false);
		expect(clearTurns).toHaveBeenCalledTimes(2);
		expect(h.userChanges).toEqual([USER_ID, OTHER_USER_ID, null]);
		await h.runtime.stop();
	});

	it('requests convergence on online and visible-tab wake', async () => {
		const h = harness();
		const requestAll = vi.spyOn(h.runtime.coordinator, 'requestAll');
		await h.runtime.start();

		h.windowTarget.dispatch('online');
		expect(requestAll).toHaveBeenCalledWith('watchdog');

		h.documentTarget.visibilityState = 'hidden';
		h.documentTarget.dispatch('visibilitychange');
		expect(requestAll).toHaveBeenCalledTimes(1);
		h.documentTarget.visibilityState = 'visible';
		h.documentTarget.dispatch('visibilitychange');
		expect(requestAll).toHaveBeenCalledTimes(2);
		await h.runtime.stop();
	});

	it('keeps reconciliation paused until an authenticated user is established', async () => {
		const h = harness(null);
		await h.runtime.start();

		expect(h.runtime.userId).toBeNull();
		expect(h.runtime.coordinator.running).toBe(false);
		expect(h.channels).toHaveLength(0);

		h.auth('SIGNED_IN', USER_ID);
		await flushAsync();
		expect(h.runtime.coordinator.running).toBe(true);
		expect(h.channels.map((item) => item.topic)).toEqual([`chat-user:${USER_ID}`]);
		await h.runtime.stop();
	});

	it('fails closed for a malformed authenticated user id', async () => {
		const h = harness('not-a-user');
		await h.runtime.start();

		expect(h.runtime.userId).toBeNull();
		expect(h.runtime.coordinator.running).toBe(false);
		expect(h.channels).toHaveLength(0);
		expect(h.errors).toHaveLength(1);
		await h.runtime.stop();
	});

	it('cleans up a partial mount when auth subscription setup throws', async () => {
		const h = harness(USER_ID, { authSubscribeError: new Error('auth unavailable') });
		await h.runtime.start();

		expect(h.runtime.started).toBe(false);
		expect(h.getUser).not.toHaveBeenCalled();
		expect(h.windowTarget.listeners.get('online')?.size ?? 0).toBe(0);
		expect(h.documentTarget.listeners.get('visibilitychange')?.size ?? 0).toBe(0);
		expect(h.runtime.status).toBe('closed');
		expect(h.errors).toHaveLength(1);
	});

	it('tears down auth, wake listeners, coordinator work, and the exact channel', async () => {
		const h = harness();
		await Promise.all([h.runtime.start(), h.runtime.start()]);
		expect(h.getUser).toHaveBeenCalledOnce();
		expect(h.windowTarget.listeners.get('online')?.size).toBe(1);
		expect(h.documentTarget.listeners.get('visibilitychange')?.size).toBe(1);

		await h.runtime.stop();
		expect(h.unsubscribe).toHaveBeenCalledOnce();
		expect(h.windowTarget.listeners.get('online')?.size).toBe(0);
		expect(h.documentTarget.listeners.get('visibilitychange')?.size).toBe(0);
		expect(h.removed).toEqual([h.channels[0]!.channel]);
		expect(h.runtime.coordinator.running).toBe(false);
		expect(h.userChanges).toEqual([USER_ID, null]);

		h.auth('SIGNED_IN', OTHER_USER_ID);
		await flushAsync();
		expect(h.channels).toHaveLength(1);
	});

	it('ignores a stale initial auth result after a newer auth event', async () => {
		let resolveUser!: (value: { data: { user: { id: string } | null }; error: null }) => void;
		const h = harness();
		h.getUser.mockImplementationOnce(() => new Promise((resolve) => (resolveUser = resolve)));
		const start = h.runtime.start();
		h.auth('SIGNED_IN', OTHER_USER_ID);
		await flushAsync();
		resolveUser({ data: { user: { id: USER_ID } }, error: null });
		await start;

		expect(h.channels.map((item) => item.topic)).toEqual([`chat-user:${OTHER_USER_ID}`]);
		expect(h.runtime.userId).toBe(OTHER_USER_ID);
		await h.runtime.stop();
	});

	it('fences an initial lookup when auth emits synchronously during subscription', async () => {
		const h = harness(USER_ID, { synchronousAuthUserId: OTHER_USER_ID });
		await h.runtime.start();

		expect(h.channels.map((item) => item.topic)).toEqual([`chat-user:${OTHER_USER_ID}`]);
		expect(h.runtime.userId).toBe(OTHER_USER_ID);
		await h.runtime.stop();
	});
});
