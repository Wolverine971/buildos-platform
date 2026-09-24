// apps/web/src/lib/services/agentic-chat-v2/worker-queue-wake.server.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const dynamicEnv = vi.hoisted(() => ({ env: {} as Record<string, string | undefined> }));
vi.mock('$env/static/public', () => ({ PUBLIC_SUPABASE_URL: 'https://project.supabase.co' }));
vi.mock('$env/static/private', () => ({ PRIVATE_SUPABASE_SERVICE_KEY: 'service-role-key' }));
vi.mock('$env/dynamic/private', () => dynamicEnv);

import {
	AGENTIC_CHAT_QUEUE_WAKE_ABORT_MS,
	AGENTIC_CHAT_QUEUE_WAKE_EVENT,
	AGENTIC_CHAT_QUEUE_WAKE_TIMEOUT_MS,
	AGENTIC_CHAT_QUEUE_WAKE_TOPIC,
	createAgenticChatWorkerQueueWake,
	resetAgenticChatWorkerQueueWakeForTests,
	wakeAgenticChatWorkerQueue
} from './worker-queue-wake.server';

function accepted(): Response {
	return new Response(null, { status: 202 });
}

/** A fetch that accepts the wake after `delayMs`, unless its signal aborts first. */
function slowFetch(delayMs: number) {
	return vi.fn(
		(_input: RequestInfo | URL, init?: RequestInit) =>
			new Promise<Response>((resolve, reject) => {
				const timer = setTimeout(() => resolve(accepted()), delayMs);
				init?.signal?.addEventListener(
					'abort',
					() => {
						clearTimeout(timer);
						reject(new DOMException('Aborted', 'AbortError'));
					},
					{ once: true }
				);
			})
	);
}

/** A fetch that only settles when its request signal aborts. */
function hangingFetch() {
	return vi.fn(
		(_input: RequestInfo | URL, init?: RequestInit) =>
			new Promise<Response>((_resolve, reject) => {
				init?.signal?.addEventListener(
					'abort',
					() => reject(new DOMException('Aborted', 'AbortError')),
					{ once: true }
				);
			})
	);
}

beforeEach(() => {
	resetAgenticChatWorkerQueueWakeForTests();
	dynamicEnv.env = {};
});

