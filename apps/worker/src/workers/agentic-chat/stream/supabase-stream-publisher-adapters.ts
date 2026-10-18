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

export type AgenticChatRealtimeHealthV1 = {
	healthy: boolean;
	status: 'idle' | 'connected' | 'degraded' | 'closed';
	activeChannels: number;
	lastTransitionAt: string | null;
	consecutiveFailures: number;
};

export class SupabaseAgenticChatPersistenceAdapter implements AgenticChatPersistencePortV1 {
	constructor(private readonly client: AgenticChatSupabaseRpcClient) {}

	flushTextBatches(
		inputs: AgenticChatTextBatchInputV1[]
	): Promise<AgenticChatTextBatchFlushRpcResultV1> {
		return this.call<AgenticChatTextBatchFlushRpcResultV1>('flush_agentic_chat_text_batches', {
			p_batches: inputs
		});
	}

	persistSemantic(input: {
		turn_run_id: string;
		queue_job_id: string;
		processing_token: string;
		execution_generation: number;
		transition_id: string;
		assistant_text: string;
		phase: string;
		event_type: string;
		projection: Record<string, unknown>;
		event_payload: Record<string, unknown>;
	}): Promise<AgenticChatSemanticEventRpcResultV1> {
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

	acknowledge(input: {
		turn_run_id: string;
		queue_job_id: string;
		processing_token: string;
		execution_generation: number;
		acknowledged_sequence: number;
	}): Promise<AgenticChatStreamDeliveryAckRpcResultV1> {
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

/**
 * Diagnostics and self-heal settings for the broadcast adapter (Realtime
 * health incident 2026-10-17). Every field has a production default.
 */
export type AgenticChatBroadcastAdapterOptionsV1 = {
	/** Structured diagnostics; defaults to one JSON line on stderr. */
	log?: (record: Record<string, unknown>) => void;
	now?: () => number;
	/** Subscriptions failing this long with no success restart the socket. */
	selfHealAfterMs?: number;
	/** At most one socket restart per this window. */
	selfHealCooldownMs?: number;
	/** Log the first failure of a streak and every Nth one after it. */
	failureLogEvery?: number;
};

const DEFAULT_SELF_HEAL_AFTER_MS = 60_000;
const DEFAULT_SELF_HEAL_COOLDOWN_MS = 5 * 60_000;
/** A restart needs a streak, not two isolated failures inside the window. */
const MIN_SUBSCRIBE_FAILURES_FOR_SELF_HEAL = 3;
const DEFAULT_FAILURE_LOG_EVERY = 25;
const CHANNEL_OPTIONS = { config: { private: true, broadcast: { ack: true } } } as const;

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
	return text
		.replace(/eyJ[\w-]+\.[\w-]+\.[\w-]*/g, '[jwt]')
		.replace(/((?:apikey|access_token|token)["=:\s]+)[^&\s",}]+/gi, '$1[redacted]')
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

export class SupabaseAgenticChatBroadcastAdapter implements AgenticChatBroadcastPortV1 {
	private readonly channels = new Map<string, AgenticChatRealtimeChannel>();
	private readonly openingChannels = new Map<string, Promise<AgenticChatRealtimeChannel>>();
	/** Channel removals still in flight, by topic; a reopen waits for its own. */
	private readonly removals = new Map<string, Promise<void>>();
	private readonly subscriptionTokens = new WeakMap<
		AgenticChatRealtimeChannel,
		SubscriptionToken
	>();
	private status: AgenticChatRealtimeHealthV1['status'] = 'idle';
	private lastTransitionAt: string | null = null;
	private consecutiveFailures = 0;
	private closed = false;
	private readonly closeListeners = new Set<() => void>();
	private readonly previewSendsInFlight = new Map<string, number>();
	private readonly previewOpenAttemptAtMs = new Map<string, number>();
	private readonly log: (record: Record<string, unknown>) => void;
	private readonly now: () => number;
	private readonly selfHealAfterMs: number;
	private readonly selfHealCooldownMs: number;
	private readonly failureLogEvery: number;
	/** Failed publish/subscribe attempts since the last success. */
	private attemptFailureStreak = 0;
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
		private readonly maxCachedChannels = 256,
		private readonly subscribeTimeoutMs = 10_000,
		private readonly sendTimeoutMs = 10_000,
		private readonly previewReopenCooldownMs = 2_000,
		options: AgenticChatBroadcastAdapterOptionsV1 = {}
	) {
		if (!Number.isSafeInteger(maxCachedChannels) || maxCachedChannels < 1) {
			throw new Error('maxCachedChannels must be a positive safe integer');
		}
		if (!Number.isSafeInteger(subscribeTimeoutMs) || subscribeTimeoutMs < 1) {
			throw new Error('subscribeTimeoutMs must be a positive safe integer');
		}
		if (!Number.isSafeInteger(sendTimeoutMs) || sendTimeoutMs < 1) {
			throw new Error('sendTimeoutMs must be a positive safe integer');
		}
		if (!Number.isSafeInteger(previewReopenCooldownMs) || previewReopenCooldownMs < 1) {
			throw new Error('previewReopenCooldownMs must be a positive safe integer');
		}
		this.log = options.log ?? defaultRealtimeLog;
		this.now = options.now ?? (() => Date.now());
		this.selfHealAfterMs = options.selfHealAfterMs ?? DEFAULT_SELF_HEAL_AFTER_MS;
		this.selfHealCooldownMs = options.selfHealCooldownMs ?? DEFAULT_SELF_HEAL_COOLDOWN_MS;
		this.failureLogEvery = options.failureLogEvery ?? DEFAULT_FAILURE_LOG_EVERY;
		for (const [name, value] of [
			['selfHealAfterMs', this.selfHealAfterMs],
			['selfHealCooldownMs', this.selfHealCooldownMs],
			['failureLogEvery', this.failureLogEvery]
		] as const) {
			if (!Number.isSafeInteger(value) || value < 1) {
				throw new Error(`${name} must be a positive safe integer`);
			}
		}
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
		try {
			const result = await this.sendWithDeadline(
				channel.send({
					type: 'broadcast',
					event: message.event,
					payload: message.payload
				})
			);
			if (result !== 'ok') {
				await this.evictChannel(message.topic, channel);
				this.observeAttemptFailure('send', result, undefined);
				return 'failed';
			}
			this.observeConnected();
			return 'sent';
		} catch (error) {
			if (!this.closed) await this.evictChannel(message.topic, channel);
			this.observeAttemptFailure('send', 'SEND_FAILED', error);
			return 'failed';
		}
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
			nowMs - lastAttemptAtMs < this.previewReopenCooldownMs
		) {
			return;
		}
		// Re-insert so the oldest topic is evicted first once the map is full.
		this.previewOpenAttemptAtMs.delete(topic);
		this.previewOpenAttemptAtMs.set(topic, nowMs);
		if (this.previewOpenAttemptAtMs.size > this.maxCachedChannels) {
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

	async releaseTopic(topic: string): Promise<void> {
		try {
			await this.openingChannels.get(topic);
		} catch {
			// Failed subscriptions clean up their own channel.
		}
		const channel = this.channels.get(topic);
		if (!channel) return;
		this.channels.delete(topic);
		this.retireSubscription(channel);
		await this.client.removeChannel(channel);
	}

	async close(): Promise<void> {
		this.closed = true;
		for (const listener of [...this.closeListeners]) listener();
		this.closeListeners.clear();
		const channels = [...this.channels.values()];
		this.channels.clear();
		this.previewOpenAttemptAtMs.clear();
		for (const channel of channels) this.retireSubscription(channel);
		try {
			await Promise.all([
				...channels.map((channel) => this.client.removeChannel(channel)),
				...Array.from(this.openingChannels.values(), (opening) => opening.catch(() => {}))
			]);
		} finally {
			this.transitionTo('closed');
		}
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
		if (this.channels.size >= this.maxCachedChannels) {
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
		for (let waitedMs = 0; waitedMs < 500; waitedMs += 25) {
			await new Promise((resolve) => setTimeout(resolve, 25));
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
			}, this.subscribeTimeoutMs);
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
				}, this.subscribeTimeoutMs);
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
						this.sendTimeoutMs
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
	 * before then would wait out the whole subscribe deadline. Bounded by it.
	 */
	private async waitForRemoval(removal: Promise<void>): Promise<void> {
		let timer: NodeJS.Timeout | null = null;
		try {
			await Promise.race([
				removal,
				new Promise<void>((resolve) => {
					timer = setTimeout(resolve, this.subscribeTimeoutMs);
				})
			]);
		} finally {
			if (timer) clearTimeout(timer);
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
		this.attemptFailureStreak = 0;
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
		this.attemptFailureStreak += 1;
		if (this.shouldLog(this.attemptFailureStreak)) {
			this.safeLog({
				event: 'agentic_chat_realtime_attempt_failed',
				phase,
				status,
				error: realtimeDiagnosticText(error),
				errorCode: realtimeErrorCode(error),
				failuresInStreak: this.attemptFailureStreak,
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
			(previousFailureAtMs !== null && nowMs - previousFailureAtMs > this.selfHealAfterMs)
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
			failingForMs < this.selfHealAfterMs ||
			this.subscribeFailuresInWindow < MIN_SUBSCRIBE_FAILURES_FOR_SELF_HEAL
		) {
			return;
		}
		if (
			this.lastConnectionResetAtMs !== null &&
			nowMs - this.lastConnectionResetAtMs < this.selfHealCooldownMs
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
			failuresInStreak: this.attemptFailureStreak,
			socketState,
			connectionResets: this.connectionResets
		});
	}

	private shouldLog(streak: number): boolean {
		return streak === 1 || streak % this.failureLogEvery === 0;
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

	private transitionTo(status: AgenticChatRealtimeHealthV1['status']): void {
		if (this.status === status) return;
		this.status = status;
		this.lastTransitionAt = new Date().toISOString();
	}
}
