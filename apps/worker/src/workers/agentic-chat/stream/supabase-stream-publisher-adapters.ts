// apps/worker/src/workers/agentic-chat/stream/supabase-stream-publisher-adapters.ts

import type {
	AgenticChatSemanticEventRpcResultV1,
	AgenticChatStreamDeliveryAckRpcResultV1,
	AgenticChatTextBatchFlushRpcResultV1,
	AgenticChatTextBatchInputV1
} from '@buildos/shared-types';
import {
	type AgenticChatBroadcastMessageV1,
	type AgenticChatBroadcastOutcomeV1,
	type AgenticChatBroadcastPortV1,
	type AgenticChatPersistencePortV1,
	type AgenticChatSemanticBatchInputV1,
	type AgenticChatSemanticBatchRpcResultV1,
	AgenticChatSemanticBatchUnavailableError
} from './stream-publisher';
import { agenticChatGenerationWriteFenceArgsV1 } from '../turn/write-fence';

const SEMANTIC_BATCH_RPC = 'persist_agentic_chat_semantic_event_batch';
/**
 * PostgREST answers PGRST202 for a function missing from its schema cache;
 * Postgres answers 42883 (undefined_function). Either way nothing ran.
 */
const MISSING_FUNCTION_CODES = new Set(['PGRST202', '42883']);

type AgenticChatPreviewBroadcastMessageV1 = Extract<
	AgenticChatBroadcastMessageV1,
	{ kind: 'live_text_preview' }
>;

/**
 * Preview frames are cumulative and arrive up to ten times a second. A healthy
 * channel acknowledges each well before the next; beyond this many unsettled
 * sends per topic the channel is struggling and newer frames are skipped.
 */
const MAX_PREVIEW_SENDS_IN_FLIGHT_PER_TOPIC = 4;

type RpcError = { code?: string; message: string };
type RpcResponse = PromiseLike<{ data: unknown; error: RpcError | null }>;

export class AgenticChatPersistenceRpcError extends Error {
	constructor(
		readonly rpcName: string,
		readonly code: string,
		message: string
	) {
		super(`${rpcName} failed${code ? ` (${code})` : ''}: ${message}`);
		this.name = 'AgenticChatPersistenceRpcError';
	}
}

export type AgenticChatSupabaseRpcClient = {
	rpc: (name: string, args: Record<string, unknown>) => RpcResponse;
};

export type AgenticChatRealtimeChannel = {
	send(message: { type: 'broadcast'; event: string; payload: unknown }): PromiseLike<string>;
	subscribe(
		callback: (
			status: 'SUBSCRIBED' | 'TIMED_OUT' | 'CLOSED' | 'CHANNEL_ERROR',
			error?: Error
		) => void,
		timeout?: number
	): AgenticChatRealtimeChannel;
};

/**
 * The socket client supabase-js exposes as `client.realtime`. Read only for
 * diagnostics (`connectionState`) and to restart a stuck socket (`conn`).
 */
export type AgenticChatRealtimeSocketV1 = {
	conn?: { close(code?: number, reason?: string): void } | null;
	connectionState?(): string;
	isDisconnecting?(): boolean;
};

export type AgenticChatRealtimeClient = {
	channel(
		topic: string,
		options: { config: { private: true; broadcast: { ack: true } } }
	): AgenticChatRealtimeChannel;
	removeChannel(channel: AgenticChatRealtimeChannel): PromiseLike<unknown>;
	realtime?: AgenticChatRealtimeSocketV1;
};

export type AgenticChatRealtimeStatusV1 = 'idle' | 'connected' | 'degraded' | 'closed';

export type AgenticChatRealtimeHealthV1 = {
	healthy: boolean;
	status: AgenticChatRealtimeStatusV1;
	activeChannels: number;
	lastTransitionAt: string | null;
	consecutiveFailures: number;
};

// Inputs come from the port so the adapter cannot drift from what the
// publisher sends.
type PersistSemanticInputV1 = Parameters<AgenticChatPersistencePortV1['persistSemantic']>[0];
type AcknowledgeInputV1 = Parameters<NonNullable<AgenticChatPersistencePortV1['acknowledge']>>[0];