afterEach(() => {
	vi.useRealTimers();
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe('Agentic Chat worker queue wake', () => {
	it('keeps the topic contract the worker subscribes to', () => {
		// Must match apps/worker/src/workers/agentic-chat/host/queue-wake-listener.ts.
		expect(AGENTIC_CHAT_QUEUE_WAKE_TOPIC).toBe('agentic-chat-queue:wake');
		expect(AGENTIC_CHAT_QUEUE_WAKE_EVENT).toBe('wake');
		expect(AGENTIC_CHAT_QUEUE_WAKE_TIMEOUT_MS).toBeLessThanOrEqual(150);
		expect(AGENTIC_CHAT_QUEUE_WAKE_ABORT_MS).toBeGreaterThan(
			AGENTIC_CHAT_QUEUE_WAKE_TIMEOUT_MS
		);
	});

	it('publishes one private, data-free Broadcast through the Realtime REST endpoint', async () => {
		const fetchImpl = vi.fn(async () => accepted());
		const wake = createAgenticChatWorkerQueueWake({
			supabaseUrl: 'https://project.supabase.co',
			serviceKey: 'service-role-key',
			fetchImpl: fetchImpl as typeof fetch
		});

		await expect(wake()).resolves.toBe('sent');
		expect(fetchImpl).toHaveBeenCalledOnce();
		const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
		expect(url).toBe('https://project.supabase.co/realtime/v1/api/broadcast');
		expect(init.method).toBe('POST');
		expect(init.headers).toEqual({
			apikey: 'service-role-key',
			Authorization: 'Bearer service-role-key',
			'Content-Type': 'application/json'
		});
		expect(JSON.parse(String(init.body))).toEqual({
			messages: [
				{
					topic: 'agentic-chat-queue:wake',
					event: 'wake',
					payload: { v: 1 },
					private: true
				}
			]
		});
		expect(init.signal).toBeInstanceOf(AbortSignal);
	});

	it('stops waiting at the deadline but lets a slow wake finish in the background', async () => {
		vi.useFakeTimers();
		const fetchImpl = slowFetch(400);
		const keepAlive = vi.fn();
		const wake = createAgenticChatWorkerQueueWake({
			supabaseUrl: 'https://project.supabase.co/',
			serviceKey: 'service-role-key',
			fetchImpl: fetchImpl as typeof fetch,
			timeoutMs: 150,
			keepAlive
		});

		let settled: string | null = null;
		void wake().then((outcome) => (settled = outcome));
		await vi.advanceTimersByTimeAsync(149);
		expect(settled).toBeNull();
		await vi.advanceTimersByTimeAsync(1);
		// Admission stops waiting at 150 ms, but the request is not cancelled.
		expect(settled).toBe('timed_out');
		const init = fetchImpl.mock.calls[0]?.[1] as RequestInit;
		expect(init.signal?.aborted).toBe(false);
		expect(keepAlive).toHaveBeenCalledOnce();

		let background: string | null = null;
		void (keepAlive.mock.calls[0]?.[0] as Promise<string>).then(
			(outcome) => (background = outcome)
		);
		await vi.advanceTimersByTimeAsync(250);
		expect(background).toBe('sent');
		expect(init.signal?.aborted).toBe(false);
		// The safety timer was cleared when the wake landed.
		await vi.advanceTimersByTimeAsync(AGENTIC_CHAT_QUEUE_WAKE_ABORT_MS);
		expect(init.signal?.aborted).toBe(false);
	});

	it('aborts a wake that never completes at the safety bound', async () => {
		vi.useFakeTimers();
		const fetchImpl = hangingFetch();
		const keepAlive = vi.fn();
		const wake = createAgenticChatWorkerQueueWake({
			supabaseUrl: 'https://project.supabase.co',
			serviceKey: 'service-role-key',
			fetchImpl: fetchImpl as typeof fetch,
			keepAlive
		});

		const outcome = wake();
		await vi.advanceTimersByTimeAsync(AGENTIC_CHAT_QUEUE_WAKE_TIMEOUT_MS);
		await expect(outcome).resolves.toBe('timed_out');
		const init = fetchImpl.mock.calls[0]?.[1] as RequestInit;
		expect(init.signal?.aborted).toBe(false);

		let background: string | null = null;
		void (keepAlive.mock.calls[0]?.[0] as Promise<string>).then(
			(outcome) => (background = outcome)
		);
		await vi.advanceTimersByTimeAsync(
			AGENTIC_CHAT_QUEUE_WAKE_ABORT_MS - AGENTIC_CHAT_QUEUE_WAKE_TIMEOUT_MS - 1
		);
		expect(init.signal?.aborted).toBe(false);
		expect(background).toBeNull();
		await vi.advanceTimersByTimeAsync(1);
		expect(init.signal?.aborted).toBe(true);
		expect(background).toBe('timed_out');
	});

	it('settles the kept-alive wake at the safety bound even if fetch ignores the abort', async () => {
		vi.useFakeTimers();
		const keepAlive = vi.fn();
		const wake = createAgenticChatWorkerQueueWake({
			supabaseUrl: 'https://project.supabase.co',
			serviceKey: 'service-role-key',
			fetchImpl: vi.fn(() => new Promise<Response>(() => undefined)) as typeof fetch,
			keepAlive
		});

		void wake();
		await vi.advanceTimersByTimeAsync(AGENTIC_CHAT_QUEUE_WAKE_TIMEOUT_MS);
		let background: string | null = null;
		void (keepAlive.mock.calls[0]?.[0] as Promise<string>).then(
			(outcome) => (background = outcome)
		);
		await vi.advanceTimersByTimeAsync(AGENTIC_CHAT_QUEUE_WAKE_ABORT_MS);
		expect(background).toBe('timed_out');
	});

	it('keeps nothing alive and aborts nothing after a wake that lands in time', async () => {
		vi.useFakeTimers();
		const fetchImpl = slowFetch(20);
		const keepAlive = vi.fn();
		const wake = createAgenticChatWorkerQueueWake({
			supabaseUrl: 'https://project.supabase.co',
			serviceKey: 'service-role-key',
			fetchImpl: fetchImpl as typeof fetch,
			keepAlive
		});

		const outcome = wake();
		await vi.advanceTimersByTimeAsync(20);
		await expect(outcome).resolves.toBe('sent');
		await vi.advanceTimersByTimeAsync(AGENTIC_CHAT_QUEUE_WAKE_ABORT_MS);
		expect(keepAlive).not.toHaveBeenCalled();
		expect((fetchImpl.mock.calls[0]?.[1] as RequestInit).signal?.aborted).toBe(false);
	});

	it('never waits longer than the reviewed bound even when asked to', async () => {
		vi.useFakeTimers();
		const wake = createAgenticChatWorkerQueueWake({
			supabaseUrl: 'https://project.supabase.co',
			serviceKey: 'service-role-key',
			fetchImpl: hangingFetch() as typeof fetch,
			timeoutMs: 10_000,
			keepAlive: vi.fn()
		});

		let settled: string | null = null;
		void wake().then((outcome) => (settled = outcome));
		await vi.advanceTimersByTimeAsync(AGENTIC_CHAT_QUEUE_WAKE_TIMEOUT_MS);
		expect(settled).toBe('timed_out');
	});

	it('reports rejection, network failure, and missing configuration without throwing', async () => {
		const rejected = createAgenticChatWorkerQueueWake({
			supabaseUrl: 'https://project.supabase.co',
			serviceKey: 'service-role-key',
			fetchImpl: vi.fn(async () => new Response('nope', { status: 403 })) as typeof fetch
		});
		await expect(rejected()).resolves.toBe('rejected');

		const failing = createAgenticChatWorkerQueueWake({
			supabaseUrl: 'https://project.supabase.co',
			serviceKey: 'service-role-key',
			fetchImpl: vi.fn(() => {
				throw new TypeError('fetch failed');
			}) as typeof fetch
		});
		await expect(failing()).resolves.toBe('failed');

		const fetchImpl = vi.fn();
		for (const options of [
			{ supabaseUrl: undefined, serviceKey: 'service-role-key' },
			{ supabaseUrl: 'not a url', serviceKey: 'service-role-key' },
			{ supabaseUrl: 'https://project.supabase.co', serviceKey: ' ' }
		]) {
			const wake = createAgenticChatWorkerQueueWake({
				...options,
				fetchImpl: fetchImpl as typeof fetch
			});
			await expect(wake()).resolves.toBe('not_configured');
		}
		expect(fetchImpl).not.toHaveBeenCalled();
	});

	it('sends one independent wake per admission under a burst', async () => {
		const fetchImpl = vi.fn(async () => accepted());
		const wake = createAgenticChatWorkerQueueWake({
			supabaseUrl: 'https://project.supabase.co',
			serviceKey: 'service-role-key',
			fetchImpl: fetchImpl as typeof fetch
		});

		// No web-side coalescing: an earlier in-flight wake may reach the worker
		// before a later admission commits, so each admission sends its own.
		await expect(Promise.all([wake(), wake(), wake()])).resolves.toEqual([
			'sent',
			'sent',
			'sent'
		]);
		expect(fetchImpl).toHaveBeenCalledTimes(3);
	});

	it('resolves the route helper without throwing and honors the kill switch', async () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
		const fetchImpl = vi.fn<typeof fetch>(async () => accepted());
		vi.stubGlobal('fetch', fetchImpl);

		await expect(wakeAgenticChatWorkerQueue()).resolves.toBeUndefined();
		expect(fetchImpl).toHaveBeenCalledOnce();
		expect(fetchImpl.mock.calls[0]?.[0]).toBe(
			'https://project.supabase.co/realtime/v1/api/broadcast'
		);

		dynamicEnv.env = { PRIVATE_AGENTIC_CHAT_QUEUE_WAKE: 'off' };
		await expect(wakeAgenticChatWorkerQueue()).resolves.toBeUndefined();
		expect(fetchImpl).toHaveBeenCalledOnce();

		dynamicEnv.env = {};
		fetchImpl.mockRejectedValue(new TypeError('network down'));
		await expect(wakeAgenticChatWorkerQueue()).resolves.toBeUndefined();
		await expect(wakeAgenticChatWorkerQueue()).resolves.toBeUndefined();
		// Degradation is logged, but throttled so a Realtime outage cannot flood logs.
		expect(warn).toHaveBeenCalledOnce();
		expect(String(warn.mock.calls[0]?.[0])).toContain('agentic_chat_queue_wake_degraded');
	});
});
