// apps/web/src/lib/services/agentic-chat-v2/worker-realtime-channel.ts
import {
	AGENTIC_CHAT_REALTIME_RECONCILE_EVENT,
	AGENTIC_CHAT_REALTIME_STREAM_EVENT
} from '@buildos/shared-types';
import { AgenticChatWorkerRealtimeInbox } from './worker-realtime-inbox';

export type AgenticChatWorkerChannelStatus =
	| 'idle'
	| 'connecting'
	| 'subscribed'
	| 'unavailable'
	| 'closed';

export type AgenticChatRealtimeSubscribeStatus =
	| 'SUBSCRIBED'
	| 'TIMED_OUT'
	| 'CLOSED'
	| 'CHANNEL_ERROR';

export type AgenticChatRealtimeChannelLike = {
	on(
		type: 'broadcast',
		filter: { event: string },
		callback: (message: unknown) => void
	): AgenticChatRealtimeChannelLike;
	subscribe(
		callback: (status: AgenticChatRealtimeSubscribeStatus, error?: Error) => void
	): AgenticChatRealtimeChannelLike;
};

export type AgenticChatRealtimeClientLike = {
	channel(
		topic: string,
		options: { config: { private: true; broadcast: { self: false } } }
	): AgenticChatRealtimeChannelLike;
	removeChannel(channel: AgenticChatRealtimeChannelLike): PromiseLike<unknown>;
};

export class AgenticChatWorkerRealtimeChannel {
	#status: AgenticChatWorkerChannelStatus = 'idle';
	#topic: string | null = null;
	#channel: AgenticChatRealtimeChannelLike | null = null;
	#epoch = 0;
	#hasSubscribed = false;
	#closedReconnectTimer: ReturnType<typeof setTimeout> | null = null;
	#pendingConnectTopic: string | null = null;
	#pendingConnect: Promise<void> | null = null;

	constructor(
		private readonly client: AgenticChatRealtimeClientLike,
		private readonly inbox: AgenticChatWorkerRealtimeInbox,
		private readonly onStatus?: (status: AgenticChatWorkerChannelStatus, error?: Error) => void,
		private readonly closedReconnectDelayMs = 1_000
	) {
		if (!Number.isSafeInteger(closedReconnectDelayMs) || closedReconnectDelayMs < 1) {
			throw new Error('closedReconnectDelayMs must be a positive safe integer');
		}
	}

	get status(): AgenticChatWorkerChannelStatus {
		return this.#status;
	}

	get topic(): string | null {
		return this.#topic;
	}

