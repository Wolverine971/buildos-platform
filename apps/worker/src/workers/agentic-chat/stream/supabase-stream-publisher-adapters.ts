// apps/worker/src/workers/agentic-chat/stream/supabase-stream-publisher-adapters.ts

import type {
	AgenticChatSemanticEventRpcResultV1,
	AgenticChatStreamDeliveryAckRpcResultV1,
	AgenticChatTextBatchFlushRpcResultV1,
	AgenticChatTextBatchInputV1
} from '@buildos/shared-types';
import type {
	AgenticChatBroadcastMessageV1,
	AgenticChatBroadcastPortV1,
	AgenticChatPersistencePortV1
} from './stream-publisher';
import { agenticChatGenerationWriteFenceArgsV1 } from '../turn/write-fence';

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

export type AgenticChatRealtimeClient = {
	channel(
		topic: string,
		options: { config: { private: true; broadcast: { ack: true } } }
	): AgenticChatRealtimeChannel;
	removeChannel(channel: AgenticChatRealtimeChannel): PromiseLike<unknown>;
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

export class SupabaseAgenticChatBroadcastAdapter implements AgenticChatBroadcastPortV1 {
	private readonly channels = new Map<string, AgenticChatRealtimeChannel>();
	private readonly openingChannels = new Map<string, Promise<AgenticChatRealtimeChannel>>();
	private status: AgenticChatRealtimeHealthV1['status'] = 'idle';
	private lastTransitionAt: string | null = null;
	private consecutiveFailures = 0;
	private closed = false;
	private readonly closeListeners = new Set<() => void>();

	constructor(
		private readonly client: AgenticChatRealtimeClient,
		private readonly maxCachedChannels = 256,
		private readonly subscribeTimeoutMs = 10_000,
		private readonly sendTimeoutMs = 10_000
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
	}

	async publish(message: AgenticChatBroadcastMessageV1): Promise<'sent' | 'failed'> {
		if (this.closed) return 'failed';
		let channel: AgenticChatRealtimeChannel | null = null;
		try {
			channel = await this.channelFor(message.topic);
			const result =
				(await this.sendWithDeadline(
					channel.send({
						type: 'broadcast',
						event: message.event,
						payload: message.payload
					})
				)) === 'ok';
			if (!result) {
				await this.evictChannel(message.topic, channel);
				this.observeFailure();
				return 'failed';
			}
			this.observeConnected();
			return 'sent';
		} catch {
			if (channel && !this.closed) await this.evictChannel(message.topic, channel);
			this.observeFailure();
			return 'failed';
		}
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
		await this.client.removeChannel(channel);
	}

	async close(): Promise<void> {
		this.closed = true;
		for (const listener of [...this.closeListeners]) listener();
		this.closeListeners.clear();
		const channels = [...this.channels.values()];
		this.channels.clear();
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
			if (oldest) {
				this.channels.delete(oldest[0]);
				await this.client.removeChannel(oldest[1]);
			}
		}
		if (this.closed) throw new Error('Realtime adapter is closed');
		const channel = this.client.channel(topic, {
			config: { private: true, broadcast: { ack: true } }
		});
		try {
			await this.subscribe(channel, topic);
			if (this.closed) throw new Error('Realtime adapter closed during subscription');
		} catch (error) {
			try {
				await this.client.removeChannel(channel);
			} catch {
				// Preserve the subscription failure; channel cleanup is best effort.
			}
			throw error;
		}
		this.channels.set(topic, channel);
		return channel;
	}

	private subscribe(channel: AgenticChatRealtimeChannel, topic: string): Promise<void> {
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
				this.observeFailure();
				reject(new Error('Realtime subscription deadline exceeded'));
			}, this.subscribeTimeoutMs);
			removeCloseListener = this.onClose(() => {
				if (settled) return;
				settled = true;
				clearTimeout(timer);
				reject(new Error('Realtime adapter closed during subscription'));
			});
			try {
				channel.subscribe((status, error) => {
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
						this.observeConnected();
						if (settled) return;
						settled = true;
						subscribed = true;
						clearTimeout(timer);
						resolve();
						return;
					}
					this.observeFailure();
					if (settled) {
						// A cached channel can fail after its initial subscription. Evict it
						// so the next durable event attempts a fresh Realtime connection.
						void this.evictChannel(topic, channel);
						return;
					}
					settled = true;
					clearTimeout(timer);
					reject(
						error ??
							new Error(`Realtime channel ${topic} failed to subscribe: ${status}`)
					);
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
		try {
			await this.client.removeChannel(channel);
		} catch {
			// Reconnection must not depend on cleanup of the failed socket.
		}
	}

	private observeConnected(): void {
		if (this.closed) return;
		this.consecutiveFailures = 0;
		this.transitionTo('connected');
	}

	private observeFailure(): void {
		if (this.closed) return;
		this.consecutiveFailures += 1;
		this.transitionTo('degraded');
	}

	private transitionTo(status: AgenticChatRealtimeHealthV1['status']): void {
		if (this.status === status) return;
		this.status = status;
		this.lastTransitionAt = new Date().toISOString();
	}
}
