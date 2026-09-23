// apps/worker/src/workers/agentic-chat/queueWakeListener.ts

/**
 * Private Realtime Broadcast topic web admission publishes to after a turn is
 * durably admitted. Must match AGENTIC_CHAT_QUEUE_WAKE_TOPIC in
 * apps/web/src/lib/services/agentic-chat-v2/worker-queue-wake.server.ts.
 * Authenticated browsers can neither join nor publish it (realtime.messages
 * authorizes only `chat-user:<auth.uid()>`); the service role bypasses RLS.
 */
export const AGENTIC_CHAT_QUEUE_WAKE_TOPIC = 'agentic-chat-queue:wake';
export const AGENTIC_CHAT_QUEUE_WAKE_EVENT = 'wake';

const DEFAULT_RETRY_BASE_MS = 1_000;
const DEFAULT_RETRY_MAX_MS = 30_000;
/** Shutdown never waits on a dead socket's leave acknowledgement for long. */
const STOP_REMOVAL_WAIT_MS = 1_000;

type WakeSubscribeStatus = 'SUBSCRIBED' | 'TIMED_OUT' | 'CLOSED' | 'CHANNEL_ERROR';

export type AgenticChatQueueWakeChannel = {
	on(
		type: 'broadcast',
		filter: { event: string },
		callback: (message: unknown) => void
	): AgenticChatQueueWakeChannel;
	subscribe(
		callback: (status: WakeSubscribeStatus, error?: Error) => void
	): AgenticChatQueueWakeChannel;
};

export type AgenticChatQueueWakeRealtimeClient = {
	channel(
		topic: string,
		options: { config: { private: true; broadcast: { self: false } } }
	): AgenticChatQueueWakeChannel;
	removeChannel(channel: AgenticChatQueueWakeChannel): PromiseLike<unknown>;
};

export type AgenticChatQueueWakeListenerHealthV1 = {
	status: 'idle' | 'connecting' | 'subscribed' | 'retrying' | 'stopped';
	wakesReceived: number;
	wakesCoalesced: number;
	lastWakeAt: string | null;
	consecutiveFailures: number;
};

export type AgenticChatQueueWakeListenerPort = {
	start(onWake: () => unknown): void;
	stop(): Promise<void>;
	getHealth(): AgenticChatQueueWakeListenerHealthV1;
};

export type AgenticChatQueueWakeListenerOptions = {
	client: AgenticChatQueueWakeRealtimeClient;
	topic?: string;
	retryBaseMs?: number;
	retryMaxMs?: number;
	now?: () => number;
	log?: (record: Record<string, unknown>) => void;
};

/**
 * Low-latency hint that turns durable admission into an immediate claim.
 *
 * Polling stays authoritative: a missed, late, or duplicated wake only changes
 * when the next claim runs. Wakes coalesce to at most one running claim plus
 * one queued follow-up, so a burst of admissions costs at most two claim RPCs
 * back to back, and every received wake is followed by a claim that started
 * after it. Channel failures re-subscribe with capped backoff and never throw
 * into the worker.
 */
export class AgenticChatQueueWakeListener implements AgenticChatQueueWakeListenerPort {
	private readonly client: AgenticChatQueueWakeRealtimeClient;
	private readonly topic: string;
	private readonly retryBaseMs: number;
	private readonly retryMaxMs: number;
	private readonly now: () => number;
	private readonly log: (record: Record<string, unknown>) => void;
	private onWake: (() => unknown) | null = null;
	private status: AgenticChatQueueWakeListenerHealthV1['status'] = 'idle';
	private channel: AgenticChatQueueWakeChannel | null = null;
	private removal: Promise<void> = Promise.resolve();
	private epoch = 0;
	private retryTimer: NodeJS.Timeout | null = null;
	private hasSubscribed = false;
	private wakeRunning = false;
	private wakePending = false;
	private wakesReceived = 0;
	private wakesCoalesced = 0;
	private lastWakeAtMs: number | null = null;
	private consecutiveFailures = 0;

	constructor(options: AgenticChatQueueWakeListenerOptions) {
		this.client = options.client;
		this.topic = options.topic ?? AGENTIC_CHAT_QUEUE_WAKE_TOPIC;
		this.retryBaseMs = positiveInteger(options.retryBaseMs, DEFAULT_RETRY_BASE_MS);
		this.retryMaxMs = Math.max(
			this.retryBaseMs,
			positiveInteger(options.retryMaxMs, DEFAULT_RETRY_MAX_MS)
		);
		this.now = options.now ?? Date.now;
		this.log = options.log ?? ((record) => console.warn(JSON.stringify(record)));
	}

	start(onWake: () => unknown): void {
		if (this.status !== 'idle') return;
		this.onWake = onWake;
		this.connect();
	}