/**
 * Maps the publisher's persistence port onto its Postgres RPCs. Every write
 * except the text flush (which fences each batch row itself) carries the
 * generation write fence. Each call returns the RPC's receipt or throws.
 */
export class SupabaseAgenticChatPersistenceAdapter implements AgenticChatPersistencePortV1 {
	constructor(private readonly client: AgenticChatSupabaseRpcClient) {}

	flushTextBatches(
		inputs: AgenticChatTextBatchInputV1[]
	): Promise<AgenticChatTextBatchFlushRpcResultV1> {
		return this.call<AgenticChatTextBatchFlushRpcResultV1>('flush_agentic_chat_text_batches', {
			p_batches: inputs
		});
	}

	persistSemantic(input: PersistSemanticInputV1): Promise<AgenticChatSemanticEventRpcResultV1> {
		return this.call<AgenticChatSemanticEventRpcResultV1>(
			'persist_agentic_chat_semantic_event',
			{
				...agenticChatGenerationWriteFenceArgsV1({
					turnRunId: input.turn_run_id,
					queueJobId: input.queue_job_id,
					processingToken: input.processing_token,
					executionGeneration: input.execution_generation
				}),
				p_transition_id: input.transition_id,
				p_assistant_text: input.assistant_text,
				p_phase: input.phase,
				p_event_type: input.event_type,
				p_projection: input.projection,
				p_event_payload: input.event_payload
			}
		);
	}

	async persistSemanticBatch(
		input: AgenticChatSemanticBatchInputV1
	): Promise<AgenticChatSemanticBatchRpcResultV1> {
		try {
			return await this.call<AgenticChatSemanticBatchRpcResultV1>(SEMANTIC_BATCH_RPC, {
				...agenticChatGenerationWriteFenceArgsV1({
					turnRunId: input.turn_run_id,
					queueJobId: input.queue_job_id,
					processingToken: input.processing_token,
					executionGeneration: input.execution_generation
				}),
				p_assistant_text: input.assistant_text,
				p_events: input.events,
				p_projection: input.projection,
				p_first_visible_text_at: input.first_visible_text_at,
				p_first_visible_text_source: input.first_visible_text_source
			});
		} catch (error) {
			if (
				error instanceof AgenticChatPersistenceRpcError &&
				MISSING_FUNCTION_CODES.has(error.code)
			) {
				throw new AgenticChatSemanticBatchUnavailableError(error.code);
			}
			throw error;
		}
	}

	acknowledge(input: AcknowledgeInputV1): Promise<AgenticChatStreamDeliveryAckRpcResultV1> {
		return this.call<AgenticChatStreamDeliveryAckRpcResultV1>(
			'acknowledge_agentic_chat_stream_delivery',
			{
				...agenticChatGenerationWriteFenceArgsV1({
					turnRunId: input.turn_run_id,
					queueJobId: input.queue_job_id,
					processingToken: input.processing_token,
					executionGeneration: input.execution_generation
				}),
				p_acknowledged_sequence: input.acknowledged_sequence
			}
		);
	}

	private async call<T>(name: string, args: Record<string, unknown>): Promise<T> {
		const { data, error } = await this.client.rpc(name, args);
		if (error) {
			throw new AgenticChatPersistenceRpcError(name, error.code ?? '', error.message);
		}
		if (data === null || data === undefined) throw new Error(`${name} returned no receipt`);
		return data as T;
	}
}

/** Production defaults for every numeric adapter setting. */
const BROADCAST_ADAPTER_DEFAULTS = {
	maxCachedChannels: 256,
	subscribeTimeoutMs: 10_000,
	sendTimeoutMs: 10_000,
	previewReopenCooldownMs: 2_000,
	selfHealAfterMs: 60_000,
	selfHealCooldownMs: 5 * 60_000,
	failureLogEvery: 25
} as const;

type BroadcastAdapterLimitsV1 = Readonly<Record<keyof typeof BROADCAST_ADAPTER_DEFAULTS, number>>;

/**
 * Settings for the broadcast adapter. Every field is optional and has a
 * production default; each number must be a positive safe integer.
 */