	connect(userId: string): Promise<void> {
		if (!isAgenticChatRealtimeUserId(userId)) {
			return Promise.reject(new Error('Invalid Agentic Chat Realtime user id'));
		}
		const topic = `chat-user:${userId.toLowerCase()}`;
		if (this.#channel && this.#topic === topic && this.#status !== 'closed') {
			return Promise.resolve();
		}
		if (this.#pendingConnect && this.#pendingConnectTopic === topic) {
			return this.#pendingConnect;
		}

		const predecessor = this.#pendingConnect;
		const operation = (async () => {
			if (predecessor) {
				try {
					await predecessor;
				} catch {
					// A newer connect can recover after an earlier lifecycle failure.
				}
			}
			if (this.#channel && this.#topic === topic && this.#status !== 'closed') return;
			await this.#connectNow(userId, topic);
		})();
		this.#pendingConnectTopic = topic;
		this.#pendingConnect = operation;
		const clearPending = () => {
			if (this.#pendingConnect !== operation) return;
			this.#pendingConnect = null;
			this.#pendingConnectTopic = null;
		};
		void operation.then(clearPending, clearPending);
		return operation;
	}

	async #connectNow(userId: string, topic: string): Promise<void> {
		const reconnectingClosedTopic =
			this.#topic === topic && this.#status === 'unavailable' && this.#hasSubscribed;
		this.#clearClosedReconnect();
		let channel: AgenticChatRealtimeChannelLike | null = null;
		try {
			await this.#removeCurrent('idle');

			const epoch = ++this.#epoch;
			this.#topic = topic;
			this.#hasSubscribed = reconnectingClosedTopic;
			this.#setStatus('connecting');
			const nextChannel = this.client.channel(topic, {
				config: { private: true, broadcast: { self: false } }
			});
			channel = nextChannel;
			nextChannel.on(
				'broadcast',
				{ event: AGENTIC_CHAT_REALTIME_STREAM_EVENT },
				(message) => {
					if (epoch !== this.#epoch) return;
					this.inbox.receiveStreamEvent(broadcastPayload(message));
				}
			);
			nextChannel.on(
				'broadcast',
				{ event: AGENTIC_CHAT_REALTIME_RECONCILE_EVENT },
				(message) => {
					if (epoch !== this.#epoch) return;
					this.inbox.receiveReconcileHint(broadcastPayload(message));
				}
			);
			this.#channel = nextChannel;
			nextChannel.subscribe((status, error) => {
				if (epoch !== this.#epoch) return;
				if (status === 'SUBSCRIBED') {
					const reconnected = this.#hasSubscribed && this.#status !== 'subscribed';
					this.#hasSubscribed = true;
					this.#setStatus('subscribed');
					if (reconnected) this.inbox.notifyChannelReconnected();
					return;
				}
				this.#setStatus('unavailable', error);
				this.inbox.notifyChannelUnavailable();
				if (status === 'CLOSED') {
					if (this.#channel !== nextChannel) return;
					this.#channel = null;
					const reconnectEpoch = ++this.#epoch;
					void Promise.resolve(this.client.removeChannel(nextChannel)).catch(() => {
						// The closed channel is already fenced; reconnect remains authoritative.
					});
					this.#scheduleClosedReconnect(userId, reconnectEpoch);
				}
			});
		} catch (error) {
			this.#epoch += 1;
			if (this.#channel === channel) this.#channel = null;
			this.#topic = null;
			this.#hasSubscribed = false;
			this.#setStatus('unavailable', asError(error));
			this.inbox.notifyChannelUnavailable();
			if (channel) {
				try {
					await this.client.removeChannel(channel);
				} catch {
					// Preserve the original channel-construction failure.
				}
			}
			throw error;
		}
	}

	async close(): Promise<void> {
		this.#clearClosedReconnect();
		const pendingConnect = this.#pendingConnect;
		if (pendingConnect) {
			try {
				await pendingConnect;
			} catch {
				// Removal below still closes any partially opened channel.
			}
		}
		await this.#removeCurrent('closed');
	}

	async #removeCurrent(nextStatus: AgenticChatWorkerChannelStatus): Promise<void> {
		this.#clearClosedReconnect();
		const channel = this.#channel;
		this.#epoch += 1;
		this.#channel = null;
		this.#topic = null;
		this.#hasSubscribed = false;
		this.#setStatus(nextStatus);
		if (channel) await this.client.removeChannel(channel);
	}

	#scheduleClosedReconnect(userId: string, epoch: number): void {
		this.#clearClosedReconnect();
		this.#closedReconnectTimer = setTimeout(() => {
			this.#closedReconnectTimer = null;
			if (epoch !== this.#epoch || this.#status === 'closed') return;
			void this.connect(userId).catch((error) => {
				this.#setStatus('unavailable', asError(error));
			});
		}, this.closedReconnectDelayMs);
	}

	#clearClosedReconnect(): void {
		if (this.#closedReconnectTimer === null) return;
		clearTimeout(this.#closedReconnectTimer);
		this.#closedReconnectTimer = null;
	}

	#setStatus(status: AgenticChatWorkerChannelStatus, error?: Error): void {
		if (this.#status === status && !error) return;
		this.#status = status;
		try {
			this.onStatus?.(status, error);
		} catch {
			// Status observers cannot own the transport lifecycle.
		}
	}
}

function broadcastPayload(message: unknown): unknown {
	if (message === null || typeof message !== 'object' || Array.isArray(message)) return null;
	return (message as Record<string, unknown>).payload;
}

export function isAgenticChatRealtimeUserId(value: string): boolean {
	return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function asError(value: unknown): Error {
	return value instanceof Error ? value : new Error('Agentic Chat Realtime channel failed');
}