	async stop(): Promise<void> {
		if (this.status === 'stopped') return;
		this.status = 'stopped';
		this.epoch += 1;
		this.wakePending = false;
		this.clearRetry();
		this.detachChannel();
		let timer: NodeJS.Timeout | null = null;
		await Promise.race([
			this.removal,
			new Promise<void>((resolve) => {
				timer = setTimeout(resolve, STOP_REMOVAL_WAIT_MS);
				timer.unref?.();
			})
		]);
		if (timer) clearTimeout(timer);
	}

	getHealth(): AgenticChatQueueWakeListenerHealthV1 {
		return {
			status: this.status,
			wakesReceived: this.wakesReceived,
			wakesCoalesced: this.wakesCoalesced,
			lastWakeAt:
				this.lastWakeAtMs === null ? null : new Date(this.lastWakeAtMs).toISOString(),
			consecutiveFailures: this.consecutiveFailures
		};
	}

	private connect(): void {
		if (this.status === 'stopped') return;
		const epoch = ++this.epoch;
		this.status = 'connecting';
		// Supabase returns the existing channel for a topic until the previous
		// one is removed, so a fresh subscription waits for that removal.
		void this.removal.then(() => {
			if (epoch !== this.epoch || this.status === 'stopped') return;
			try {
				const channel = this.client.channel(this.topic, {
					config: { private: true, broadcast: { self: false } }
				});
				this.channel = channel;
				channel.on('broadcast', { event: AGENTIC_CHAT_QUEUE_WAKE_EVENT }, () => {
					if (epoch !== this.epoch || this.status === 'stopped') return;
					this.wakesReceived += 1;
					this.lastWakeAtMs = this.now();
					this.requestWake();
				});
				channel.subscribe((status, error) => {
					if (epoch !== this.epoch || this.status === 'stopped') return;
					if (status === 'SUBSCRIBED') {
						this.status = 'subscribed';
						this.consecutiveFailures = 0;
						// A wake published while unsubscribed is gone; one catch-up
						// claim covers that gap instead of waiting for the next poll.
						if (this.hasSubscribed) this.requestWake();
						this.hasSubscribed = true;
						return;
					}
					this.fail(status, error);
				});
			} catch (error) {
				this.fail('CHANNEL_ERROR', error);
			}
		});
	}

	private fail(status: WakeSubscribeStatus, error?: unknown): void {
		if (this.status === 'stopped') return;
		this.consecutiveFailures += 1;
		this.epoch += 1;
		this.status = 'retrying';
		this.detachChannel();
		const delayMs = Math.min(
			this.retryMaxMs,
			this.retryBaseMs * 2 ** Math.min(this.consecutiveFailures - 1, 16)
		);
		this.safeLog({
			event: 'agentic_chat_queue_wake_channel_degraded',
			status,
			error: error instanceof Error ? error.message.slice(0, 200) : undefined,
			consecutiveFailures: this.consecutiveFailures,
			retryInMs: delayMs,
			impact: 'Admitted turns are claimed by the one-second durable poll until the wake channel returns.'
		});
		this.clearRetry();
		this.retryTimer = setTimeout(() => {
			this.retryTimer = null;
			this.connect();
		}, delayMs);
		this.retryTimer.unref?.();
	}

	private detachChannel(): void {
		const channel = this.channel;
		this.channel = null;
		if (!channel) return;
		const previous = this.removal;
		this.removal = previous
			.then(() => this.client.removeChannel(channel))
			.then(
				() => undefined,
				() => undefined
			);
	}

	private requestWake(): void {
		if (this.wakeRunning) {
			if (this.wakePending) this.wakesCoalesced += 1;
			this.wakePending = true;
			return;
		}
		this.runWake();
	}

	private runWake(): void {
		const onWake = this.onWake;
		if (!onWake || this.status === 'stopped') return;
		this.wakeRunning = true;
		void Promise.resolve()
			.then(() => onWake())
			.catch((error: unknown) => {
				this.safeLog({
					event: 'agentic_chat_queue_wake_claim_failed',
					error: error instanceof Error ? error.message.slice(0, 200) : String(error)
				});
			})
			.finally(() => {
				this.wakeRunning = false;
				if (this.wakePending && this.status !== 'stopped') {
					this.wakePending = false;
					this.runWake();
				}
			});
	}

	private clearRetry(): void {
		if (!this.retryTimer) return;
		clearTimeout(this.retryTimer);
		this.retryTimer = null;
	}

	private safeLog(record: Record<string, unknown>): void {
		try {
			this.log(record);
		} catch {
			// Logging cannot own the wake transport.
		}
	}
}

/** Kill switch: AGENTIC_CHAT_QUEUE_WAKE=off leaves the worker on polling alone. */
export function agenticChatQueueWakeEnabled(environment: NodeJS.ProcessEnv): boolean {
	const value = environment.AGENTIC_CHAT_QUEUE_WAKE?.trim().toLowerCase();
	return !(value === 'off' || value === 'false' || value === '0' || value === 'disabled');
}

function positiveInteger(value: number | undefined, fallback: number): number {
	return Number.isSafeInteger(value) && (value as number) > 0 ? (value as number) : fallback;
}