export type AgenticChatBroadcastAdapterOptionsV1 = {
	/** Most topic channels kept subscribed; the least recently used goes first. */
	maxCachedChannels?: number;
	/** Longest wait for a channel to reach SUBSCRIBED. */
	subscribeTimeoutMs?: number;
	/** Longest wait for one acknowledged broadcast. */
	sendTimeoutMs?: number;
	/** Least time between preview-started subscriptions for one topic. */
	previewReopenCooldownMs?: number;
	/** Subscriptions failing this long with no success restart the socket. */
	selfHealAfterMs?: number;
	/** At most one socket restart per this window. */
	selfHealCooldownMs?: number;
	/** Log the first failure of a streak and every Nth one after it. */
	failureLogEvery?: number;
	/** Structured diagnostics; defaults to one JSON line on stderr. */
	log?: (record: Record<string, unknown>) => void;
	now?: () => number;
};

/** A restart needs a streak, not two isolated failures inside the window. */
const MIN_SUBSCRIBE_FAILURES_FOR_SELF_HEAL = 3;
/** supabase-js settles a last-channel disconnect in about 100 ms. */
const SOCKET_SETTLE_POLL_MS = 25;
const SOCKET_SETTLE_MAX_WAIT_MS = 500;
const CHANNEL_OPTIONS = { config: { private: true, broadcast: { ack: true } } } as const;

function resolveBroadcastAdapterLimits(
	options: AgenticChatBroadcastAdapterOptionsV1
): BroadcastAdapterLimitsV1 {
	const limits = { ...BROADCAST_ADAPTER_DEFAULTS } as Record<
		keyof typeof BROADCAST_ADAPTER_DEFAULTS,
		number
	>;
	for (const name of Object.keys(limits) as Array<keyof typeof limits>) {
		const value = options[name] ?? limits[name];
		if (!Number.isSafeInteger(value) || value < 1) {
			throw new Error(`${name} must be a positive safe integer`);
		}
		limits[name] = value;
	}
	return limits;
}

/** A subscription that did not reach SUBSCRIBED, with the SDK's status. */
class AgenticChatRealtimeSubscribeError extends Error {
	constructor(
		readonly status: string,
		readonly detail?: unknown
	) {
		super(
			detail instanceof Error
				? detail.message
				: typeof detail === 'string'
					? detail
					: `Realtime channel failed to subscribe: ${status}`
		);
		this.name = 'AgenticChatRealtimeSubscribeError';
	}
}

/**
 * One subscription of one channel object. The SDK can hand the same object
 * back for a topic and keeps every callback ever registered on it, so a
 * callback answers only while its own subscription is live.
 */
type SubscriptionToken = { live: boolean };

function defaultRealtimeLog(record: Record<string, unknown>): void {
	console.warn(JSON.stringify(record));
}

/**
 * Bounded, secret-free text for a Realtime failure. Redacts structured
 * credential formats (JWTs, key=value tokens) only; it classifies nothing.
 */
function realtimeDiagnosticText(value: unknown): string | undefined {
	if (value === undefined || value === null) return undefined;
	let text: string;
	if (value instanceof Error) text = value.message;
	else if (typeof value === 'string') text = value;
	else {
		try {
			text = JSON.stringify(value) ?? String(value);
		} catch {
			text = String(value);
		}
	}
	// Redact before truncating, so a cut-off credential cannot slip past a pattern.
	return text
		.replace(/eyJ[\w-]+\.[\w-]+\.[\w-]*/g, '[jwt]')
		.replace(/(bearer\s+)[^\s",}]+/gi, '$1[redacted]')
		.replace(/((?:api[_-]?key|access_token|token)["=:\s]+)[^&\s",}]+/gi, '$1[redacted]')
		.slice(0, 200);
}

function realtimeErrorCode(value: unknown): string | undefined {
	if (typeof value !== 'object' || value === null || !('code' in value)) return undefined;
	const code = (value as { code: unknown }).code;
	return typeof code === 'string' || typeof code === 'number' ? String(code) : undefined;
}

/** `chat-user:<id>` → `chat-user`: logs name the kind of topic, not the user. */
function topicKind(topic: string): string {
	const separator = topic.indexOf(':');
	return separator === -1 ? topic : topic.slice(0, separator);
}

/**
 * Sends the publisher's broadcasts over Supabase Realtime: one private, acked
 * channel per topic, cached in least-recently-used order.
 *
 * - Durable events and reconcile hints subscribe on demand; a failed send or
 *   subscription counts against health and evicts the channel.
 * - Live text previews never wait. With no ready channel the frame is skipped
 *   (and at most one subscription per cooldown is started); a failed preview
 *   send neither evicts nor counts against health (see `publishPreview`).
 * - Subscriptions failing for a sustained window restart the shared socket
 *   (see `maybeResetConnection`).
 *
 * Broadcast is best effort: events are persisted before they are sent, and
 * clients recover anything lost through reconcile.
 */
export class SupabaseAgenticChatBroadcastAdapter implements AgenticChatBroadcastPortV1 {
	private readonly channels = new Map<string, AgenticChatRealtimeChannel>();
	private readonly openingChannels = new Map<string, Promise<AgenticChatRealtimeChannel>>();
	/** Channel removals still in flight, by topic; a reopen waits for its own. */
	private readonly removals = new Map<string, Promise<void>>();
	private readonly subscriptionTokens = new WeakMap<
		AgenticChatRealtimeChannel,
		SubscriptionToken
	>();
	private status: AgenticChatRealtimeStatusV1 = 'idle';
	private lastTransitionAt: string | null = null;
	/** Failed publish/subscribe attempts since the last success. */
	private consecutiveFailures = 0;
	private closed = false;
	private readonly closeListeners = new Set<() => void>();
	private readonly previewSendsInFlight = new Map<string, number>();
	private readonly previewOpenAttemptAtMs = new Map<string, number>();
	private readonly limits: BroadcastAdapterLimitsV1;
	private readonly log: (record: Record<string, unknown>) => void;
	private readonly now: () => number;
	/** Cached channels lost since the last success. */
	private channelLossStreak = 0;
	/** When subscriptions started failing with no success since. */
	private subscribeFailingSinceMs: number | null = null;
	private lastSubscribeFailureAtMs: number | null = null;
	private subscribeFailuresInWindow = 0;
	private lastConnectionResetAtMs: number | null = null;
	private connectionResets = 0;

	constructor(
		private readonly client: AgenticChatRealtimeClient,
		options: AgenticChatBroadcastAdapterOptionsV1 = {}
	) {
		this.limits = resolveBroadcastAdapterLimits(options);
		this.log = options.log ?? defaultRealtimeLog;
		this.now = options.now ?? (() => Date.now());
	}

	async publish(message: AgenticChatBroadcastMessageV1): Promise<AgenticChatBroadcastOutcomeV1> {
		if (this.closed) return 'failed';
		if (message.kind === 'live_text_preview') return this.publishPreview(message);
		let channel: AgenticChatRealtimeChannel;
		try {
			channel = await this.channelFor(message.topic);
		} catch {
			// The subscription attempt counted and logged its own failure.
			return 'failed';
		}
		let status: string;
		let error: unknown;
		try {
			const result = await this.sendWithDeadline(
				channel.send({
					type: 'broadcast',
					event: message.event,
					payload: message.payload
				})
			);
			if (result === 'ok') {
				this.observeConnected();
				return 'sent';
			}
			status = result;
		} catch (sendError) {
			status = 'SEND_FAILED';
			error = sendError;
		}
		// Record the failure with the socket as it found it, then drop the
		// channel so the next durable event subscribes afresh.
		this.observeAttemptFailure('send', status, error);
		if (!this.closed) await this.evictChannel(message.topic, channel);
		return 'failed';
	}

	/**
	 * Display-only frames ride the channel durable delivery owns and never change
	 * it: no eviction, no health transition, no wait on a subscription. A frame
	 * that cannot go out now is skipped; the next one carries the full text.
	 */
	private async publishPreview(
		message: AgenticChatPreviewBroadcastMessageV1
	): Promise<AgenticChatBroadcastOutcomeV1> {
		const { topic } = message;
		const channel = this.channels.get(topic);
		if (!channel) {
			this.openChannelForPreview(topic);
			return 'skipped';
		}
		const inFlight = this.previewSendsInFlight.get(topic) ?? 0;
		if (inFlight >= MAX_PREVIEW_SENDS_IN_FLIGHT_PER_TOPIC) return 'skipped';
		this.previewSendsInFlight.set(topic, inFlight + 1);
		try {
			const result = await this.sendWithDeadline(
				channel.send({ type: 'broadcast', event: message.event, payload: message.payload })
			);
			return result === 'ok' ? 'sent' : 'failed';
		} catch {
			return 'failed';
		} finally {
			const remaining = (this.previewSendsInFlight.get(topic) ?? 1) - 1;
			if (remaining > 0) this.previewSendsInFlight.set(topic, remaining);
			else this.previewSendsInFlight.delete(topic);
		}
	}

	/**
	 * Previews may restore a missing channel (say, one evicted after a socket
	 * error mid-pass), but start at most one subscription per topic per cooldown
	 * so an unavailable Realtime service never sees one join per frame.
	 */
	private openChannelForPreview(topic: string): void {
		if (this.openingChannels.has(topic)) return;
		const nowMs = this.now();
		const lastAttemptAtMs = this.previewOpenAttemptAtMs.get(topic);
		if (
			lastAttemptAtMs !== undefined &&
			nowMs - lastAttemptAtMs < this.limits.previewReopenCooldownMs
		) {
			return;
		}
		// Re-insert so the oldest topic is evicted first once the map is full.
		this.previewOpenAttemptAtMs.delete(topic);
		this.previewOpenAttemptAtMs.set(topic, nowMs);
		if (this.previewOpenAttemptAtMs.size > this.limits.maxCachedChannels) {
			const oldest = this.previewOpenAttemptAtMs.keys().next().value;
			if (oldest !== undefined) this.previewOpenAttemptAtMs.delete(oldest);
		}
		void this.channelFor(topic).catch(() => undefined);
	}

	getHealth(): AgenticChatRealtimeHealthV1 {
		return {
			healthy: this.status === 'idle' || this.status === 'connected',
			status: this.status,
			activeChannels: this.channels.size,
			lastTransitionAt: this.lastTransitionAt,
			consecutiveFailures: this.consecutiveFailures
		};
	}

	/**
	 * Stops every pending wait, removes every channel, and never throws: it
	 * runs in the shutdown path's `finally`, where a cleanup error would
	 * replace the publisher's own stop result.
	 */
	async close(): Promise<void> {
		this.closed = true;
		for (const listener of [...this.closeListeners]) listener();
		this.closeListeners.clear();
		const channels = [...this.channels.values()];
		this.channels.clear();
		this.previewOpenAttemptAtMs.clear();
		await Promise.all([
			...channels.map((channel) => this.removeChannelQuietly(channel)),
			...Array.from(this.openingChannels.values(), (opening) =>
				opening.catch(() => undefined)
			)
		]);
		this.transitionTo('closed');
	}

	private async channelFor(topic: string): Promise<AgenticChatRealtimeChannel> {
		if (this.closed) throw new Error('Realtime adapter is closed');
		const existing = this.channels.get(topic);
		if (existing) {
			this.channels.delete(topic);
			this.channels.set(topic, existing);
			return existing;
		}
		const pending = this.openingChannels.get(topic);
		if (pending) return pending;
		// Supabase returns the same channel for a topic and ignores subscribe()
		// while it is joining. Share the first callback's promise so a concurrent
		// claim hint and semantic event cannot strand the second publisher.
		const opening = this.openChannel(topic);
		this.openingChannels.set(topic, opening);
		try {
			return await opening;
		} finally {
			if (this.openingChannels.get(topic) === opening) this.openingChannels.delete(topic);
		}
	}

	private async openChannel(topic: string): Promise<AgenticChatRealtimeChannel> {
		if (this.channels.size >= this.limits.maxCachedChannels) {
			const oldest = this.channels.entries().next().value as
				| [string, AgenticChatRealtimeChannel]
				| undefined;
			if (oldest) await this.evictChannel(oldest[0], oldest[1]);
		}
		const removal = this.removals.get(topic);
		if (removal) await this.waitForRemoval(removal);
		if (this.client.realtime?.isDisconnecting?.()) await this.waitForSocketToSettle();
		if (this.closed) throw new Error('Realtime adapter is closed');
		const channel = this.client.channel(topic, CHANNEL_OPTIONS);
		const token = this.claimSubscription(channel);
		try {
			await this.subscribe(channel, topic, token);
			if (this.closed) throw new Error('Realtime adapter closed during subscription');
			if (!token.live) {
				throw new AgenticChatRealtimeSubscribeError(
					'CHANNEL_ERROR',
					'Realtime channel was lost while subscribing'
				);
			}
		} catch (error) {
			// The socket as the failure found it, before cleanup changes it.
			const socketState = this.socketState();
			// Preserve the subscription failure; channel cleanup is best effort.
			await this.removeChannelQuietly(channel);
			if (!this.closed) {
				this.observeAttemptFailure(
					'subscribe',
					error instanceof AgenticChatRealtimeSubscribeError
						? error.status
						: 'SUBSCRIBE_FAILED',
					error instanceof AgenticChatRealtimeSubscribeError ? error.detail : error,
					socketState
				);
			}
			throw error;
		}
		this.channels.set(topic, channel);
		this.observeConnected();
		return channel;
	}

	/**
	 * supabase-js disconnects the shared socket when its last channel is
	 * removed and ignores connect() until that settles (about 100 ms). A join
	 * sent inside that window is never flushed and waits out our whole
	 * deadline, so wait the window out first (bounded).
	 */
	private async waitForSocketToSettle(): Promise<void> {
		for (
			let waitedMs = 0;
			waitedMs < SOCKET_SETTLE_MAX_WAIT_MS;
			waitedMs += SOCKET_SETTLE_POLL_MS
		) {
			await new Promise((resolve) => setTimeout(resolve, SOCKET_SETTLE_POLL_MS));
			if (this.closed || !this.client.realtime?.isDisconnecting?.()) return;
		}
	}

	private subscribe(
		channel: AgenticChatRealtimeChannel,
		topic: string,
		token: SubscriptionToken
	): Promise<void> {
		return new Promise((resolvePromise, rejectPromise) => {
			let settled = false;
			let subscribed = false;
			// Every settlement releases this attempt's close listener, so a
			// long-lived worker does not retain one closure per subscription.
			let removeCloseListener = () => {};
			const resolve = () => {
				removeCloseListener();
				resolvePromise();
			};
			const reject = (error: unknown) => {
				removeCloseListener();
				rejectPromise(error);
			};
			// The SDK's timeout relies on a callback being registered. Bound our
			// own wait as well, including a client that never invokes the callback.
			const timer = setTimeout(() => {
				if (settled) return;
				settled = true;
				reject(
					new AgenticChatRealtimeSubscribeError(
						'DEADLINE_EXCEEDED',
						'Realtime subscription deadline exceeded'
					)
				);
			}, this.limits.subscribeTimeoutMs);
			removeCloseListener = this.onClose(() => {
				if (settled) return;
				settled = true;
				clearTimeout(timer);
				reject(new Error('Realtime adapter closed during subscription'));
			});
			try {
				channel.subscribe((status, error) => {
					// Once this adapter removes a channel, its callbacks belong to the
					// SDK's teardown, not to us. Removal closes an unjoined channel
					// synchronously and fires CLOSED straight back into this callback;
					// before this guard that re-entered eviction until the stack
					// overflowed, counting ~330 failures per channel (2026-10-17).
					if (!token.live) return;
					if (settled && !subscribed) return;
					if (this.closed) {
						if (!settled) {
							settled = true;
							clearTimeout(timer);
							reject(new Error('Realtime adapter closed during subscription'));
						}
						return;
					}
					if (status === 'SUBSCRIBED') {
						// An SDK rejoin of a cached channel is not an attempt of ours.
						if (settled) return;
						settled = true;
						subscribed = true;
						clearTimeout(timer);
						resolve();
						return;
					}
					if (settled) {
						// A cached channel failed after subscribing (socket drop, server
						// error). No publish attempt failed, so health is unchanged; evict
						// it so the next durable event subscribes afresh.
						this.observeChannelLost(topic, status, error);
						void this.evictChannel(topic, channel);
						return;
					}
					settled = true;
					clearTimeout(timer);
					reject(new AgenticChatRealtimeSubscribeError(status, error));
				}, this.limits.subscribeTimeoutMs);
			} catch (error) {
				settled = true;
				clearTimeout(timer);
				reject(error);
			}
		});
	}

	private async sendWithDeadline(work: PromiseLike<string>): Promise<string> {
		let timer: NodeJS.Timeout | null = null;
		let removeCloseListener = () => {};
		try {
			return await Promise.race([
				Promise.resolve(work),
				new Promise<string>((_resolve, reject) => {
					timer = setTimeout(
						() => reject(new Error('Realtime broadcast deadline exceeded')),
						this.limits.sendTimeoutMs
					);
					removeCloseListener = this.onClose(() =>
						reject(new Error('Realtime adapter closed during broadcast'))
					);
				})
			]);
		} finally {
			if (timer) clearTimeout(timer);
			removeCloseListener();
		}
	}

	private onClose(listener: () => void): () => void {
		if (this.closed) {
			listener();
			return () => undefined;
		}
		this.closeListeners.add(listener);
		return () => {
			this.closeListeners.delete(listener);
		};
	}

	private async evictChannel(topic: string, channel: AgenticChatRealtimeChannel): Promise<void> {
		if (this.channels.get(topic) === channel) this.channels.delete(topic);
		const removal = this.removeChannelQuietly(channel);
		this.removals.set(topic, removal);
		try {
			await removal;
		} finally {
			if (this.removals.get(topic) === removal) this.removals.delete(topic);
		}
	}

	/**
	 * The SDK hands back the same channel object for a topic until its leave
	 * settles, and subscribe() on a leaving channel does nothing, so a reopen
	 * before then would wait out the whole subscribe deadline. Bounded by it,
	 * and cut short by close() so shutdown does not wait on a dead socket.
	 */
	private async waitForRemoval(removal: Promise<void>): Promise<void> {
		let timer: NodeJS.Timeout | null = null;
		let removeCloseListener = () => {};
		try {
			await Promise.race([
				removal,
				new Promise<void>((resolve) => {
					timer = setTimeout(resolve, this.limits.subscribeTimeoutMs);
					removeCloseListener = this.onClose(resolve);
				})
			]);
		} finally {
			if (timer) clearTimeout(timer);
			removeCloseListener();
		}
	}

	/**
	 * Retires the subscription before the SDK sees the removal (synchronously,
	 * because removal fires callbacks synchronously), then removes the channel.
	 */
	private async removeChannelQuietly(channel: AgenticChatRealtimeChannel): Promise<void> {
		this.retireSubscription(channel);
		try {
			await this.client.removeChannel(channel);
		} catch {
			// Reconnection must not depend on cleanup of the failed socket.
		}
	}

	private claimSubscription(channel: AgenticChatRealtimeChannel): SubscriptionToken {
		this.retireSubscription(channel);
		const token: SubscriptionToken = { live: true };
		this.subscriptionTokens.set(channel, token);
		return token;
	}

	private retireSubscription(channel: AgenticChatRealtimeChannel): void {
		const token = this.subscriptionTokens.get(channel);
		if (token) token.live = false;
		this.subscriptionTokens.delete(channel);
	}

	private observeConnected(): void {
		if (this.closed) return;
		this.consecutiveFailures = 0;
		this.channelLossStreak = 0;
		this.subscribeFailingSinceMs = null;
		this.lastSubscribeFailureAtMs = null;
		this.subscribeFailuresInWindow = 0;
		this.transitionTo('connected');
	}

	/** A publish or subscribe attempt this adapter made failed. */
	private observeAttemptFailure(
		phase: 'subscribe' | 'send',
		status: string,
		error: unknown,
		socketState = this.socketState()
	): void {
		if (this.closed) return;
		this.consecutiveFailures += 1;
		this.transitionTo('degraded');
		if (this.shouldLog(this.consecutiveFailures)) {
			this.safeLog({
				event: 'agentic_chat_realtime_attempt_failed',
				phase,
				status,
				error: realtimeDiagnosticText(error),
				errorCode: realtimeErrorCode(error),
				failuresInStreak: this.consecutiveFailures,
				activeChannels: this.channels.size,
				socketState
			});
		}
		if (phase === 'subscribe') this.maybeResetConnection();
	}

	private observeChannelLost(topic: string, status: string, error: unknown): void {
		this.channelLossStreak += 1;
		if (!this.shouldLog(this.channelLossStreak)) return;
		this.safeLog({
			event: 'agentic_chat_realtime_channel_lost',
			status,
			error: realtimeDiagnosticText(error),
			errorCode: realtimeErrorCode(error),
			topicKind: topicKind(topic),
			channelsLostInStreak: this.channelLossStreak,
			socketState: this.socketState()
		});
	}

	/**
	 * Self-heal: subscriptions failing for `selfHealAfterMs` with no success in
	 * between restart the socket, at most once per cooldown. Closing the socket
	 * (rather than `disconnect()`) runs the SDK's own drop path: every channel
	 * on the shared socket, the queue-wake listener's included, gets its error
	 * callback and resubscribes, and the SDK reconnects on its backoff.
	 * `disconnect()` would instead tear down every channel's listeners without
	 * telling their owners, leaving the wake listener silently deaf. Durable
	 * delivery is untouched: events are persisted before any broadcast, and a
	 * broadcast lost here is recovered by reconcile.
	 */
	private maybeResetConnection(): void {
		const nowMs = this.now();
		const previousFailureAtMs = this.lastSubscribeFailureAtMs;
		this.lastSubscribeFailureAtMs = nowMs;
		if (
			this.subscribeFailingSinceMs === null ||
			(previousFailureAtMs !== null &&
				nowMs - previousFailureAtMs > this.limits.selfHealAfterMs)
		) {
			// A failure after a quiet gap starts a new window: two isolated
			// failures minutes apart on an idle replica are not a failing socket.
			this.subscribeFailingSinceMs = nowMs;
			this.subscribeFailuresInWindow = 1;
			return;
		}
		this.subscribeFailuresInWindow += 1;
		const failingForMs = nowMs - this.subscribeFailingSinceMs;
		if (
			failingForMs < this.limits.selfHealAfterMs ||
			this.subscribeFailuresInWindow < MIN_SUBSCRIBE_FAILURES_FOR_SELF_HEAL
		) {
			return;
		}
		if (
			this.lastConnectionResetAtMs !== null &&
			nowMs - this.lastConnectionResetAtMs < this.limits.selfHealCooldownMs
		) {
			return;
		}
		this.lastConnectionResetAtMs = nowMs;
		this.subscribeFailingSinceMs = nowMs;
		this.subscribeFailuresInWindow = 0;
		const socketState = this.socketState();
		const conn = this.client.realtime?.conn;
		let outcome: 'socket_closed' | 'no_socket' | 'close_failed' = 'no_socket';
		if (conn && typeof conn.close === 'function') {
			try {
				conn.close();
				outcome = 'socket_closed';
				this.connectionResets += 1;
			} catch {
				outcome = 'close_failed';
			}
		}
		// Evict after the close: with the socket no longer open the SDK settles
		// each leave at once. A leave sent first would never be answered, and its
		// topic would stay unusable for the SDK's 10 s leave timeout.
		for (const [topic, channel] of [...this.channels]) void this.evictChannel(topic, channel);
		this.safeLog({
			event: 'agentic_chat_realtime_connection_reset',
			outcome,
			failingForMs,
			failuresInStreak: this.consecutiveFailures,
			socketState,
			connectionResets: this.connectionResets
		});
	}

	private shouldLog(streak: number): boolean {
		return streak === 1 || streak % this.limits.failureLogEvery === 0;
	}

	private socketState(): string | undefined {
		try {
			return this.client.realtime?.connectionState?.();
		} catch {
			return undefined;
		}
	}

	private safeLog(record: Record<string, unknown>): void {
		try {
			this.log(record);
		} catch {
			// Logging cannot own the broadcast transport.
		}
	}

	private transitionTo(status: AgenticChatRealtimeStatusV1): void {
		if (this.status === status) return;
		this.status = status;
		this.lastTransitionAt = new Date(this.now()).toISOString();
	}
}
